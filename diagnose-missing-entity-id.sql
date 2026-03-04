-- ============================================================
-- 诊断：四类记账单 entity_id 缺失原因排查
-- 执行结果将帮助确定下一步修复方向
-- ============================================================

-- ── 1. receipts：缺失 entity_id 的记录有哪些旧列及其值 ──────────────
SELECT
  'receipts' AS tbl,
  r.id,
  r.created_at::DATE AS date,
  -- 检查是否还残留旧列（没有则会报错，用 DO 块包裹更安全；此处先直接查）
  CASE WHEN r.supplier_name IS NOT NULL THEN r.supplier_name ELSE NULL END AS supplier_name,
  -- 以下列若不存在会报错，注释掉，用后面的 information_schema 方式
  r.entity_id,
  r.status
FROM receipts r
WHERE r.entity_id IS NULL
ORDER BY r.created_at DESC
LIMIT 30;

-- ── 2. 检查 receipts 还剩哪些旧关联列 ──────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'receipts'
  AND column_name IN ('supplier_id', 'supplier_customer_id', 'supplier_name', 'entity_id')
ORDER BY column_name;

-- ── 3. invoices：缺失 entity_id 的记录 ──────────────────────────────
SELECT
  'invoices' AS tbl,
  i.id,
  i.created_at::DATE AS date,
  CASE WHEN i.customer_name IS NOT NULL THEN i.customer_name ELSE NULL END AS customer_name,
  i.entity_id,
  i.status
FROM invoices i
WHERE i.entity_id IS NULL
ORDER BY i.created_at DESC
LIMIT 20;

-- ── 4. 检查 invoices 还剩哪些旧关联列 ──────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'invoices'
  AND column_name IN ('customer_id', 'customer_supplier_id', 'customer_name', 'entity_id')
ORDER BY column_name;

-- ── 5. outbound：缺失 entity_id 的记录 ─────────────────────────────
SELECT
  'outbound' AS tbl,
  o.id,
  o.created_at::DATE AS date,
  o.entity_id,
  o.status
FROM outbound o
WHERE o.entity_id IS NULL;

-- ── 6. 检查 outbound 还剩哪些旧关联列 ──────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'outbound'
  AND column_name IN ('customer_id', 'customer_name', 'entity_id')
ORDER BY column_name;

-- ── 7. 查看 entities 总量及各 space 分布 ────────────────────────────
SELECT space_id, COUNT(*) AS entity_count FROM entities GROUP BY space_id;

-- ── 8. 检查 suppliers / customers 表是否还存在 ──────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('suppliers', 'customers');

-- ── 9. 如果 supplier_name / customer_name 列还在：
--      尝试通过名称在 entities 中找到匹配（看是否能用名称修复）
SELECT
  r.id AS receipt_id,
  r.supplier_name,
  e.id AS matched_entity_id,
  e.name AS entity_name,
  e.space_id
FROM receipts r
LEFT JOIN entities e ON e.space_id = r.space_id AND e.name = r.supplier_name
WHERE r.entity_id IS NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'supplier_name'
  )
ORDER BY r.created_at DESC
LIMIT 30;

SELECT
  i.id AS invoice_id,
  i.customer_name,
  e.id AS matched_entity_id,
  e.name AS entity_name,
  e.space_id
FROM invoices i
LEFT JOIN entities e ON e.space_id = i.space_id AND e.name = i.customer_name
WHERE i.entity_id IS NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'customer_name'
  )
ORDER BY i.created_at DESC
LIMIT 20;

SELECT
  o.id AS outbound_id,
  o.customer_name,
  e.id AS matched_entity_id,
  e.name AS entity_name
FROM outbound o
LEFT JOIN entities e ON e.space_id = o.space_id AND e.name = o.customer_name
WHERE o.entity_id IS NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbound' AND column_name = 'customer_name'
  );
