# 老版本 App 支出/收入列表报错 - 可能原因分析

## 背景
- 已执行合并迁移（suppliers/customers 已删，数据在 entities）。
- 已执行恢复脚本（restore-suppliers-customers-from-entities.sql），恢复了 suppliers/customers 表及 receipts/invoices 的 supplier_id、customer_id。
- 2.1.6 / 2.2.0 用户打开支出列表时出现 **「Failed to load expenses」** 的 alert。

---

## 当前代码路径（2.2.0 仓库）

- **支出列表**：`receipts.tsx` 的 `loadReceipts` 先调 `getReceiptsForListFirstPaint()`（首屏），再后台调 `getAllReceipts()` 或 `getAllReceiptsForList()`。
- **getReceiptsForListFirstPaint**（`database.ts`）：  
  `supabase.from('receipts').select('id, space_id, entity_id, ..., entities (id, name), created_by_user:users!created_by (...)').eq('space_id', spaceId)`  
  即：**只查 entity_id + entities 表**，不查 suppliers。
- **getAllReceiptsForList / getAllReceipts**：同样用 `entities (*)`，并会调 `getEntityMergeMap(spaceId)`、`getEntityById` 等。

结论：仓库里的 2.2.0 已完全走 **entities**，没有再用 suppliers。若已安装的 2.1.6/2.2.0 包也是这份逻辑，报错就来自「查 receipts + entities」或「getEntityMergeMap」任一处；若安装包是更早构建（仍查 suppliers），则可能缺表/缺列。

---

## 可能原因（按优先级）

### 1. 老版本请求的是「新后端」代码，而不是直连 Supabase
- **情况**：若支出/收入列表的请求先经过自建后端（Node/Edge Functions），而后端已改为只查 `entity_id` / `entities`，则返回给老 App 的数据结构里没有 `supplier_id` / `supplier` 或 `customer_id` / `customer`。
- **老 App** 可能依赖：`receipt.supplier_id`、`receipt.supplier`、`invoice.customer_id`、`invoice.customer`。拿不到就会报错或白屏。
- **建议**：确认老 App 的列表接口是「直连 Supabase」还是「经后端」。若是经后端，需在后端为老版本保留：仍按 `supplier_id`/`customer_id` 查并返回 `supplier`/`customer`（或至少返回 `supplier_name`/`customer_name`），或通过 User-Agent/版本号做兼容分支。

### 2. 缺少冗余列 `supplier_name` / `customer_name`（列表展示用）
- **情况**：历史上若执行过 `receipts-sync-supplier-name-and-drop.sql`，会 **删除** `receipts.supplier_name`。恢复脚本只加回了 `supplier_id`，没有加回 `supplier_name`。
- 老 App 列表若用 `receipt.supplier_name` 或 `receipt.supplier_name ?? receipt.supplier?.name` 显示收款方，而表中已无 `supplier_name`，可能得到 `undefined` 导致展示异常或报错。
- **invoices**：若从未删过 `customer_name`，则无此问题；若某次迁移删过，同样需要恢复并回填。
- **建议**：在库里检查：
  - `receipts` 是否有列 `supplier_name`；
  - `invoices` 是否有列 `customer_name`。  
  若没有，则加列并回填（receipts 用 suppliers.name，invoices 用 customers.name 或 entities.name），再让老 App 重试列表。

### 3. Supabase/PostgREST 的 join 关系名或 FK 名不一致
- **情况**：老 App 可能用类似 `.select('*, supplier:suppliers(*)')` 或 `.select('*, suppliers(*)')`。Supabase 根据 **外键** 推断 join；我们已加回 `receipts.supplier_id REFERENCES suppliers(id)`，理论上 `suppliers(*)` 可被解析。
- 若老 App 写的是别的 embed 名（例如 `supplier:suppliers(*)` 或表名拼写不同），或项目里对 FK 有自定义命名，有可能导致 join 失败或返回结构不对。
- **建议**：在 Supabase Dashboard 的 Table Editor 或 SQL 里确认：  
  `receipts.supplier_id` 的 FK 指向 `suppliers(id)`；  
  `invoices.customer_id` 的 FK 指向 `customers(id)`。  
  并对照老 App 的 select 字符串，确认表名/别名一致。

### 4. RLS 策略名或逻辑与老版本不兼容
- **情况**：恢复脚本里给 `suppliers` 建的是 `suppliers_manage_policy`（FOR ALL），`customers` 用的是 "Users can view/insert/update/delete customers in their spaces"。若老 App 或之前有依赖别的策略名、或依赖「通过 join 带出的 suppliers/customers 行」的可见性，有可能被 RLS 拦掉。
- **建议**：在 Supabase 的 Authentication 里用同一账号登录，在 SQL Editor 里执行：
  - `SELECT * FROM receipts WHERE space_id = '当前空间id' LIMIT 1;`
  - `SELECT * FROM suppliers LIMIT 1;`
  - `SELECT * FROM invoices WHERE space_id = '当前空间id' LIMIT 1;`
  - `SELECT * FROM customers LIMIT 1;`  
  看是否都能查到数据。若某一表查不到，多半是 RLS 或 space_id 过滤问题。

