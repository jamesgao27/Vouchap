-- ============================================================
-- 出入库表结构扩展：最大兼容各种入库单/出库单样例
-- 基础数据均关联基础表（suppliers/customers/warehouse/location/skus/users）
-- 数量、金额等直接存在实体表
--
-- 前置：需已执行 add-voucher-types-and-skus.sql、add-warehouse-location.sql
--       即存在 inbound, inbound_items, outbound, outbound_items, warehouse, location, skus, suppliers, customers, users
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- ------------------------------------------------------------
-- 1. 入库单 inbound 表头扩展
-- ------------------------------------------------------------
-- 仓库、仓位（关联基础表）
ALTER TABLE inbound
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES location(id) ON DELETE SET NULL;

-- 入库类型/类别（如：生产入库、采购入库）
ALTER TABLE inbound ADD COLUMN IF NOT EXISTS inbound_type TEXT;
-- 合计金额大写（如：肆仟零佰叁拾零元）
ALTER TABLE inbound ADD COLUMN IF NOT EXISTS total_amount_chinese TEXT;
-- 经手人、库管员、记账（关联 users；名称用于 AI 识别暂存，未解析为 user 时显示）
ALTER TABLE inbound
  ADD COLUMN IF NOT EXISTS handler_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handler_name TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_keeper_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_keeper_name TEXT,
  ADD COLUMN IF NOT EXISTS accountant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accountant_name TEXT;
-- 整单备注
ALTER TABLE inbound ADD COLUMN IF NOT EXISTS remarks TEXT;

