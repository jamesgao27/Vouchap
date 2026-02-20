-- ============================================================
-- 恢复 suppliers / customers 表及历史数据（供老版本客户端继续使用）
-- 前提：已执行过合并迁移，suppliers/customers 已删，数据在 entities 表；
--       receipts/invoices/inbound/outbound 当前仅有 entity_id。
-- 在 Supabase SQL Editor 中执行。
-- ============================================================

-- 1. 创建 suppliers 表（与 entities 结构一致，老版本用 id 关联）
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_number TEXT,
  phone TEXT,
  address TEXT,
  is_ai_recognized BOOLEAN DEFAULT FALSE,
  merged_into_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(space_id, name)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_space_id ON suppliers(space_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_merged_into_id ON suppliers(merged_into_id) WHERE merged_into_id IS NOT NULL;

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_manage_policy" ON suppliers;
CREATE POLICY "suppliers_manage_policy" ON suppliers
  FOR ALL USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()))
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

-- 2. 从 entities 全量灌入 suppliers（id 一致，老版本 receipts/inbound 的 supplier_id 将指向此 id）
INSERT INTO suppliers (id, space_id, name, tax_number, phone, address, is_ai_recognized, merged_into_id, created_at, updated_at)
SELECT id, space_id, name, tax_number, phone, address, is_ai_recognized, merged_into_id, created_at, updated_at
FROM entities
ON CONFLICT (id) DO NOTHING;

-- 3. 创建 customers 表（与 entities 列对齐，无 merged_into_id；老版本用 customer_id 关联）
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_number TEXT,
  phone TEXT,
  address TEXT,
  is_ai_recognized BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(space_id, name)
);

CREATE INDEX IF NOT EXISTS idx_customers_space_id ON customers(space_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view customers in their spaces" ON customers;
DROP POLICY IF EXISTS "Users can insert customers in their spaces" ON customers;
DROP POLICY IF EXISTS "Users can update customers in their spaces" ON customers;
DROP POLICY IF EXISTS "Users can delete customers in their spaces" ON customers;
CREATE POLICY "Users can view customers in their spaces" ON customers FOR SELECT
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert customers in their spaces" ON customers FOR INSERT
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "Users can update customers in their spaces" ON customers FOR UPDATE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete customers in their spaces" ON customers FOR DELETE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

-- 4. 为每个 entity 生成一条 customer 行（同 space_id+name 一一对应，用于回填 customer_id）
INSERT INTO customers (id, space_id, name, tax_number, phone, address, is_ai_recognized, created_at, updated_at)
SELECT gen_random_uuid(), space_id, name, tax_number, phone, address, is_ai_recognized, created_at, updated_at
FROM entities
ON CONFLICT (space_id, name) DO NOTHING;

-- 5. receipts：加回 supplier_id（及可选 supplier_customer_id），用 entity_id 回填 supplier_id
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS supplier_customer_id UUID;
-- 老包 select 用了 customers!receipts_supplier_customer_id_fkey，必须存在该 FK，否则 PGRST200
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_supplier_customer_id_fkey;
ALTER TABLE receipts ADD CONSTRAINT receipts_supplier_customer_id_fkey
  FOREIGN KEY (supplier_customer_id) REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_supplier_customer_id ON receipts(supplier_customer_id) WHERE supplier_customer_id IS NOT NULL;

UPDATE receipts r
SET supplier_id = r.entity_id
WHERE r.entity_id IS NOT NULL AND (r.supplier_id IS NULL OR r.supplier_id != r.entity_id);

CREATE INDEX IF NOT EXISTS idx_receipts_supplier_id ON receipts(supplier_id) WHERE supplier_id IS NOT NULL;

-- 5b. 老版本若 select 了 supplier_name，需有此列并回填（避免 column does not exist）
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS supplier_name TEXT;
UPDATE receipts r
SET supplier_name = e.name
FROM entities e
WHERE r.entity_id = e.id AND (r.supplier_name IS NULL OR r.supplier_name != e.name);

-- 6. inbound：加回 supplier_id，用 entity_id 回填
ALTER TABLE inbound ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

UPDATE inbound SET supplier_id = entity_id WHERE entity_id IS NOT NULL AND (supplier_id IS NULL OR supplier_id != entity_id);

CREATE INDEX IF NOT EXISTS idx_inbound_supplier_id ON inbound(supplier_id) WHERE supplier_id IS NOT NULL;

-- 7. invoices：加回 customer_id（及可选 customer_supplier_id），按 entity 对应 customer
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_supplier_id UUID;

UPDATE invoices i
SET customer_id = (
  SELECT c.id FROM customers c
  JOIN entities e ON e.id = i.entity_id AND e.space_id = c.space_id AND e.name = c.name
  LIMIT 1
)
WHERE i.entity_id IS NOT NULL AND i.customer_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id) WHERE customer_id IS NOT NULL;

-- 7b. 老版本若 select 了 customer_name，需有此列并回填
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
UPDATE invoices i
SET customer_name = e.name
FROM entities e
WHERE i.entity_id = e.id AND (i.customer_name IS NULL OR i.customer_name != e.name);

-- 8. outbound：加回 customer_id，按 entity 对应到同 space_id+name 的 customer
ALTER TABLE outbound ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

UPDATE outbound o
SET customer_id = (
  SELECT c.id FROM customers c
  JOIN entities e ON e.id = o.entity_id AND e.space_id = c.space_id AND e.name = c.name
  LIMIT 1
)
WHERE o.entity_id IS NOT NULL AND o.customer_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_customer_id ON outbound(customer_id) WHERE customer_id IS NOT NULL;

COMMENT ON TABLE suppliers IS '恢复表，供老版本客户端使用；与 entities 数据同步';
COMMENT ON TABLE customers IS '恢复表，供老版本客户端使用；每行对应 entities 同 space+name';
