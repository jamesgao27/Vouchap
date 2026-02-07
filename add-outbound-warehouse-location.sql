-- 为 outbound 表增加仓库、仓位字段（与入库单一致）
-- 在 Supabase SQL Editor 中执行；需已存在 warehouse、location 表。

-- PostgreSQL 9.5+ 支持 IF NOT EXISTS
ALTER TABLE outbound
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES location(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_warehouse_id ON outbound(warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_location_id ON outbound(location_id) WHERE location_id IS NOT NULL;

COMMENT ON COLUMN outbound.warehouse_id IS '出库仓库';
COMMENT ON COLUMN outbound.location_id IS '出库仓位';
