-- ============================================================
-- 入库/出库明细表去掉名称、单位、规格等冗余字段
-- 名称、单位、规格通过 sku_id 关联 skus 表获取，不再在 item 表存储
-- 无需兼容旧数据（当前无数据），直接删列即可。
--
-- 前置：add-voucher-types-and-skus.sql、add-inbound-outbound-schema-extended.sql 已执行
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- ------------------------------------------------------------
-- 1. 入库单明细 inbound_items
-- ------------------------------------------------------------
ALTER TABLE inbound_items
  DROP COLUMN IF EXISTS product_name,
  DROP COLUMN IF EXISTS unit,
  DROP COLUMN IF EXISTS product_code,
  DROP COLUMN IF EXISTS specification;

COMMENT ON TABLE inbound_items IS '入库单明细，关联 sku_id 获取名称/单位/规格；数量必填';

-- ------------------------------------------------------------
-- 2. 出库单明细 outbound_items
-- ------------------------------------------------------------
ALTER TABLE outbound_items
  DROP COLUMN IF EXISTS product_name,
  DROP COLUMN IF EXISTS unit,
  DROP COLUMN IF EXISTS specification;

COMMENT ON TABLE outbound_items IS '出库单明细，关联 sku_id 获取名称/单位/规格；数量必填';
