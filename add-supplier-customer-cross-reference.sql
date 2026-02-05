-- 添加供应商和客户的互相关联字段
-- 允许一个客户同时也是供应商，或一个供应商同时也是客户

-- 在 suppliers 表中添加 customer_id 字段（引用 customers 表）
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

-- 在 customers 表中添加 supplier_id 字段（引用 suppliers 表）
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_suppliers_customer_id ON suppliers(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_supplier_id ON customers(supplier_id) WHERE supplier_id IS NOT NULL;

-- 添加注释
COMMENT ON COLUMN suppliers.customer_id IS '关联的客户ID，如果该供应商同时也是客户';
COMMENT ON COLUMN customers.supplier_id IS '关联的供应商ID，如果该客户同时也是供应商';

-- 添加检查约束，防止循环引用
ALTER TABLE suppliers 
ADD CONSTRAINT suppliers_customer_id_check 
CHECK (customer_id IS NULL OR customer_id != id);

ALTER TABLE customers 
ADD CONSTRAINT customers_supplier_id_check 
CHECK (supplier_id IS NULL OR supplier_id != id);