CREATE INDEX IF NOT EXISTS idx_inbound_warehouse_id ON inbound(warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbound_location_id ON inbound(location_id) WHERE location_id IS NOT NULL;

COMMENT ON COLUMN inbound.warehouse_id IS '入库仓库，关联 warehouse';
COMMENT ON COLUMN inbound.location_id IS '入库仓位/存放位置，关联 location';
COMMENT ON COLUMN inbound.inbound_type IS '入库类型：生产入库、采购入库等';
COMMENT ON COLUMN inbound.total_amount_chinese IS '合计金额大写';
COMMENT ON COLUMN inbound.handler_id IS '经手人，关联 users';
COMMENT ON COLUMN inbound.handler_name IS '经手人姓名（AI 识别或手填）';
COMMENT ON COLUMN inbound.warehouse_keeper_id IS '库管员，关联 users';
COMMENT ON COLUMN inbound.warehouse_keeper_name IS '库管员姓名（AI 识别或手填）';
COMMENT ON COLUMN inbound.accountant_id IS '记账，关联 users';
COMMENT ON COLUMN inbound.accountant_name IS '记账姓名（AI 识别或手填）';
COMMENT ON COLUMN inbound.remarks IS '整单备注';

-- ------------------------------------------------------------
-- 2. 入库单明细 inbound_items 扩展
-- ------------------------------------------------------------
-- 行号、产品编码（原始或与 sku 对应）、规格型号
ALTER TABLE inbound_items
  ADD COLUMN IF NOT EXISTS line_no INTEGER,
  ADD COLUMN IF NOT EXISTS product_code TEXT,
  ADD COLUMN IF NOT EXISTS specification TEXT;
-- 行金额（直接存储，数量×单价可校验）
ALTER TABLE inbound_items ADD COLUMN IF NOT EXISTS amount DECIMAL(12, 4);
-- 合格品/次品数量（部分单据有分拆）
ALTER TABLE inbound_items
  ADD COLUMN IF NOT EXISTS qualified_quantity DECIMAL(12, 4),
  ADD COLUMN IF NOT EXISTS defective_quantity DECIMAL(12, 4);
-- 本行仓位（若按货位分拆）、行备注
ALTER TABLE inbound_items
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES location(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remarks TEXT;

CREATE INDEX IF NOT EXISTS idx_inbound_items_location_id ON inbound_items(location_id) WHERE location_id IS NOT NULL;

COMMENT ON COLUMN inbound_items.line_no IS '序号/行号';
COMMENT ON COLUMN inbound_items.product_code IS '货号/产品编码';
COMMENT ON COLUMN inbound_items.specification IS '规格/型号规格';
COMMENT ON COLUMN inbound_items.amount IS '行金额，直接存储';
COMMENT ON COLUMN inbound_items.qualified_quantity IS '合格品数量';
COMMENT ON COLUMN inbound_items.defective_quantity IS '次品数量';
COMMENT ON COLUMN inbound_items.location_id IS '本行货位，关联 location';
COMMENT ON COLUMN inbound_items.remarks IS '行备注';

-- ------------------------------------------------------------
-- 3. 出库单 outbound 表头扩展
-- ------------------------------------------------------------
-- 仓库、仓位（若尚未执行 add-outbound-warehouse-location.sql 则此处一并添加）
ALTER TABLE outbound
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES location(id) ON DELETE SET NULL;
-- 客户关联基础表（原仅有 customer_name）
ALTER TABLE outbound ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
-- 税额/增值税合计
ALTER TABLE outbound ADD COLUMN IF NOT EXISTS total_tax DECIMAL(10, 2);
-- 经手人、制票、记账（关联 users；名称用于 AI 识别暂存）
ALTER TABLE outbound
  ADD COLUMN IF NOT EXISTS handler_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handler_name TEXT,
  ADD COLUMN IF NOT EXISTS preparer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preparer_name TEXT,
  ADD COLUMN IF NOT EXISTS accountant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accountant_name TEXT;
-- 整单备注
ALTER TABLE outbound ADD COLUMN IF NOT EXISTS remarks TEXT;

CREATE INDEX IF NOT EXISTS idx_outbound_warehouse_id ON outbound(warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_location_id ON outbound(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_customer_id ON outbound(customer_id) WHERE customer_id IS NOT NULL;

COMMENT ON COLUMN outbound.warehouse_id IS '出库仓库，关联 warehouse';
COMMENT ON COLUMN outbound.location_id IS '出库仓位，关联 location';
COMMENT ON COLUMN outbound.customer_id IS '客户，关联 customers';
COMMENT ON COLUMN outbound.total_tax IS '税额/增值税合计';
COMMENT ON COLUMN outbound.handler_id IS '经手人，关联 users';
COMMENT ON COLUMN outbound.handler_name IS '经手人姓名（AI 识别或手填）';
COMMENT ON COLUMN outbound.preparer_id IS '制票，关联 users';
COMMENT ON COLUMN outbound.preparer_name IS '制票姓名（AI 识别或手填）';
COMMENT ON COLUMN outbound.accountant_id IS '记账，关联 users';
COMMENT ON COLUMN outbound.accountant_name IS '记账姓名（AI 识别或手填）';
COMMENT ON COLUMN outbound.remarks IS '整单备注';

-- ------------------------------------------------------------
-- 4. 出库单明细 outbound_items 扩展
-- ------------------------------------------------------------
-- 行号、规格
ALTER TABLE outbound_items
  ADD COLUMN IF NOT EXISTS line_no INTEGER,
  ADD COLUMN IF NOT EXISTS specification TEXT;
-- 行金额、供应价、增值税（直接存储）
ALTER TABLE outbound_items
  ADD COLUMN IF NOT EXISTS amount DECIMAL(12, 4),
  ADD COLUMN IF NOT EXISTS supply_price DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS tax DECIMAL(10, 2);
-- 行备注
ALTER TABLE outbound_items ADD COLUMN IF NOT EXISTS remarks TEXT;

COMMENT ON COLUMN outbound_items.line_no IS '序号/行号';
COMMENT ON COLUMN outbound_items.specification IS '规格';
COMMENT ON COLUMN outbound_items.amount IS '行金额，直接存储';
COMMENT ON COLUMN outbound_items.supply_price IS '供应价';
COMMENT ON COLUMN outbound_items.tax IS '本行增值税';
COMMENT ON COLUMN outbound_items.remarks IS '行备注';

-- ------------------------------------------------------------
-- 执行顺序建议
-- ------------------------------------------------------------
-- 1. 先有：spaces, users, user_spaces, suppliers, customers, update_updated_at_column()
-- 2. add-voucher-types-and-skus.sql（建 skus, inbound, inbound_items, outbound, outbound_items）
-- 3. add-warehouse-location.sql（建 warehouse, location）
-- 4. 本脚本：add-inbound-outbound-schema-extended.sql（扩展出入库表字段）
