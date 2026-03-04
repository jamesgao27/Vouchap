-- ============================================================
-- 数据同步：suppliers + customers → entities（幂等，可重复执行）
-- 目标：新版 app 已全面使用 entity_id，确保旧版 suppliers/customers
--       中的数据正确合并到 entities，四类记账单 entity_id 正确回填。
--
-- 合并规则：
--   suppliers  → entities：同 ID 时以 updated_at 较新的为准
--   customers  → entities：先按 ID 匹配，再按 space_id+name 匹配，
--                           无匹配则以原 customer.id 新建
--   四类记账单 entity_id 为 NULL 时从旧列（supplier_id / customer_id 等）回填
--
-- 适用场景：suppliers 和/或 customers 表仍然存在，四类记账单可能
--           存在旧列（supplier_id/customer_id 等）尚未清理的情况。
--
-- 在 Supabase SQL Editor 中执行（需 service_role 权限）
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- § 1  suppliers → entities
--      suppliers.id = entities.id（一一对应），以 updated_at 较新的为准
-- ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  inserted_count INT := 0;
  updated_count  INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'suppliers'
  ) THEN
    RAISE NOTICE '[§1] suppliers 表不存在，跳过';
    RETURN;
  END IF;

  -- 1a. 将 suppliers 中 entities 里没有的行插入（保留原 ID）
  INSERT INTO entities (
    id, space_id, name, tax_number, phone, address,
    is_ai_recognized, merged_into_id, created_at, updated_at
  )
  SELECT
    s.id, s.space_id, s.name, s.tax_number, s.phone, s.address,
    s.is_ai_recognized,
    -- merged_into_id 同样指向 suppliers.id，与 entities.id 一致，可直接复用
    CASE
      WHEN EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'suppliers' AND column_name = 'merged_into_id')
      THEN s.merged_into_id
      ELSE NULL
    END,
    s.created_at, s.updated_at
  FROM suppliers s
  WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = s.id)
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  -- 1b. 同 ID 存在但 suppliers.updated_at 更新 → 覆盖 entities 字段
  UPDATE entities e
  SET
    name             = s.name,
    tax_number       = s.tax_number,
    phone            = s.phone,
    address          = s.address,
    is_ai_recognized = s.is_ai_recognized,
    merged_into_id   = CASE
                         WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                      WHERE table_name = 'suppliers' AND column_name = 'merged_into_id')
                         THEN s.merged_into_id
                         ELSE e.merged_into_id
                       END,
    updated_at       = s.updated_at
  FROM suppliers s
  WHERE e.id = s.id
    AND s.updated_at > e.updated_at;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RAISE NOTICE '[§1] suppliers → entities：新增 % 条，更新 % 条', inserted_count, updated_count;
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- § 2  customers → entities + 建立 customer_id → entity_id 临时映射
--
--   匹配顺序：
--     ① customer.id 直接命中 entities.id（restore 脚本未运行的旧格式）
--     ② customer.space_id + name 命中已有 entity（同名实体已由 supplier 导入）
--     ③ 上述均无 → 以 customer 原 ID 新建 entity（保持 FK 可追溯）
--
--   冲突更新策略：
--     同 ID / 同 space+name 存在时，仅当 customer.updated_at 更新时才覆盖，
--     且只用非 NULL 字段覆盖（避免用空数据覆盖 supplier 已有的丰富信息）
-- ──────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS _cust_entity_map;
CREATE TEMP TABLE _cust_entity_map (
  customer_id UUID PRIMARY KEY,
  entity_id   UUID NOT NULL
);

