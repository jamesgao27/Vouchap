-- 合并逻辑改为“合并指向”字段，不再使用合并历史表
-- 账户/供应商/客户表增加 merged_into_id：指向被合并到的目标 ID；前端列表只展示 merged_into_id IS NULL，小票/发票存原始 ID，提供给大模型的选项仍为全部数据

-- 1. 供应商表：合并指向
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'merged_into_id') THEN
    ALTER TABLE suppliers ADD COLUMN merged_into_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_suppliers_merged_into_id ON suppliers(space_id, merged_into_id);
  END IF;
END $$;

-- 2. 账户表：合并指向
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'merged_into_id') THEN
    ALTER TABLE accounts ADD COLUMN merged_into_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_accounts_merged_into_id ON accounts(space_id, merged_into_id);
  END IF;
END $$;

-- 3. 客户表：合并指向
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'merged_into_id') THEN
    ALTER TABLE customers ADD COLUMN merged_into_id UUID REFERENCES customers(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_customers_merged_into_id ON customers(space_id, merged_into_id);
  END IF;
END $$;

COMMENT ON COLUMN suppliers.merged_into_id IS '合并指向：该记录已并入的目标供应商 ID，NULL 表示未被合并';
COMMENT ON COLUMN accounts.merged_into_id IS '合并指向：该记录已并入的目标账户 ID，NULL 表示未被合并';
COMMENT ON COLUMN customers.merged_into_id IS '合并指向：该记录已并入的目标客户 ID，NULL 表示未被合并';
