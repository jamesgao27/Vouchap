-- 创建 customers 表（类似 suppliers 表）
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_number TEXT,
  phone TEXT,
  address TEXT,
  is_ai_recognized BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(space_id, name)
);

-- 在 invoices 表添加 customer_id 字段
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_customers_space_id ON customers(space_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id) WHERE customer_id IS NOT NULL;

-- 启用 RLS（Row Level Security）
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略：用户可以查看和操作自己空间内的客户
CREATE POLICY "Users can view customers in their spaces"
  ON customers FOR SELECT
  USING (
    space_id IN (
      SELECT space_id FROM user_spaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert customers in their spaces"
  ON customers FOR INSERT
  WITH CHECK (
    space_id IN (
      SELECT space_id FROM user_spaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update customers in their spaces"
  ON customers FOR UPDATE
  USING (
    space_id IN (
      SELECT space_id FROM user_spaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete customers in their spaces"
  ON customers FOR DELETE
  USING (
    space_id IN (
      SELECT space_id FROM user_spaces 
      WHERE user_id = auth.uid()
    )
  );

-- 添加注释
COMMENT ON TABLE customers IS '客户表，用于存储发票关联的客户信息';
COMMENT ON COLUMN customers.space_id IS '所属空间ID';
COMMENT ON COLUMN customers.name IS '客户名称';
COMMENT ON COLUMN customers.tax_number IS '税号';
COMMENT ON COLUMN customers.phone IS '电话';
COMMENT ON COLUMN customers.address IS '地址';
COMMENT ON COLUMN customers.is_ai_recognized IS '是否由AI识别创建';
COMMENT ON COLUMN invoices.customer_id IS '关联的客户ID，类似receipts表的supplier_id';
