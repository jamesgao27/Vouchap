-- ============================================================
-- 将 payment_accounts 简化为 accounts，供 receipts 与 invoices 共用
-- receipts.payment_account_id → account_id；invoices 使用 account_id
-- 在 Supabase SQL Editor 中执行此脚本（需已存在 payment_accounts、receipts）
-- ============================================================

-- 1. 删除 receipts 上依赖 payment_account_id 的触发器（若存在）
DROP TRIGGER IF EXISTS trigger_update_payment_account_usage ON receipts;

-- 2. 重命名表 payment_accounts → accounts（若表仍存在）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_accounts') THEN
    ALTER TABLE payment_accounts RENAME TO accounts;
  END IF;
END $$;

-- 3. receipts：payment_account_id → account_id（若列仍为 payment_account_id）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'payment_account_id') THEN
    ALTER TABLE receipts RENAME COLUMN payment_account_id TO account_id;
  END IF;
END $$;
ALTER TABLE IF EXISTS receipts DROP CONSTRAINT IF EXISTS receipts_payment_account_id_fkey;
ALTER TABLE IF EXISTS receipts DROP CONSTRAINT IF EXISTS receipts_account_id_fkey;
ALTER TABLE IF EXISTS receipts
  ADD CONSTRAINT receipts_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;

-- 4. invoices 表若已存在：payment_account_id → account_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'payment_account_id') THEN
    ALTER TABLE invoices RENAME COLUMN payment_account_id TO account_id;
    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_payment_account_id_fkey;
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. 合并历史表：payment_account_merge_history → account_merge_history
ALTER TABLE IF EXISTS payment_account_merge_history RENAME TO account_merge_history;

-- 6. 索引：accounts
CREATE INDEX IF NOT EXISTS idx_accounts_space_id ON accounts(space_id);
DROP INDEX IF EXISTS idx_payment_accounts_space_id;
DROP INDEX IF EXISTS idx_payment_accounts_household_id;
CREATE INDEX IF NOT EXISTS idx_accounts_usage_count ON accounts(space_id, usage_count DESC NULLS LAST);
DROP INDEX IF EXISTS idx_payment_accounts_usage_count;

-- 7. 触发器：accounts.updated_at
DROP TRIGGER IF EXISTS update_payment_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. usage_count 统计：accounts，统计 receipts 与 invoices 的 account_id
CREATE OR REPLACE FUNCTION update_all_account_usage_counts()
RETURNS void AS $$
BEGIN
  UPDATE accounts a
  SET usage_count = COALESCE(counts.cnt, 0)
  FROM (
    SELECT account_id, COUNT(*) AS cnt
    FROM (
      SELECT account_id FROM receipts WHERE account_id IS NOT NULL
      UNION ALL
      SELECT account_id FROM invoices WHERE account_id IS NOT NULL
    ) u
    GROUP BY account_id
  ) counts
  WHERE a.id = counts.account_id;
  UPDATE accounts
  SET usage_count = 0
  WHERE id NOT IN (
    SELECT DISTINCT account_id FROM receipts WHERE account_id IS NOT NULL
    UNION
    SELECT DISTINCT account_id FROM invoices WHERE account_id IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_account_usage_on_receipt_or_invoice_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'receipts' THEN
    IF TG_OP = 'UPDATE' AND OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      IF OLD.account_id IS NOT NULL THEN
        UPDATE accounts SET usage_count = GREATEST(0, usage_count - 1) WHERE id = OLD.account_id;
      END IF;
      IF NEW.account_id IS NOT NULL THEN
        UPDATE accounts SET usage_count = usage_count + 1 WHERE id = NEW.account_id;
      END IF;
    ELSIF TG_OP = 'INSERT' AND NEW.account_id IS NOT NULL THEN
      UPDATE accounts SET usage_count = usage_count + 1 WHERE id = NEW.account_id;
    ELSIF TG_OP = 'DELETE' AND OLD.account_id IS NOT NULL THEN
      UPDATE accounts SET usage_count = GREATEST(0, usage_count - 1) WHERE id = OLD.account_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF TG_OP = 'UPDATE' AND OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      IF OLD.account_id IS NOT NULL THEN
        UPDATE accounts SET usage_count = GREATEST(0, usage_count - 1) WHERE id = OLD.account_id;
      END IF;
      IF NEW.account_id IS NOT NULL THEN
        UPDATE accounts SET usage_count = usage_count + 1 WHERE id = NEW.account_id;
      END IF;
    ELSIF TG_OP = 'INSERT' AND NEW.account_id IS NOT NULL THEN
      UPDATE accounts SET usage_count = usage_count + 1 WHERE id = NEW.account_id;
    ELSIF TG_OP = 'DELETE' AND OLD.account_id IS NOT NULL THEN
      UPDATE accounts SET usage_count = GREATEST(0, usage_count - 1) WHERE id = OLD.account_id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_account_usage_on_receipt ON receipts;
CREATE TRIGGER trigger_update_account_usage_on_receipt
  AFTER INSERT OR UPDATE OR DELETE ON receipts
  FOR EACH ROW EXECUTE FUNCTION update_account_usage_on_receipt_or_invoice_change();

-- invoices 表存在时创建触发器
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    DROP TRIGGER IF EXISTS trigger_update_account_usage_on_invoice ON invoices;
    CREATE TRIGGER trigger_update_account_usage_on_invoice
      AFTER INSERT OR UPDATE OR DELETE ON invoices
      FOR EACH ROW EXECUTE FUNCTION update_account_usage_on_receipt_or_invoice_change();
  END IF;
END $$;

SELECT update_all_account_usage_counts();

-- 9. RLS：accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage payment accounts in their household" ON accounts;
DROP POLICY IF EXISTS "payment_accounts_select_policy" ON accounts;
DROP POLICY IF EXISTS "payment_accounts_insert_policy" ON accounts;
DROP POLICY IF EXISTS "payment_accounts_update_policy" ON accounts;
DROP POLICY IF EXISTS "payment_accounts_delete_policy" ON accounts;
DROP POLICY IF EXISTS "payment_accounts_manage_policy" ON accounts;
CREATE POLICY "accounts_select_policy" ON accounts FOR SELECT
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "accounts_insert_policy" ON accounts FOR INSERT
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "accounts_update_policy" ON accounts FOR UPDATE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "accounts_delete_policy" ON accounts FOR DELETE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

-- 10. RLS：account_merge_history
ALTER TABLE account_merge_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage merge history in their household" ON account_merge_history;
DROP POLICY IF EXISTS "payment_account_merge_history_manage_policy" ON account_merge_history;
CREATE POLICY "account_merge_history_manage_policy" ON account_merge_history
  FOR ALL USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()))
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

-- 11. 默认账户函数：create_default_accounts（供新建空间使用）
-- 若已有 create_default_payment_accounts，可保留别名或由调用方改为 create_default_accounts
DROP FUNCTION IF EXISTS create_default_payment_accounts(UUID);
CREATE OR REPLACE FUNCTION create_default_accounts(p_space_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO accounts (space_id, name, is_ai_recognized) VALUES
    (p_space_id, 'Cash', true)
  ON CONFLICT (space_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE accounts IS '账户（收付款共用，原 payment_accounts）';
COMMENT ON TABLE account_merge_history IS '账户合并历史（原 payment_account_merge_history）';
COMMENT ON COLUMN receipts.account_id IS '关联账户（付款）';
COMMENT ON COLUMN invoices.account_id IS '关联账户（收款）';