### 5. 老 App 仍 select 了已不存在的列
- **情况**：除 `supplier_name` 外，若老 App 的 select 里还包含已被删除或重命名的列（例如某次迁移删掉的旧字段），PostgREST 会返回 400 或报错，列表请求直接失败。
- **建议**：看老 App 的报错信息：若是 400 + 提示某列不存在，则把该列加回表或从老 App 的 select 里去掉（需发版）。同时对照当前 receipts/invoices 表结构，确认没有漏掉老 App 用到的列。

### 6. 数据问题：部分 receipt/invoice 的 supplier_id / customer_id 为空
- **情况**：恢复脚本用 `entity_id` 回填了 `supplier_id`/`customer_id`。若某条 receipt 的 `entity_id` 本身为 NULL（历史数据或异常），则 `supplier_id` 会保持 NULL。老 App 若未做空值判断（例如 `receipt.supplier.name`），会报错。
- **建议**：查一下是否有列表里的记录 `entity_id` 或 `supplier_id`/`customer_id` 为 NULL：  
  `SELECT id, entity_id, supplier_id FROM receipts WHERE space_id = '...' AND (supplier_id IS NULL OR entity_id IS NULL);`  
  若有，要么在恢复脚本里用「按名称匹配 suppliers」再补一版回填，要么确保老 App 对 null 做兼容。

---

## 建议的排查顺序
1. **看具体报错**：在真机/模拟器上抓老 App 的报错栈或 Supabase 返回的 HTTP 状态码和 body（如 400/403/500 及错误信息）。
2. **确认数据源**：列表接口是直连 Supabase 还是经自有后端；若是后端，是否已改为只返 entity。
3. **确认列是否存在**：在库里检查 `receipts.supplier_name`、`invoices.customer_name` 是否存在；若无则加列并回填（见上）。
4. **用同一账号在 SQL 里查**：确认 receipts / suppliers / invoices / customers 在当前用户、当前 space 下都能查到，排除 RLS。
5. **对照老 App 的 select**：确认没有引用已删除列，且 join 的表名/别名与当前 FK 一致。

---

## 若确认缺 `supplier_name` / `customer_name`
可在 Supabase SQL Editor 中执行（按需执行）：

```sql
-- 若 receipts 没有 supplier_name：加列并回填
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS supplier_name TEXT;
UPDATE receipts r
SET supplier_name = s.name
FROM suppliers s
WHERE r.supplier_id = s.id AND (r.supplier_name IS NULL OR r.supplier_name = '');

-- 若 invoices 没有 customer_name：加列并回填
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
UPDATE invoices i
SET customer_name = c.name
FROM customers c
WHERE i.customer_id = c.id AND (i.customer_name IS NULL OR i.customer_name = '');
```

然后再用老版本 App 试一次打开支出/收入列表。

---

## 老 App 如何看到真实报错

「Failed to load expenses」只是 toast 文案，真实原因在 `console.error('❌ [loadReceipts] 加载失败:', error)` 里。可以用下面任一方式看到 error 内容。

### 方式一：开发时（同一项目跑起来）
1. 用当前工程：`cd vouchap-app && npx expo start`（或 `npm run start`）。
2. 用 2.1.6/2.2.0 的构建包在真机/模拟器上安装，并**通过 Expo 连接该 Metro**（Development build 且指向同一台电脑的 Metro），或直接用 Expo Go 打开同一项目。
3. 打开支出列表触发报错，看 **运行 `expo start` 的终端**：会有 `❌ [loadReceipts] 加载失败:` 后面跟着错误对象（例如 Supabase 的 `error.message`、`error.code`）。

### 方式二：Xcode 连 iOS 真机时具体找什么 log（推荐）

你已用 Xcode 连上装了老包的 iOS 手机，按下面做即可看到真实报错。

**1. 打开设备控制台**

- Xcode 菜单：**Window** → **Devices and Simulators**（或快捷键 `Shift + Cmd + 2`）。
- 左侧选中你的 **iPhone 设备**（不要选 Simulator）。
- 在设备信息区域下方点击 **Open Console**，会打开一个独立的 **Console** 窗口，里面是这台设备上所有 App 的系统日志。

**2. 只看本 App 的日志（可选但建议）**

