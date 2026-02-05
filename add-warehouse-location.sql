-- ============================================================
-- 仓库与仓位：warehouse（仓库）、location（仓位）
-- 一个仓库可有多个仓位
-- 在 Supabase SQL Editor 中执行此脚本
--
-- 前置：需已存在 spaces, user_spaces 及 update_updated_at_column() 函数。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 仓库表 warehouse
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouse (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,                    -- 仓库编码，可选
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(space_id, code)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_space_id ON warehouse(space_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_code ON warehouse(space_id, code) WHERE code IS NOT NULL;

-- ------------------------------------------------------------
-- 2. 仓位表 location（归属仓库，一个仓库多个仓位）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS location (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,                    -- 仓位编码，可选
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(warehouse_id, code)
);

CREATE INDEX IF NOT EXISTS idx_location_warehouse_id ON location(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_location_code ON location(warehouse_id, code) WHERE code IS NOT NULL;

-- ------------------------------------------------------------
-- 3. updated_at 触发器
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS update_warehouse_updated_at ON warehouse;
CREATE TRIGGER update_warehouse_updated_at BEFORE UPDATE ON warehouse
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_location_updated_at ON location;
CREATE TRIGGER update_location_updated_at BEFORE UPDATE ON location
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 4. 启用 RLS
-- ------------------------------------------------------------
ALTER TABLE warehouse ENABLE ROW LEVEL SECURITY;
ALTER TABLE location ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 5. RLS 策略（按 space_id + user_spaces）
-- ------------------------------------------------------------

-- warehouse
DROP POLICY IF EXISTS "warehouse_select_policy" ON warehouse;
DROP POLICY IF EXISTS "warehouse_insert_policy" ON warehouse;
DROP POLICY IF EXISTS "warehouse_update_policy" ON warehouse;
DROP POLICY IF EXISTS "warehouse_delete_policy" ON warehouse;
CREATE POLICY "warehouse_select_policy" ON warehouse FOR SELECT
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "warehouse_insert_policy" ON warehouse FOR INSERT
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "warehouse_update_policy" ON warehouse FOR UPDATE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "warehouse_delete_policy" ON warehouse FOR DELETE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

-- location（通过 warehouse 归属 space）
DROP POLICY IF EXISTS "location_select_policy" ON location;
DROP POLICY IF EXISTS "location_insert_policy" ON location;
DROP POLICY IF EXISTS "location_update_policy" ON location;
DROP POLICY IF EXISTS "location_delete_policy" ON location;
CREATE POLICY "location_select_policy" ON location FOR SELECT
  USING (EXISTS (SELECT 1 FROM warehouse w WHERE w.id = location.warehouse_id AND w.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "location_insert_policy" ON location FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM warehouse w WHERE w.id = location.warehouse_id AND w.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "location_update_policy" ON location FOR UPDATE
  USING (EXISTS (SELECT 1 FROM warehouse w WHERE w.id = location.warehouse_id AND w.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "location_delete_policy" ON location FOR DELETE
  USING (EXISTS (SELECT 1 FROM warehouse w WHERE w.id = location.warehouse_id AND w.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));

-- ------------------------------------------------------------
-- 6. 注释
-- ------------------------------------------------------------
COMMENT ON TABLE warehouse IS '仓库；一个空间下可有多个仓库';
COMMENT ON TABLE location IS '仓位；一个仓库下可有多个仓位';
COMMENT ON COLUMN location.warehouse_id IS '所属仓库';
