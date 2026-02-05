-- 记录客户/供应商关联的来源，用于禁止在“对方”列表编辑时取消关联
-- 由客户标记为供应商的：suppliers.created_from_customer = true，供应商编辑时不能取消“也是客户”
-- 由供应商标记为客户的：customers.is_from_supplier = true，客户编辑时不能取消“也是供应商”

ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS created_from_customer BOOLEAN DEFAULT FALSE;

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS is_from_supplier BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN suppliers.created_from_customer IS 'true 表示该供应商由客户“也是供应商”创建，不可在供应商侧取消“也是客户”';
COMMENT ON COLUMN customers.is_from_supplier IS 'true 表示该客户由供应商“也是客户”创建，不可在客户侧取消“也是供应商”';