DO $$
DECLARE
  r              RECORD;
  eid            UUID;
  inserted_count INT := 0;
  updated_count  INT := 0;
  mapped_count   INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customers'
  ) THEN
    RAISE NOTICE '[§2] customers 表不存在，跳过';
    RETURN;
  END IF;

  FOR r IN
    SELECT id, space_id, name, tax_number, phone, address, is_ai_recognized, created_at, updated_at
    FROM customers
  LOOP
    eid := NULL;

    -- ① 先按 ID 直接匹配
    SELECT id INTO eid FROM entities WHERE id = r.id LIMIT 1;

    IF eid IS NOT NULL THEN
      -- 同 ID 存在：updated_at 更新时才覆盖非 NULL 字段
      UPDATE entities
      SET
        name             = r.name,
        tax_number       = COALESCE(r.tax_number, tax_number),
        phone            = COALESCE(r.phone, phone),
        address          = COALESCE(r.address, address),
        is_ai_recognized = r.is_ai_recognized,
        updated_at       = r.updated_at
      WHERE id = r.id
        AND r.updated_at > updated_at;

      IF FOUND THEN updated_count := updated_count + 1; END IF;

    ELSE
      -- ② 按 space_id + name 匹配（实体已由 supplier 导入但 ID 不同）
      SELECT id INTO eid FROM entities WHERE space_id = r.space_id AND name = r.name LIMIT 1;

      IF eid IS NOT NULL THEN
        -- 同名实体已存在（来自 supplier）：仅用非 NULL 字段补充，updated_at 更新时才覆盖
        UPDATE entities
        SET
          tax_number = COALESCE(r.tax_number, tax_number),
          phone      = COALESCE(r.phone, phone),
          address    = COALESCE(r.address, address),
          updated_at = r.updated_at
        WHERE id = eid
          AND r.updated_at > updated_at;

        IF FOUND THEN updated_count := updated_count + 1; END IF;

      ELSE
        -- ③ 完全新实体：以 customer 原 ID 插入，保持 FK 链路完整
        INSERT INTO entities (
          id, space_id, name, tax_number, phone, address,
          is_ai_recognized, created_at, updated_at
        )
        VALUES (
          r.id, r.space_id, r.name, r.tax_number, r.phone, r.address,
          r.is_ai_recognized, r.created_at, r.updated_at
        )
        ON CONFLICT (id) DO NOTHING;

        eid := r.id;
        inserted_count := inserted_count + 1;
      END IF;
    END IF;

    -- 写入映射表（customer.id → entity.id）
    IF eid IS NOT NULL THEN
      INSERT INTO _cust_entity_map (customer_id, entity_id)
      VALUES (r.id, eid)
      ON CONFLICT (customer_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
      mapped_count := mapped_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '[§2] customers → entities：新增 % 条，更新 % 条，映射 % 条',
    inserted_count, updated_count, mapped_count;
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- § 3  四类记账单 entity_id 回填
--      仅对 entity_id IS NULL 的行进行回填，不影响已有关联
-- ──────────────────────────────────────────────────────────────────────

-- § 3a  receipts（支出单）
--   旧列：supplier_id（→ suppliers.id = entities.id，直接用）
--         supplier_customer_id（→ customers.id，需通过映射表）
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_entity_id
  ON receipts(entity_id) WHERE entity_id IS NOT NULL;

DO $$
DECLARE cnt INT;
BEGIN
  -- 从 supplier_id 回填（supplier.id 与 entity.id 完全一致）
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'supplier_id'
  ) THEN
    UPDATE receipts r
    SET entity_id = r.supplier_id
    FROM entities e
    WHERE r.entity_id IS NULL
      AND r.supplier_id IS NOT NULL
      AND r.supplier_id = e.id;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[§3a] receipts.supplier_id → entity_id：% 条', cnt;
  END IF;

  -- 从 supplier_customer_id 回填（customer_id 需映射）
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'supplier_customer_id'
  ) THEN
    UPDATE receipts r
    SET entity_id = m.entity_id
    FROM _cust_entity_map m
    WHERE r.entity_id IS NULL
      AND r.supplier_customer_id IS NOT NULL
      AND r.supplier_customer_id = m.customer_id;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[§3a] receipts.supplier_customer_id → entity_id（via map）：% 条', cnt;
  END IF;
END $$;

-- § 3b  invoices（收入单）
--   旧列：customer_id（→ customers.id，需映射；或与 entity.id 相同）
--         customer_supplier_id（→ suppliers.id = entities.id，直接用）
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_entity_id
  ON invoices(entity_id) WHERE entity_id IS NOT NULL;

DO $$
DECLARE cnt INT;
BEGIN
  -- 从 customer_id 回填
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'customer_id'
  ) THEN
    UPDATE invoices i
    SET entity_id = COALESCE(
      -- ① customer_id 直接命中 entities.id（旧格式，ID 未变）
      (SELECT e.id FROM entities e WHERE e.id = i.customer_id LIMIT 1),
      -- ② 通过映射表解析（restore 脚本生成的 gen_random_uuid 格式）
      (SELECT m.entity_id FROM _cust_entity_map m WHERE m.customer_id = i.customer_id LIMIT 1)
    )
    WHERE i.entity_id IS NULL
      AND i.customer_id IS NOT NULL;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[§3b] invoices.customer_id → entity_id：% 条', cnt;
  END IF;

  -- 从 customer_supplier_id 回填（该列指向 suppliers/entities，ID 一致）
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'customer_supplier_id'
  ) THEN
    UPDATE invoices i
    SET entity_id = i.customer_supplier_id
    FROM entities e
    WHERE i.entity_id IS NULL
      AND i.customer_supplier_id IS NOT NULL
      AND i.customer_supplier_id = e.id;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[§3b] invoices.customer_supplier_id → entity_id：% 条', cnt;
  END IF;
END $$;

