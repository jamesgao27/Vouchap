-- ============================================================
-- 凭证种类扩展：采购端 receipt/入库单，销售端 invoice/出库单
-- 标准 SKU 表 + invoices + 入库单/出库单（含商品明细与数量）
-- 在 Supabase SQL Editor 中执行此脚本
--
-- 前置：需已存在 spaces, users, user_spaces, suppliers, accounts,
--       categories, purposes 及 update_updated_at_column() 函数。
--
-- 后续：库存与资金流水实时统计可在应用层或通过视图/物化视图基于本脚本
--       所建表进行汇总（receipts/invoices 资金流，inbound_items/outbound_items 按 sku 汇总库存）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 标准 SKU 表（商品主数据，入库/出库明细关联）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  code TEXT,                    -- 商品编码/条码，可选
  name TEXT NOT NULL,           -- 商品名称
  unit TEXT NOT NULL DEFAULT '件',  -- 计量单位：件、个、箱、kg 等
  description TEXT,
  is_ai_recognized BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(space_id, code)
);

CREATE INDEX IF NOT EXISTS idx_skus_space_id ON skus(space_id);
CREATE INDEX IF NOT EXISTS idx_skus_code ON skus(space_id, code) WHERE code IS NOT NULL;

-- ------------------------------------------------------------
-- 2. 销售发票 invoices（与 receipt 结构镜像，资金流入）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,   -- 客户/买方名称（对应 receipt 的 supplier_name）
  total_amount DECIMAL(10, 2) NOT NULL,
  currency TEXT,
  tax DECIMAL(10, 2),
  date DATE NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,  -- 收款账户
  status TEXT NOT NULL DEFAULT 'pending',
  image_url TEXT,
  input_type TEXT DEFAULT 'image',
  confidence DECIMAL(3, 2),
  processed_by TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  purpose_id UUID REFERENCES purposes(id) ON DELETE SET NULL,
  price DECIMAL(10, 2) NOT NULL,
  is_asset BOOLEAN DEFAULT FALSE,
  confidence DECIMAL(3, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_space_id ON invoices(space_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_category_id ON invoice_items(category_id);

-- ------------------------------------------------------------
-- 3. 入库单 inbound（采购端，含商品明细+数量，关联 SKU）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inbound (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  document_no TEXT,             -- 入库单号
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,           -- 冗余或无供应商时填写
  total_amount DECIMAL(10, 2),  -- 可选总金额
  currency TEXT,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  image_url TEXT,
  input_type TEXT DEFAULT 'image',
  confidence DECIMAL(3, 2),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inbound_id UUID NOT NULL REFERENCES inbound(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,  -- 关联标准 SKU，可为空（待匹配）
  product_name TEXT NOT NULL,   -- 商品显示名称（原始或与 SKU 对应）
  quantity DECIMAL(12, 4) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT '件',
  unit_price DECIMAL(10, 2),
  confidence DECIMAL(3, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_space_id ON inbound(space_id);
CREATE INDEX IF NOT EXISTS idx_inbound_date ON inbound(date DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_supplier_id ON inbound(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbound_items_inbound_id ON inbound_items(inbound_id);
CREATE INDEX IF NOT EXISTS idx_inbound_items_sku_id ON inbound_items(sku_id) WHERE sku_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4. 出库单 outbound（销售端，含商品明细+数量，关联 SKU）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbound (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  document_no TEXT,
  customer_name TEXT,           -- 客户/买方
  total_amount DECIMAL(10, 2),
  currency TEXT,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  image_url TEXT,
  input_type TEXT DEFAULT 'image',
  confidence DECIMAL(3, 2),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outbound_id UUID NOT NULL REFERENCES outbound(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity DECIMAL(12, 4) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT '件',
  unit_price DECIMAL(10, 2),
  confidence DECIMAL(3, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_space_id ON outbound(space_id);
CREATE INDEX IF NOT EXISTS idx_outbound_date ON outbound(date DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_items_outbound_id ON outbound_items(outbound_id);
CREATE INDEX IF NOT EXISTS idx_outbound_items_sku_id ON outbound_items(sku_id) WHERE sku_id IS NOT NULL;

-- ------------------------------------------------------------
-- 5. updated_at 触发器（复用已有函数 update_updated_at_column）
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS update_skus_updated_at ON skus;
CREATE TRIGGER update_skus_updated_at BEFORE UPDATE ON skus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inbound_updated_at ON inbound;
CREATE TRIGGER update_inbound_updated_at BEFORE UPDATE ON inbound
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_outbound_updated_at ON outbound;
CREATE TRIGGER update_outbound_updated_at BEFORE UPDATE ON outbound
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 6. 启用 RLS
-- ------------------------------------------------------------
ALTER TABLE skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_items ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 7. RLS 策略（与 receipts 一致：按 space_id + user_spaces）
-- ------------------------------------------------------------

-- skus
DROP POLICY IF EXISTS "skus_select_policy" ON skus;
DROP POLICY IF EXISTS "skus_insert_policy" ON skus;
DROP POLICY IF EXISTS "skus_update_policy" ON skus;
DROP POLICY IF EXISTS "skus_delete_policy" ON skus;
CREATE POLICY "skus_select_policy" ON skus FOR SELECT
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "skus_insert_policy" ON skus FOR INSERT
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "skus_update_policy" ON skus FOR UPDATE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "skus_delete_policy" ON skus FOR DELETE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

-- invoices
DROP POLICY IF EXISTS "invoices_select_policy" ON invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON invoices;
DROP POLICY IF EXISTS "invoices_delete_policy" ON invoices;
CREATE POLICY "invoices_select_policy" ON invoices FOR SELECT
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "invoices_insert_policy" ON invoices FOR INSERT
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "invoices_update_policy" ON invoices FOR UPDATE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "invoices_delete_policy" ON invoices FOR DELETE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

-- invoice_items（通过 invoice 归属 space）
DROP POLICY IF EXISTS "invoice_items_select_policy" ON invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON invoice_items;
CREATE POLICY "invoice_items_select_policy" ON invoice_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND i.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "invoice_items_insert_policy" ON invoice_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND i.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "invoice_items_update_policy" ON invoice_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND i.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "invoice_items_delete_policy" ON invoice_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND i.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));

-- inbound
DROP POLICY IF EXISTS "inbound_select_policy" ON inbound;
DROP POLICY IF EXISTS "inbound_insert_policy" ON inbound;
DROP POLICY IF EXISTS "inbound_update_policy" ON inbound;
DROP POLICY IF EXISTS "inbound_delete_policy" ON inbound;
CREATE POLICY "inbound_select_policy" ON inbound FOR SELECT
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "inbound_insert_policy" ON inbound FOR INSERT
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "inbound_update_policy" ON inbound FOR UPDATE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "inbound_delete_policy" ON inbound FOR DELETE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

-- inbound_items
DROP POLICY IF EXISTS "inbound_items_select_policy" ON inbound_items;
DROP POLICY IF EXISTS "inbound_items_insert_policy" ON inbound_items;
DROP POLICY IF EXISTS "inbound_items_update_policy" ON inbound_items;
DROP POLICY IF EXISTS "inbound_items_delete_policy" ON inbound_items;
CREATE POLICY "inbound_items_select_policy" ON inbound_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM inbound i WHERE i.id = inbound_items.inbound_id AND i.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "inbound_items_insert_policy" ON inbound_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM inbound i WHERE i.id = inbound_items.inbound_id AND i.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "inbound_items_update_policy" ON inbound_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM inbound i WHERE i.id = inbound_items.inbound_id AND i.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "inbound_items_delete_policy" ON inbound_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM inbound i WHERE i.id = inbound_items.inbound_id AND i.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));

-- outbound
DROP POLICY IF EXISTS "outbound_select_policy" ON outbound;
DROP POLICY IF EXISTS "outbound_insert_policy" ON outbound;
DROP POLICY IF EXISTS "outbound_update_policy" ON outbound;
DROP POLICY IF EXISTS "outbound_delete_policy" ON outbound;
CREATE POLICY "outbound_select_policy" ON outbound FOR SELECT
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "outbound_insert_policy" ON outbound FOR INSERT
  WITH CHECK (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "outbound_update_policy" ON outbound FOR UPDATE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));
CREATE POLICY "outbound_delete_policy" ON outbound FOR DELETE
  USING (space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid()));

-- outbound_items
DROP POLICY IF EXISTS "outbound_items_select_policy" ON outbound_items;
DROP POLICY IF EXISTS "outbound_items_insert_policy" ON outbound_items;
DROP POLICY IF EXISTS "outbound_items_update_policy" ON outbound_items;
DROP POLICY IF EXISTS "outbound_items_delete_policy" ON outbound_items;
CREATE POLICY "outbound_items_select_policy" ON outbound_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM outbound o WHERE o.id = outbound_items.outbound_id AND o.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "outbound_items_insert_policy" ON outbound_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM outbound o WHERE o.id = outbound_items.outbound_id AND o.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "outbound_items_update_policy" ON outbound_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM outbound o WHERE o.id = outbound_items.outbound_id AND o.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));
CREATE POLICY "outbound_items_delete_policy" ON outbound_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM outbound o WHERE o.id = outbound_items.outbound_id AND o.space_id IN (SELECT space_id FROM user_spaces WHERE user_id = auth.uid())));

-- ------------------------------------------------------------
-- 8. 注释（便于后续维护）
-- ------------------------------------------------------------
COMMENT ON TABLE skus IS '标准商品 SKU，入库/出库明细可关联此表做库存与统计';
COMMENT ON TABLE invoices IS '销售发票，资金流入，结构对应 receipts';
COMMENT ON TABLE invoice_items IS '发票明细，对应 receipt_items';
COMMENT ON TABLE inbound IS '入库单（采购端），含商品明细与数量';
COMMENT ON TABLE inbound_items IS '入库单明细，关联 sku_id，数量必填';
COMMENT ON TABLE outbound IS '出库单（销售端），含商品明细与数量';
COMMENT ON TABLE outbound_items IS '出库单明细，关联 sku_id，数量必填';

COMMENT ON COLUMN inbound_items.sku_id IS '关联标准 SKU；为空表示待匹配或未建 SKU';
COMMENT ON COLUMN outbound_items.sku_id IS '关联标准 SKU；为空表示待匹配或未建 SKU';
