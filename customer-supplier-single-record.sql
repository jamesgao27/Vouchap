-- 客户/供应商“仅标记、不建双份数据”设计
-- 1) 供应商标记“也是客户”：只在 suppliers 表设 is_customer=true，不写 customers 表；选客户时可选该供应商，客户列表里也能看到并编辑该供应商。
-- 2) 客户标记“也是供应商”：只在 customers 表设 is_supplier=true，不写 suppliers 表；选供应商时可选该客户，供应商列表里也能看到并编辑该客户。
-- 这样数据只存一份，无需同步。

-- 1. 客户表：确保 is_supplier 存在
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS is_supplier BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN customers.is_supplier IS '是否也作为供应商出现；为 true 时在供应商列表和选供应商时可选，不创建 suppliers 行';

-- 2. 供应商表：增加 is_customer
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS is_customer BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN suppliers.is_customer IS '是否也作为客户出现；为 true 时在客户列表和选客户时可选，不创建 customers 行';

-- 3. 发票：支持“客户”来自供应商（仅标记为客户的供应商）
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS customer_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
COMMENT ON COLUMN invoices.customer_supplier_id IS '当发票的客户实为“标记也是客户”的供应商时，填供应商 id；与 customer_id 二选一';
CREATE INDEX IF NOT EXISTS idx_invoices_customer_supplier_id ON invoices(customer_supplier_id) WHERE customer_supplier_id IS NOT NULL;

-- 4. 小票：支持“供应商”来自客户（仅标记为供应商的客户）
ALTER TABLE receipts
ADD COLUMN IF NOT EXISTS supplier_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
COMMENT ON COLUMN receipts.supplier_customer_id IS '当小票的供应商实为“标记也是供应商”的客户时，填客户 id；与 supplier_id 二选一';
CREATE INDEX IF NOT EXISTS idx_receipts_supplier_customer_id ON receipts(supplier_customer_id) WHERE supplier_customer_id IS NOT NULL;