-- § 3c  inbound（入库单）
--   旧列：supplier_id（→ suppliers.id = entities.id，直接用）
ALTER TABLE inbound
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_entity_id
  ON inbound(entity_id) WHERE entity_id IS NOT NULL;

DO $$
DECLARE cnt INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbound' AND column_name = 'supplier_id'
  ) THEN
    UPDATE inbound i
    SET entity_id = i.supplier_id
    FROM entities e
    WHERE i.entity_id IS NULL
      AND i.supplier_id IS NOT NULL
      AND i.supplier_id = e.id;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[§3c] inbound.supplier_id → entity_id：% 条', cnt;
  END IF;
END $$;

-- § 3d  outbound（出库单）
--   旧列：customer_id（→ customers.id，需映射；或与 entity.id 相同）
ALTER TABLE outbound
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_entity_id
  ON outbound(entity_id) WHERE entity_id IS NOT NULL;

DO $$
DECLARE cnt INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbound' AND column_name = 'customer_id'
  ) THEN
    UPDATE outbound o
    SET entity_id = COALESCE(
      (SELECT e.id FROM entities e WHERE e.id = o.customer_id LIMIT 1),
      (SELECT m.entity_id FROM _cust_entity_map m WHERE m.customer_id = o.customer_id LIMIT 1)
    )
    WHERE o.entity_id IS NULL
      AND o.customer_id IS NOT NULL;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[§3d] outbound.customer_id → entity_id：% 条', cnt;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- § 4  同步冗余名称字段（supplier_name / customer_name）
--      确保显示字段与 entity.name 保持一致（仅更新不一致的行）
-- ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE cnt INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'supplier_name'
  ) THEN
    UPDATE receipts r
    SET supplier_name = e.name
    FROM entities e
    WHERE r.entity_id = e.id
      AND r.supplier_name IS DISTINCT FROM e.name;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[§4] receipts.supplier_name 同步：% 条', cnt;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'customer_name'
  ) THEN
    UPDATE invoices i
    SET customer_name = e.name
    FROM entities e
    WHERE i.entity_id = e.id
      AND i.customer_name IS DISTINCT FROM e.name;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[§4] invoices.customer_name 同步：% 条', cnt;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbound' AND column_name = 'supplier_name'
  ) THEN
    UPDATE inbound i
    SET supplier_name = e.name
    FROM entities e
    WHERE i.entity_id = e.id
      AND i.supplier_name IS DISTINCT FROM e.name;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[§4] inbound.supplier_name 同步：% 条', cnt;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbound' AND column_name = 'customer_name'
  ) THEN
    UPDATE outbound o
    SET customer_name = e.name
    FROM entities e
    WHERE o.entity_id = e.id
      AND o.customer_name IS DISTINCT FROM e.name;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[§4] outbound.customer_name 同步：% 条', cnt;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- § 5  数据校验（执行后检查）
-- ──────────────────────────────────────────────────────────────────────

-- 查看迁移后各表 entity_id 未关联的记录数（应均为 0 或合理存量）
SELECT
  'receipts'  AS table_name,
  COUNT(*)    AS total_rows,
  COUNT(entity_id) AS with_entity_id,
  COUNT(*) - COUNT(entity_id) AS missing_entity_id
FROM receipts
UNION ALL
SELECT 'invoices', COUNT(*), COUNT(entity_id), COUNT(*) - COUNT(entity_id) FROM invoices
UNION ALL
SELECT 'inbound',  COUNT(*), COUNT(entity_id), COUNT(*) - COUNT(entity_id) FROM inbound
UNION ALL
SELECT 'outbound', COUNT(*), COUNT(entity_id), COUNT(*) - COUNT(entity_id) FROM outbound;

-- ──────────────────────────────────────────────────────────────────────
-- § 6  清理临时表
-- ──────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS _cust_entity_map;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- 可选清理（谨慎操作，建议确认 § 5 校验结果后手动执行）：
--
-- 删除旧关联列（在 entity_id 已全部回填后可清理）：
-- ALTER TABLE receipts  DROP COLUMN IF EXISTS supplier_id;
-- ALTER TABLE receipts  DROP COLUMN IF EXISTS supplier_customer_id;
-- ALTER TABLE invoices  DROP COLUMN IF EXISTS customer_id;
-- ALTER TABLE invoices  DROP COLUMN IF EXISTS customer_supplier_id;
-- ALTER TABLE inbound   DROP COLUMN IF EXISTS supplier_id;
-- ALTER TABLE outbound  DROP COLUMN IF EXISTS customer_id;
--
-- 删除旧表（在确认所有数据已迁移、旧版本客户端不再使用后执行）：
-- DROP TABLE IF EXISTS suppliers CASCADE;
-- DROP TABLE IF EXISTS customers CASCADE;
-- ══════════════════════════════════════════════════════════════════════
