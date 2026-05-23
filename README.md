# Vouchap

一个基于 React Native + Expo 的家庭记账应用，支持拍摄消费小票，使用 Gemini AI 识别并整理成明细，存储到 Supabase 数据库。

## 功能特性

- 📸 **拍摄小票**：使用相机拍摄或从相册选择小票图片
- 🤖 **AI 识别**：使用 Google Gemini 1.5 Pro 自动识别小票内容
- ✅ **智能确认**：识别置信度低时，提示用户确认和编辑
- 📝 **编辑明细**：用户可以编辑商品分类、用途、价格等信息
- 📊 **小票管理**：查看所有小票列表，支持筛选和搜索
- 🖼️ **原图查看**：可以查看每个小票的原始图片
- 💾 **云端存储**：图片和数据存储在 Supabase

## 技术栈

- **框架**: React Native + Expo
- **路由**: Expo Router
- **数据库**: Supabase
- **AI 识别**: Google Gemini 1.5 Pro
- **语言**: TypeScript

## 环境要求

- Node.js 18+
- npm 或 yarn
- Expo CLI
- iOS 模拟器或 Android 模拟器（或真实设备）

## 安装步骤

### 1. 安装依赖

```bash
npm install
# 或
yarn install
```

### 2. 配置环境变量

复制 `.env.example` 文件为 `.env`，并填入你的配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Gemini 识别由 Supabase `gemini-proxy` 处理，**不要**在客户端 `.env` 或 EAS 中配置 Gemini API Key。见 `vouchap-app/docs/GEMINI-API-SECURITY.md`。

### 3. Supabase 数据库设置

确保你的 Supabase 数据库中已经创建了以下表结构：

#### `receipts` 表

```sql
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_name TEXT NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  date DATE NOT NULL,
  payment_account TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'confirmed'
  image_url TEXT,
  confidence DECIMAL(3, 2), -- 0.00 to 1.00
  processed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `receipt_items` 表

```sql
CREATE TABLE receipt_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'Grocery', 'Home', 'Electronics', 'Clothing', 'Other'
  purpose TEXT NOT NULL, -- 'Personnel', 'Business'
  price DECIMAL(10, 2) NOT NULL,
  is_asset BOOLEAN DEFAULT FALSE,
  confidence DECIMAL(3, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Supabase Storage 设置

1. 在 Supabase Dashboard 中创建 Storage Bucket，命名为 `receipts`
2. 设置 Bucket 为公开（Public）或配置适当的访问策略

### 4. 运行应用

```bash
npm start
# 或
yarn start
```

然后按 `i` 启动 iOS 模拟器，或按 `a` 启动 Android 模拟器。

## 项目结构

```
snap-receipt/
├── app/                    # Expo Router 页面
│   ├── _layout.tsx        # 根布局
│   ├── index.tsx          # 首页（拍照入口）
│   ├── camera.tsx         # 相机页面
│   ├── receipts.tsx       # 小票列表页
│   └── receipt-details/   # 小票详情页
│       └── [id].tsx
├── lib/                   # 工具库
│   ├── supabase.ts       # Supabase 客户端
│   ├── gemini.ts         # Gemini AI 识别服务
│   └── database.ts       # 数据库操作
├── types/                 # TypeScript 类型定义
│   └── index.ts
├── assets/                # 静态资源
├── package.json
├── tsconfig.json
├── app.json
└── README.md
```

## 使用说明

### 拍摄小票

1. 打开应用，点击"拍摄小票"按钮
2. 使用相机拍摄小票，或从相册选择图片
3. 应用会自动使用 Gemini AI 识别小票内容
4. 识别完成后，如果置信度较低，会提示你确认信息

### 查看和编辑小票

1. 在"我的小票"页面查看所有小票
2. 点击小票进入详情页
3. 可以编辑商品信息、分类、用途等
4. 点击"确认"按钮保存更改

### 小票状态

- **待确认 (Pending)**: 识别置信度较低，需要用户确认
- **处理中 (Processing)**: 识别置信度较高，正在处理
- **已确认 (Confirmed)**: 用户已确认并保存

## 注意事项

1. **API 密钥安全**: 不要将 `.env` 文件提交到版本控制系统
2. **Supabase 权限**: 确保 Supabase 的 RLS (Row Level Security) 策略配置正确
3. **存储配额**: 注意 Supabase Storage 的存储配额限制
4. **API 限制**: Gemini API 有调用频率限制，注意控制使用量

## 开发计划

- [ ] 添加小票搜索功能
- [ ] 添加筛选功能（按日期、金额、状态等）
- [ ] 添加统计图表
- [ ] 支持导出数据
- [ ] 添加多用户支持
- [ ] 优化 AI 识别准确度

## 许可证

MIT