- Console 窗口顶部有一个 **进程/应用过滤** 输入框。
- 输入你的 **App 包名** 或 **App 显示名**（例如 `Vouchap`、`vouchap`，具体以你在 Xcode/Expo 里配置的为准），这样只会显示该 App 的日志，其它系统日志会被过滤掉。若不确定包名，可先不筛选，用下面的关键词搜。

**3. 触发报错**

- 在手机上打开老版本 App，进入 **支出** 列表页，直到出现「Failed to load expenses」的 alert。

**4. 在 Console 里搜什么**

- 控制台支持搜索：在 Console 窗口的 **搜索框** 里输入下面**任一关键词**（优先用第一个）：
  - **`loadReceipts`** —— 代码里打的是 `console.error('❌ [loadReceipts] 加载失败:', error)`，所以一定会包含 `loadReceipts`。
  - **`加载失败`** —— 同一行的中文前缀。
  - **`❌`** —— 同一行的 emoji，若终端支持。
- 找到那一行（或连续几行）：**第一行** 通常是 `❌ [loadReceipts] 加载失败:`，**后面几行** 可能是 error 对象的展开（如 `message`、`code`、`details`）。  
- **重点看的内容**：  
  - **error.message**：Supabase/网络返回的错误说明（例如 "column does not exist"、"relation ... does not exist"、"JWT expired"）。  
  - **error.code**：如 `PGRST301`、`42P01` 等，便于查 PostgREST/Postgres 文档。  
  - 若有 **stack** 或 **stack trace**：能看出是 `getReceiptsForListFirstPaint` 还是 `getAllReceipts` / `getEntityMergeMap` 抛出的。

**5. 若搜不到 `loadReceipts`**

- 确认是否真的进了「支出」列表（即触发 `loadReceipts` 的页面）。  
- 把过滤清空，再搜 **`Failed to load expenses`** 或 **`error`**，看前后几行是否有 JS 报错或 Supabase 相关字样。  
- 若仍没有：可能是 Release 包把 `console` 打掉了，可考虑用 **Supabase Dashboard → Logs**（方式三）看服务端报错。

**6. 把真实报错记下来**

- 把 Console 里 **`❌ [loadReceipts] 加载失败:` 后面那几行**（尤其是 `message`、`code`、`details`）复制下来，根据这些信息再查缺列、RLS、网络等问题。

---

- **Android**：  
  1. 手机用 USB 连电脑，开启 USB 调试。  
  2. 终端执行：`adb logcat *:E` 或 `adb logcat | grep -i "loadReceipts\|supabase\|error"`。  
  3. 在手机上打开 App，进入支出列表触发报错，看 logcat 里是否有对应错误栈或 Supabase 返回信息。

### 方式三：Supabase 服务端日志（最直接）
1. 登录 [Supabase Dashboard](https://app.supabase.com) → 选项目。
2. 左侧 **Logs** → **Postgres** 或 **API**（若用 REST 则看 API）。
3. 让用户再打开一次支出列表并触发「Failed to load expenses」。
4. 看该时间点是否有 **Postgres 错误**（如 column does not exist、permission denied）或 **API 4xx/5xx** 及返回 body。  
这里能看到是缺列、RLS 还是别的原因。

### 已抓到的报错：PGRST200（receipts ↔ customers 关系找不到）

若报错为：
```text
Could not find a relationship between 'receipts' and 'customers' in the schema cache
Searched for a foreign key relationship ... using the hint 'receipts_supplier_customer_id_fkey' ... but no matches were found.
```
**原因**：老包/代码在 select 里用了 `customers!receipts_supplier_customer_id_fkey`，即要求存在名为 `receipts_supplier_customer_id_fkey` 的外键。恢复脚本若只加了 `supplier_customer_id` 列而未加该 FK，PostgREST 会报 PGRST200。

**修复**：在 Supabase SQL Editor 中执行（为 `receipts.supplier_customer_id` 添加指向 `customers(id)` 的外键，且约束名必须为 `receipts_supplier_customer_id_fkey`）：
```sql
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS supplier_customer_id UUID;
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_supplier_customer_id_fkey;
ALTER TABLE receipts ADD CONSTRAINT receipts_supplier_customer_id_fkey
  FOREIGN KEY (supplier_customer_id) REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_supplier_customer_id ON receipts(supplier_customer_id) WHERE supplier_customer_id IS NOT NULL;
```
执行后让 PostgREST 重新加载 schema（通常会自动），再让老 App 重试打开支出列表。

---

### 方式四：下次发版时把错误信息暴露给用户（可选）
在 `receipts.tsx` 的 catch 里把 error 文案也 toasts 出来，方便用户反馈，例如：  
`showToast(\`Failed to load expenses: ${error?.message ?? String(error)}\`, 'error');`  
这样新版本用户若再报错，可直接看到 Supabase/网络返回的 message。
