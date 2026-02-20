-- ============================================================
-- 迁移：suppliers + customers 合并为 entities
-- 支出/收入/入库/出库统一用 entity_id（Payee/Payer/Sender/Receiver）
-- 执行前请备份。在 Supabase SQL Editor 中执行。
-- ============================================================

-- 1. 创建 entities 表（与 suppliers 同结构，去掉 is_customer）
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_number TEXT,
  phone TEXT,
  address TEXT,
  is_ai_recognized BOOLEAN DEFAULT FALSE,
  merged_into_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(space_id, name)
);

CREATE INDEX IF NOT EXISTS idx_entities_space_id ON entities(space_id);
CREATE INDEX IF NOT EXISTS idx_entities_merged_into_id ON entities(merged_into_id) WHERE merged_into_id IS NOT NULL;

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view entities in their spaces"
  ON entities FOR SELECT
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert entities in their spaces"
  ON entities FOR INSERT
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can update entities in their spaces"
  ON entities FOR UPDATE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete entities in their spaces"
  ON entities FOR DELETE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

COMMENT ON TABLE entities IS '统一关联方（原供应商+客户），用于支出Payee/收入Payer/入库Sender/出库Receiver';

-- 2. 临时映射表：customer_id -> entity_id（不设 FK 到 customers 以便后续删表）
CREATE TABLE IF NOT EXISTS _customer_entity_mapping (
  customer_id UUID PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE
);

-- 3. 将 suppliers 数据迁入 entities（保留原 id）
INSERT INTO entities (id, space_id, name, tax_number, phone, address, is_ai_recognized, merged_into_id, created_at, updated_at)
SELECT id, space_id, name, tax_number, phone, address, is_ai_recognized, merged_into_id, created_at, updated_at
FROM suppliers
ON CONFLICT (id) DO NOTHING;

-- 4. 将 customers 迁入 entities 并填充映射（同 space+name 则复用已有 entity）
DO $$
DECLARE
  r RECORD;
  eid UUID;
BEGIN
  FOR r IN SELECT c.id, c.space_id, c.name, c.tax_number, c.phone, c.address, c.is_ai_recognized, c.created_at, c.updated_at FROM customers c
  LOOP
    INSERT INTO entities (id, space_id, name, tax_number, phone, address, is_ai_recognized, created_at, updated_at)
    VALUES (gen_random_uuid(), r.space_id, r.name, r.tax_number, r.phone, r.address, r.is_ai_recognized, r.created_at, r.updated_at)
    ON CONFLICT (space_id, name) DO NOTHING;

    SELECT id INTO eid FROM entities WHERE space_id = r.space_id AND name = r.name LIMIT 1;
    IF eid IS NOT NULL THEN
      INSERT INTO _customer_entity_mapping (customer_id, entity_id) VALUES (r.id, eid)
      ON CONFLICT (customer_id) DO UPDATE SET entity_id = eid;
    END IF;
  END LOOP;
END $$;

-- 5a. receipts：添加 entity_id，回填后删旧列
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

UPDATE receipts r
SET entity_id = COALESCE(
  r.supplier_id,
  (SELECT m.entity_id FROM _customer_entity_mapping m WHERE m.customer_id = r.supplier_customer_id)
)
WHERE r.entity_id IS NULL AND (r.supplier_id IS NOT NULL OR r.supplier_customer_id IS NOT NULL);

ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_supplier_id_fkey;
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_supplier_customer_id_fkey;
ALTER TABLE receipts DROP COLUMN IF EXISTS supplier_id;
ALTER TABLE receipts DROP COLUMN IF EXISTS supplier_customer_id;

CREATE INDEX IF NOT EXISTS idx_receipts_entity_id ON receipts(entity_id) WHERE entity_id IS NOT NULL;

-- 5b. invoices：添加 entity_id，回填后删旧列
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

UPDATE invoices i
SET entity_id = COALESCE(
  i.customer_supplier_id,
  (SELECT m.entity_id FROM _customer_entity_mapping m WHERE m.customer_id = i.customer_id)
)
WHERE i.entity_id IS NULL AND (i.customer_id IS NOT NULL OR i.customer_supplier_id IS NOT NULL);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_customer_id_fkey;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_customer_supplier_id_fkey;
ALTER TABLE invoices DROP COLUMN IF EXISTS customer_id;
ALTER TABLE invoices DROP COLUMN IF EXISTS customer_supplier_id;

CREATE INDEX IF NOT EXISTS idx_invoices_entity_id ON invoices(entity_id) WHERE entity_id IS NOT NULL;

-- 5c. inbound：添加 entity_id（sender），回填后删 supplier_id
ALTER TABLE inbound ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

UPDATE inbound SET entity_id = supplier_id WHERE entity_id IS NULL AND supplier_id IS NOT NULL;

ALTER TABLE inbound DROP CONSTRAINT IF EXISTS inbound_supplier_id_fkey;
ALTER TABLE inbound DROP COLUMN IF EXISTS supplier_id;

CREATE INDEX IF NOT EXISTS idx_inbound_entity_id ON inbound(entity_id) WHERE entity_id IS NOT NULL;

-- 5d. outbound：添加 entity_id（receiver），回填后删 customer_id
ALTER TABLE outbound ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

UPDATE outbound o
SET entity_id = (SELECT m.entity_id FROM _customer_entity_mapping m WHERE m.customer_id = o.customer_id)
WHERE o.entity_id IS NULL AND o.customer_id IS NOT NULL;

ALTER TABLE outbound DROP CONSTRAINT IF EXISTS outbound_customer_id_fkey;
ALTER TABLE outbound DROP COLUMN IF EXISTS customer_id;

CREATE INDEX IF NOT EXISTS idx_outbound_entity_id ON outbound(entity_id) WHERE entity_id IS NOT NULL;

-- 6. 可选：冗余名称列（若原表有 supplier_name/customer_name 可迁移到 payee_name/payer_name 等后删除）
-- ALTER TABLE receipts ADD COLUMN IF NOT EXISTS payee_name TEXT;
-- UPDATE receipts SET payee_name = supplier_name WHERE payee_name IS NULL AND supplier_name IS NOT NULL;
-- ALTER TABLE receipts DROP COLUMN IF EXISTS supplier_name;
-- ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payer_name TEXT;
-- UPDATE invoices SET payer_name = customer_name WHERE payer_name IS NULL AND customer_name IS NOT NULL;
-- ALTER TABLE invoices DROP COLUMN IF EXISTS customer_name;

-- 7. 删除临时表与旧表
DROP TABLE IF EXISTS _customer_entity_mapping;
DROP TABLE IF EXISTS supplier_merge_history CASCADE;
DROP TABLE IF EXISTS customer_merge_history CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
