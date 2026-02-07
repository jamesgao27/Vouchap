-- SKU、仓库、仓位合并指向：与账户/供应商/客户一致
-- 只改指向、不改原始数据，便于取消指向“复原分开”。列表只展示 merged_into_id IS NULL；选单/大模型选项可含全部。
-- 合并时仅设 merged_into_id，不删记录、不改出入库/仓位等；仓位仍归属原仓库，前端通过“解析到目标仓库”的查询包含被合并仓库下的仓位。

-- 1. SKU 表
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'merged_into_id') THEN
    ALTER TABLE skus ADD COLUMN merged_into_id UUID REFERENCES skus(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_skus_merged_into_id ON skus(space_id, merged_into_id);
  END IF;
END $$;

-- 2. 仓库表（表名为 warehouse）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'warehouse' AND column_name = 'merged_into_id') THEN
    ALTER TABLE warehouse ADD COLUMN merged_into_id UUID REFERENCES warehouse(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_warehouse_merged_into_id ON warehouse(space_id, merged_into_id);
  END IF;
END $$;

-- 3. 仓位表（合并在同一仓库内）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'location' AND column_name = 'merged_into_id') THEN
    ALTER TABLE location ADD COLUMN merged_into_id UUID REFERENCES location(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_location_merged_into_id ON location(warehouse_id, merged_into_id);
  END IF;
END $$;

COMMENT ON COLUMN skus.merged_into_id IS '合并指向：该记录已并入的目标 SKU ID，NULL 表示未被合并';
COMMENT ON COLUMN warehouse.merged_into_id IS '合并指向：该记录已并入的目标仓库 ID，NULL 表示未被合并';
COMMENT ON COLUMN location.merged_into_id IS '合并指向：该记录已并入的目标仓位 ID（同仓库内），NULL 表示未被合并';
