-- 修正客户和供应商的关联设计
-- 新设计：客户可以标记为"也是供应商"，此时会在suppliers表中创建一条记录，customer_id指向该客户
-- 这样只需要在客户表中录入一次，即可在客户和供应商列表中都使用

-- 1. 如果 customers.supplier_id 字段存在，先删除相关约束和索引
DO $$ 
BEGIN
  -- 删除 customers.supplier_id 的索引（如果存在）
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_customers_supplier_id'
  ) THEN
    DROP INDEX idx_customers_supplier_id;
  END IF;

  -- 删除 customers.supplier_id 的检查约束（如果存在）
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'customers_supplier_id_check'
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_supplier_id_check;
  END IF;

  -- 删除 customers.supplier_id 的外键约束（如果存在）
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'customers_supplier_id_fkey'
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_supplier_id_fkey;
  END IF;

  -- 删除 customers.supplier_id 字段（如果存在）
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE customers DROP COLUMN supplier_id;
  END IF;
END $$;

-- 2. 确保 suppliers.customer_id 字段存在（如果不存在则添加）
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

-- 3. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_suppliers_customer_id ON suppliers(customer_id) WHERE customer_id IS NOT NULL;

-- 4. 添加 customers.is_supplier 字段（如果不存在）
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS is_supplier BOOLEAN DEFAULT FALSE;

-- 5. 添加注释
COMMENT ON COLUMN suppliers.customer_id IS '关联的客户ID，如果该供应商记录来自客户表（客户标记为也是供应商）';
COMMENT ON COLUMN customers.is_supplier IS '是否也是供应商，如果为true，则会在suppliers表中创建对应的供应商记录';

-- 6. 添加检查约束，防止循环引用
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'suppliers_customer_id_check'
  ) THEN
    ALTER TABLE suppliers 
    ADD CONSTRAINT suppliers_customer_id_check 
    CHECK (customer_id IS NULL OR customer_id != id);
  END IF;
END $$;
