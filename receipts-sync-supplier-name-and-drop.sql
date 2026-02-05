-- 小票供应商：1) 按文字名称查找或创建供应商并回填 supplier_id  2) 有 ID 的刷名称  3) 删 supplier_name 列
-- 若 receipts.supplier_name 为 NOT NULL，请先执行本脚本再部署新应用。

-- ========== 第一步：小票有 supplier_name 但无 supplier_id / supplier_customer_id 时，按名称查找或创建供应商并回填 ID ==========

-- 1a. 为「仅有文字、无 ID」的小票，在供应商表中创建缺失的供应商（按 space_id + trim(supplier_name) 去重）
INSERT INTO suppliers (space_id, name, is_ai_recognized)
SELECT DISTINCT r.space_id, trim(r.supplier_name), true
FROM receipts r
LEFT JOIN suppliers s ON s.space_id = r.space_id AND s.name = trim(r.supplier_name) AND (s.merged_into_id IS NULL)
WHERE r.supplier_id IS NULL
  AND r.supplier_customer_id IS NULL
  AND r.supplier_name IS NOT NULL
  AND trim(r.supplier_name) != ''
  AND s.id IS NULL;

-- 1b. 把上述小票的 supplier_id 设为对应供应商 ID（同一 space 下同名取一个供应商，merged_into_id 为空）
UPDATE receipts r
SET supplier_id = s.id
FROM (
  SELECT DISTINCT ON (space_id, name) id, space_id, name
  FROM suppliers
  WHERE merged_into_id IS NULL
) s
WHERE r.space_id = s.space_id
  AND trim(r.supplier_name) = s.name
  AND r.supplier_id IS NULL
  AND r.supplier_customer_id IS NULL
  AND r.supplier_name IS NOT NULL
  AND trim(r.supplier_name) != '';

-- ========== 第二步：有 supplier_id 的，把 supplier_name 刷成供应商表里的名称（以 ID 为准） ==========
UPDATE receipts r
SET supplier_name = s.name
FROM suppliers s
WHERE r.supplier_id = s.id
  AND r.supplier_id IS NOT NULL;

-- ========== 第三步：有 supplier_customer_id 的，把 supplier_name 刷成客户表里的名称（以 ID 为准） ==========
UPDATE receipts r
SET supplier_name = c.name
FROM customers c
WHERE r.supplier_customer_id = c.id
  AND r.supplier_customer_id IS NOT NULL;

-- ========== 第四步：去掉名称字段，以后以 ID 解析展示 ==========
ALTER TABLE receipts DROP COLUMN IF EXISTS supplier_name;
