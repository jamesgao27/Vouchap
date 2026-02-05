-- 【已废弃】本方案使用合并历史表。当前逻辑已改为“合并指向”字段，请使用 merge-via-merged-into-id.sql。
-- 合并历史按 ID 解析：增加 source_supplier_id / source_account_id，新建 customer_merge_history

-- 1. supplier_merge_history 增加 source_supplier_id（用于按 ID 解析，源供应商会被删除故不设 FK）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'supplier_merge_history' AND column_name = 'source_supplier_id') THEN
    ALTER TABLE supplier_merge_history ADD COLUMN source_supplier_id UUID;
    CREATE INDEX IF NOT EXISTS idx_supplier_merge_history_source_id ON supplier_merge_history(space_id, source_supplier_id);
  END IF;
END $$;

-- 2. account_merge_history 增加 source_account_id（用于按 ID 解析）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'account_merge_history' AND column_name = 'source_account_id') THEN
    ALTER TABLE account_merge_history ADD COLUMN source_account_id UUID;
    CREATE INDEX IF NOT EXISTS idx_account_merge_history_source_id ON account_merge_history(space_id, source_account_id);
  END IF;
END $$;

-- 3. 客户合并历史表（与供应商/账户一致：只记历史+删源，不改发票）
CREATE TABLE IF NOT EXISTS customer_merge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  source_customer_id UUID NOT NULL,
  target_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  merged_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_merge_history_space_id ON customer_merge_history(space_id);
CREATE INDEX IF NOT EXISTS idx_customer_merge_history_source_id ON customer_merge_history(space_id, source_customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_merge_history_target_id ON customer_merge_history(target_customer_id);

ALTER TABLE customer_merge_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_merge_history_manage_policy" ON customer_merge_history;
CREATE POLICY "customer_merge_history_manage_policy" ON customer_merge_history
  FOR ALL USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()))
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

COMMENT ON TABLE customer_merge_history IS '客户合并历史：source 并入 target，仅记历史+删 source，不修改发票';
