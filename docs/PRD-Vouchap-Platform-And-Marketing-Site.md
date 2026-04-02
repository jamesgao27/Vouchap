# Vouchap 平台与官网 — 产品需求文档（PRD）

| 项 | 内容 |
|----|------|
| **文档版本** | 3.1 |
| **适用范围** | 仓库 `/Users/macbook/Vouchap`（以 `vouchap-app/` 为准）与 `/Users/macbook/vouchap-website` |
| **说明** | 仓库根目录另有 `app/` 与根 `package.json`，可能与 `vouchap-app` 重复；**以 `vouchap-app` 为产品实现主线**。 |
| **界面语言** | 产品 UI 文案为 **English**（与代码一致）；本 PRD 正文为 **简体中文**。 |
| **需求编号** | 正文使用 **`REQ-x.y-nn`**，便于评审与迭代引用；**原始对话逐条**仍见 **`docs/PRD-Appendix-B-User-Prompts-Full-Corpus.md`**。 |

---

## 目录

1. [背景与目标](#1-背景与目标)  
2. [范围](#2-范围)  
3. [用户与角色](#3-用户与角色)  
4. [系统概览](#4-系统概览)  
5. [功能需求](#5-功能需求)  
6. [非功能需求](#6-非功能需求)  
7. [假设与依赖](#7-假设与依赖)  
8. [验收与需求追溯](#8-验收与需求追溯)  
9. [附录 A：路由与模块索引](#附录-a路由与模块索引)  
10. [附录 B：原始指令存档](#附录-b原始指令存档)  

---

## 1. 背景与目标

### 1.1 产品定位

Vouchap 是面向 **多空间（Space）** 的工作台产品：用户在某一空间内完成个人/小团队记账，或由 **事务所（Firm）** 向客户提供报税与文档协作。

### 1.2 业务目标

- **客户端空间**：管理费用（Expenses）、收入（Income）、可选进销存；在 **Tax Filing** 中与事务所共享项目、任务与附件，并通过助手（如 Eric）协作。  
- **事务所空间**：管理 **Clients**、**Engagements**、**Service Catalog**（SKU/服务包）、权限与分配；向客户发出邀请并完成交付。  
- **官网**：品牌与获客、帮助与合规页；承载 **邮件链接落地页**（认证确认、客户邀请等），再跳转到 **平台 Web** 或 **App 深链**。

### 1.3 技术概览（与实现对齐）

- **客户端**：`vouchap-app`，Expo Router，根目录 `src/mobile-ui/app`，同一套代码覆盖 **iOS / Android / Web**。  
- **后端**：Supabase（Auth、Postgres、Storage、Realtime、Edge Function）。事务所域数据主要在 schema **`firm`**；记账在 **`public`**。  
- **AI**：Google Gemini（小票/收入解析、报税附件识别、对话录入等），位于 `vouchap-app/src/shared-logic`。

### 1.4 演进背景（给后续同学的前后文）

产品从「个人/家庭记账 + AI 小票」扩展到 **事务所—客户** 交付链路后，架构上自然分成三条并行轴线：

1. **官网 / 邮件**：用户从邮件里的链接进来时，环境不可控（手机/PC、是否已装 App、是否走 Web 端），因此落地页必须 **让用户显式选择** 下一步，而不是默默 `window.location` 跳走导致 token 落在错误容器里。  
2. **平台 App（Expo）**：同一套代码跑 Web 与原生，但 **导航壳不同**（Web 固定侧栏 + 聊天右栏；原生以堆栈为主）。迭代时经常出现「只改 Web」或「双端对齐」类需求，需要在布局上留 Hook（如事件通知刷新侧栏头像）。  
3. **`firm` schema**：CRM、订单/项目、任务树、邀请与 RLS 强耦合；表改名（如 Orders→Engagements 文案）、**invitee 与客户行合并** 等会牵动策略与触发器，迭代要先读迁移顺序再改 policy。

本节不要求记住每条 SQL，但要理解：**功能需求与数据策略是一起长出来的**，改 UI 时常要回头看 RLS/RPC。

---

## 2. 范围

### 2.1 包含

- `vouchap-website`：营销站点全部页面与邮件相关落地流程（见第 5.1 节）。  
- `vouchap-app`：认证、空间、记账、报税、事务所 CRM、聊天助手、可选仓储、Edge Function 发送邀请邮件等与上述产品直接相关的功能。

### 2.2 不包含

- **`vouchap-crm` 独立仓库**（若有）不作为本 PRD 主体；除非明确接入同一代码库。  
- **`docs/CRM-CLIENT-STATUS.md`**、**`docs/CRM-ORDERS-SKU-PROJECTS.md`** 等对 CRM 仍为**详细事实来源**，本 PRD 做模块级归纳。  
- 对话里出现过的 **Mind Map / workmap** 等探索项：**不属于**当前 Vouchap-app 交付范围，仅在附录 B 留档。

---

## 3. 用户与角色

| 角色 | 典型空间 | 主要目标 |
|------|----------|----------|
| **终端用户 / 客户** | 非 Firm 的 `space` | 记账、报税任务协作、处理邀请 |
| **事务所成员** | `kind === 'firm'` 的 `space` | 客户与项目交付、SKU/权限、邀请 |
| **访客** | 无 | 浏览官网、邮件落地页 → App/Web |

**核心对象**：用户（Auth）、空间（Space）、成员与邀请、事务所客户与订单（Engagement/Order）、项目与任务（Project / Todo）、附件、小票/收入单、SKU、聊天日志等。

---

## 4. 系统概览

### 4.1 Web 端全局布局

- **侧栏**（仅 Web）：品牌、当前空间入口、按空间类型切换主导航（Dashboard / Expenses / Income / Tax Filing / AI Inventory，或 Firm：Insights / Clients / Engagements / Service Catalog）。  
- **事务所待审核**：Firm 未获批时，部分页面用 **遮罩** 阻断主流程，避免未合规事务所误操作客户数据。  
- **聊天**：右侧栏 / FAB；路由决定 **聊天类型**（报税、客户助手、小票等）；**首页、报税列表**等路径上关闭或默认不收起聊天，以免干扰浏览型页面。

### 4.2 功能开关（Expo `extra`）

- **`showTaxFiling`**：默认 **开**；生产可一键关。  
- **`showAiInventory`**：默认 **关**，避免实验能力进生产。

### 4.3 实现侧理解（布局 / 聊天策略）

| 设计考虑 | 说明 |
|----------|------|
| **侧栏不放原生** | `WebSidebar` 与路由白名单耦合；登录/注册/邀请落地等全屏流不展示侧栏，减少横向空间浪费与安全暴露面。 |
| **聊天默认开闭** | `_layout` 里按 pathname 决定：项目/客户列表等 **重协作** 页面默认打开右栏；**仪表盘、报税列表** 以扫视为主则默认关，避免 Eric 占满首屏。 |
| **字体与图标** | Web 打包字体易 404，故用 CDN 预加载 Ionicons + Poppins；首屏在字体 ready 前显示 Loading，避免「图标方块」。 |
| **iOS 导航** | 历史上 `react-native-screens` 在部分过渡场景触发断言；对 iOS 收窄 `animation`/`freezeOnBlur` 以降低崩溃面——属于**工程权衡**，后续若要开动画需回归测试。 |

---

## 5. 功能需求

以下每一节包含：**能力说明**、**需求要点（REQ）**、**背景与取舍**、**实现侧提示**（指向思路，不等同替代读代码）。

---

### 5.1 官网（`vouchap-website`）

**能力摘要**：英文营销页；`/auth/confirm`、`/client-join` 承接 Supabase 邮件链接，与 **平台 Web** 及 **App scheme** 握手。

#### 需求要点（REQ）

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.1-01** | 邮件落地页 **禁止默认自动跳转**；须由用户点击「打开 App」或「在浏览器继续」，避免 token/session 进错环境。 |
| **REQ-5.1-02** | 同一套落地布局覆盖多场景：**注册确认、重置密码、空间邀请、邮箱换绑** 等，通过 URL `type`（或等价参数）切换标题与文案。 |
| **REQ-5.1-03** | `client-join` 用 **anon Supabase + `firm_get_client_invite_info`** 判断 token 仍有效；无效时明确 UI，不静默失败。 |
| **REQ-5.1-04** | 平台根 URL、注册路径、客户端 setup 路径、深链 scheme 均 **环境变量可配**，便于 dev/staging/prod 与独立部署的官网共存。 |
| **REQ-5.1-05** | 需提供 App Store / Play 链接与二维码，方便桌面端扫手机安装（与确认页一致体验）。 |

#### 背景与取舍

邮件里的 `ConfirmationURL` 若直接指向 App scheme，在 **桌面浏览器** 往往无法消费；若直接进平台 Web，又可能不符合用户「我明明在手机上点邮件」的预期。折中方案是：**官网静态页解析参数 → 用户选择载体 → 再进入平台 `/auth/confirm` 或 `vouchap://…`**。这是「方案二」类迭代反复验证后的产品决策，而不是纯前端偏好。

#### 实现侧提示

- 页面见 `vouchap-website/app/auth/confirm`、`app/client-join`。  
- 与 **Supabase Auth 邮件模板** 的 `redirectTo` / 额外 query（如 `next=`）必须一致约定；改模板前需三端（官网、平台、App linking）联调。

---

### 5.2 认证、邀请与空间生命周期（`vouchap-app`）

**能力摘要**：登录注册、成员邀请、客户邀请与认领、深链、当前空间恢复。

#### 需求要点（REQ）

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.2-01** | 用户登录后必须进入 **合法当前空间**；若仅有成员邀请或客户认领，应有清晰队列（侧栏角标等）。 |
| **REQ-5.2-02** | **被踢出 / 当前空间失效** 时，不能无声失败；应落到「选择空间 / 处理邀请」而非空白或循环登录。 |
| **REQ-5.2-03** | 客户经事务所邀请时：**SKU 预览、认领、与 `firm` 订单绑定** 应与官网 `client-join` 使用同一套 RPC 语义，避免「页面说有效、App 说无效」。 |
| **REQ-5.2-04** | 邮件确认与 Web `auth/confirm`：参数在 query 与 hash 的兼容要写全（历史上 Supabase 不同客户端行为不一致）。 |

#### 背景与取舍

空间模型是 **多租户隔离基石**；任何「帮用户自动选一个 space」的捷径都容易在 **多邀请并存** 时踩雷。产品倾向：**显式队列 + Realtime 刷新待办数**，而不是静默合并。

#### 实现侧提示

- 路由：`auth/setup`、`auth/claim`、`handle-invitations`、`invite/*` 等。  
- 侧栏：`WebSidebar` 对 `getPendingInvitationsForUser` / `getPendingInviteesForEmail` 的角标与 Realtime。  
- 深链：`expo-linking` 与网站 `NEXT_PUBLIC_*` 对齐。

---

### 5.3 空间与个人资料

#### 需求要点（REQ）

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.3-01** | `management` 可编辑用户与当前空间展示信息（含 Logo）；保存后 **Web 侧栏应立即反映**（通过自定义 window 事件通知刷新，避免需整页刷新）。 |
| **REQ-5.3-02** | 注册 **Firm** 与 **Client** 空间类型的分流应与 `setup-space` 及后续 `firm` 审核态一致（未批准 Firm 的功能边界见 4.1 遮罩）。 |

#### 实现侧提示

- Web 监听 `vouchap_space_updated` / `vouchap_user_updated` 已在侧栏实现；新增设置页时建议复用同一模式。

---

### 5.4 记账：费用与收入（客户端空间）

#### 5.4.1 费用（Expenses）

**能力摘要**：多模态录入、AI 结构化、分类/归因/账户/关联方、列表与详情。

##### 需求要点（REQ）

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.4-01** | 列表上应对 **已确认** 小票展示「录入方式」语义：**相机 / 文字 / 录音**（不宜长期用单一 ✅ 掩盖信息）。 |
| **REQ-5.4-02** | **文字录入** 的图标应接近用户熟悉的「键盘/多行文本」隐喻；**不宜**使用易被误解为九宫格输入法的图形（曾对齐微信等 IM 的通用样式）。 |
| **REQ-5.4-03** | **录音** 与 **拍照** 在列表上必须可区分；历史数据若缺字段需兼容（新数据保证正确）。 |
| **REQ-5.4-04** | **票面日期** 须忠实于用户可见的票面文本/日期，避免多次时区转换导致 ±1 天；列表上的「提交/创建时间」与票面日期语义分离。 |
| **REQ-5.4-05** | **删除小票** 时应删除 **关联图片/音频** 等 Storage 对象；由本小票 **独占** 创建且未合并的供应商/账户等附属数据应可清理（与合并逻辑协调，避免误删共享主数据）。 |
| **REQ-5.4-06** | Storage 侧应避免 **同一用户内容重复多份** 占空间（若历史上传路径分叉，应收敛为单对象 + 引用）。 |

##### 背景与取舍

小票是 **证据链**，列表上的「怎么录的」直接影响用户信任；输入法类 icon 的争议说明：**表意正确优先于设计师个人偏好**。日期问题来自 `DATE`/`timestamp` 与 JS `Date` 的混用教训，因此 `database.ts` 里对日期有 **normalize** 策略——后续改字段类型要先跑一遍边界用例。

##### 实现侧提示

- `saveReceipt`、`normalizeDate`、收据 `input_type`、删除路径需与 Storage RLS 一致。  
- 聊天转小票：`chat-to-log` + Gemini；注意 Web 专属。

#### 5.4.2 收入（Income）

与费用对称；REQ 同等适用于「收入侧列表是否展示录入方式、日期忠实性、删除清理」——实现上见 `invoices.ts` 等。

#### 5.4.3 主数据

**需求要点**：类目、**归因（attributions，曾用 purposes）**、实体、账户、库存主数据均在 **space 范围**内 CRUD；合并映射避免重复名称爆炸——具体算法以 `entities.ts` / `accounts.ts` 为准。

---

### 5.5 可选：进销存与 AI 库存

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.5-01** | 仅在 `showAiInventory` 为真时暴露入口；防止实验模块误入生产导航。 |
| **REQ-5.5-02** | 入出库列表与聊天类型映射一致，保证右栏 AI 上下文与当前列表相符。 |

---

### 5.6 报税与事务所协作（Tax Filing & Firm）

#### 5.6.1 报税任务行（Todo 行 UI）

**能力摘要**：`TaxFilingTodosView`（及 Web/原生双份同步时注意）展示 WBS、状态、文件数、责任方、Depends on、合并依赖等。

##### 需求要点（REQ）

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.6-01** | **状态 pill** 在行内垂直居中，不与顶部「贴齐」导致视觉失衡。 |
| **REQ-5.6-02** | **文件计数列** 与 **标题列** 间距需考虑 **缩进 + 折叠箭头 + WBS + 标题 + 责任方标签** 的总占位，窄屏下也不与文件列重叠。 |
| **REQ-5.6-03** | **Depends on 区域** 与 **状态操作区**（加号/终止/恢复等）之间须有固定最小间距，或通过换行避免控件互相遮挡。 |
| **REQ-5.6-04** | 依赖 **编号 chip**：大圆角 pill；**去掉箭头前缀**；**X 移除** 仅在 hover/press 时出现；X 的占位策略不能导致编号区宽度跳变（曾迭代：角标 → 内置圆形灰底关闭）。 |
| **REQ-5.6-05** | **Depends on 文案 + merge 入口**：热区应落在 **depends 控件区域**，而非误绑在整个标题行（曾修正热区错误）。 |
| **REQ-5.6-06** | **有依赖值时「Depends on」文案常显**；无依赖时仍可仅在进入 depends 区域时提示（依最终实现与视觉稿对齐）。 |
| **REQ-5.6-07** | **责任方标签**：**pending（被依赖锁定）** 的任务仍显示责任方；**canceled** 任务隐藏责任方；pending 时可用弱色样式区分。 |
| **REQ-5.6-08** | **状态色**：与 Web 列表对齐（如 processing 色值）；Firm 与 Client、**列表与详情** 需一致调整。 |
| **REQ-5.6-09** | **依赖选择浮层**：高度需能覆盖约 **12 行** 一级选项而少滚动（具体像素随设计）。 |
| **REQ-5.6-10** | 移动端 **Engagement 详情** 与 Web 的信息层级可对齐（如状态标签与 todos 信息行的相对位置等专项）。 |

##### 背景与取舍

Todo 行是 **高信息密度** 控件：同时承载树形缩进、状态机、附件统计、多角色标签、依赖图编辑入口。迭代中多次调整的是 **「谁和谁共享一行高度」** 的问题——实现上往往在 `alignItems`、`flex gap`、`maxLeftBlockWidth`、绝对定位的 remove 徽章之间权衡；**后续改一行样式要回归三种宽度：窄 Web、宽 Web、移动端。**

##### 实现侧提示

- 核心组件：`vouchap-app/src/mobile-ui/components/TaxFilingTodosView.tsx`（及可能的 `components/` 副本，以仓库为准保持双端同步）。  
- `maxLeftBlockWidth` 一类计算务必把 **责任方标签宽度** 算进去，否则「改了 margin 仍挤」会复发。

#### 5.6.2 报税附件与 AI 识别

##### 需求要点（REQ）

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.6-11** | **多文件 AI 识别** 时，**文件与 Todo 的绑定** 必须与识别结果一致，避免出现「文件名对了但挂错 task」；需要 **匹配/排序** 策略而不仅是按数组下标对齐。 |
| **REQ-5.6-12** | 附件预览链路（表格/Word/PDF）应区分 MIME 与降级路径，错误应可感知而非白屏（细则见 `shared-logic` 各 preview 助手）。 |

##### 实现侧提示

- `tax-filing-recognition-run.ts`、`tax-filing-task-matcher.ts`、`tax-filing-uploader-name.ts` 等；改 prompt 或批次接口时优先加 **回归用例**（同批异序文件）。

#### 5.6.3 事务所 CRM 与术语

##### 需求要点（REQ）

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.6-13** | 产品对外术语 **Orders → Engagements**（模块入口、列表、详情英文文案一致）。 |
| **REQ-5.6-14** | **Open invite / 邀请历史**：移动端应复用 Web **表格信息架构**，在表格基础上做响应式优化，而非另一套完全割裂的卡片逻辑（除非产品明确放弃一致性）。 |
| **REQ-5.6-15** | **Add client** 浮层：顶部说明文案精简；流程覆盖 **创建客户 + 发邮邀请 + SKU/服务**。 |
| **REQ-5.6-16** | **公开的 firm 邀请落地** 与 **邮件链接** 一致：**不自动深跳**，由用户触发（与官网哲学一致，防止环境吞链）。 |
| **REQ-5.6-17** | Firm 各模块 **入口 icon** 在 Web/Mobile 间对齐（Clients、Engagements 等）。 |
| **REQ-5.6-18** | 客户列表 **进度条/主色** 等与 Web 对齐（移动端曾单独要求绿色系一致）。 |

##### 数据与合并（REQ）

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.6-19** | **invitee 与客户表合并** 方向：将历史 `invitee_clients` 并逐步收敛到 `firm_clients`（或等价最终表），迁移须可回滚、RLS 跟随切换；**具体列与触发器以 migration 为准**。 |

##### 实现侧提示

- 业务逻辑大头：`shared-logic/firm.ts`、`firm-clients.ts`；入口路由 `firm/clients*`、`firm/engagements*` 等。  
- **任何 firm 表策略变更**先读 `supabase/migrations` 近期文件，避免只改 UI 导致 42501。

#### 5.6.4 权限与分配

##### 需求要点（REQ）

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.6-20** | **Management → Permissions**：角色能力应与 **order managers / 新权限运行时** 一致；数据库已迁移「以 order_managers 为运行时」时，UI 不得仍假装旧模型。 |
| **REQ-5.6-21** | **客户负责人重分配** 等敏感操作应限制在明确角色（如 admin），防止一线用户误操作所有权。 |

---

### 5.7 聊天与助手

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.7-01** | **Eric**：上下文绑定报税/项目/附件 staging；路由切换时聊天类型随之切换（`_layout` 内映射）。 |
| **REQ-5.7-02** | **Cody**：绑定 Clients 模块上下文，不在无关页面误开客户助手。 |
| **REQ-5.7-03** | 聊天记录、附件引用类型与表结构演进需向后兼容（`ai_chat_logs` 曾调整列与 FK）。 |

---

### 5.8 Edge Function：邀请邮件

| ID | 需求陈述 |
|----|-----------|
| **REQ-5.8-01** | **新邮箱**：`send-invitation-email` 可走 `inviteUserByEmail` 并尊重 `redirectTo`。 |
| **REQ-5.8-02** | **已注册邮箱**：不再强依赖该函数发信，以库内邀请 + App 内通知为主，避免重复账户错误刷屏。 |

---

## 6. 非功能需求

### 6.1 通用

| ID | 需求陈述 |
|----|-----------|
| **REQ-6.1-01** | **RLS**：业务表与 Storage 对象对 space / firm 成员可见性正确；官网仅用 anon 调公开 RPC。 |
| **REQ-6.1-02** | 关键环境变量缺失时，**开发体验**上应可见警告（而非静默连错库）。 |

### 6.2 发布与工程（来自迭代中反复出现的需求）

| ID | 需求陈述 |
|----|-----------|
| **REQ-6.2-01** | **iOS / Android / npm** 版本号与构建号需 **多文件同步**（`package.json`、`app.config.js`、`build.gradle`、Plist 等）——单改一处会导致商店拒审或用户困惑。 |
| **REQ-6.2-02** | **Android** 上架包须与真实 `versionCode`/`versionName` 一致（曾出现包内仍为旧版本号的案例）。 |
| **REQ-6.2-03** | **Google Play** 域名/应用链接声明需与仓库 manifest 一致后重建（具体问题随当期政策）。 |
| **REQ-6.2-04** | **iOS 归档体积** 过大时需排查资源与依赖（非功能但影响分发）；**CocoaPods** 卡住时应具备 verbose/网络/缓存排查 playbook。 |

---

## 7. 假设与依赖

| ID | 陈述 |
|----|------|
| **REQ-7.1** | Supabase Auth、SMTP、邮件模板中的 **redirect URL 集合** 已包含：官网落地页、平台 Web、`vouchap://` 等；改一处置三处。 |
| **REQ-7.2** | Gemini 密钥与 Expo extra 在 EAS/本地构建可注入。 |
| **REQ-7.3** | **迁移顺序**：涉及 `order_managers` / `invitee` / policy 依赖列的迁移，必须按仓库内文件名时间序执行；半途执行会导致 `cannot drop column … policy depends on it`——属**操作依赖**而非应用 bug。 |

---

## 8. 验收与需求追溯

### 8.1 验收清单（摘要）

- **官网**：`/auth/confirm`、`/client-join` 手动跳转逻辑可用；无效 token 有提示。  
- **认证/空间**：多邀请、踢出恢复、客户认领可测通。  
- **小票**：录入方式图标、日期、删除清理；旧数据兼容。  
- **报税 Todo 行**：窄屏无重叠；Depends on 与状态按钮不挡；责任方与 pending/cancel 规则正确。  
- **多附件 AI**：刻意打乱文件顺序仍绑定正确 Todo。  
- **Firm**：Engagements 文案、邀请链路、权限与 RLS。  

### 8.2 与附录 B 的关系

- 正文 **REQ-x.y-nn** 为「已消化吸收」的需求点，适合评审与排期。  
- **`docs/PRD-Appendix-B-User-Prompts-Full-Corpus.md`** 保留 **逐条原始措辞**，用于争议时查证「当时怎么说的」。  
- 若迭代引入新的大块需求，建议：**先更新附录 B（重新导出 + 跑 `build_prd_user_corpus.py`）→ 再在本章增补 REQ**。

---

## 附录 A：路由与模块索引

| 领域 | 主要路由/入口 | 主要代码模块（`vouchap-app`） |
|------|----------------|-------------------------------|
| 认证 | `login`、`register`、`reset-password`、`auth/*` | `auth.ts`、`auth-helper.ts` |
| 空间/资料 | `management`、`space-manage`、`space-members` | `auth.ts`、空间相关表 |
| 费用 | `receipts`、`receipt-details/*` | `database.ts`、`gemini.ts` |
| 收入 | `invoices`、`invoice-details/*` | `invoices.ts`、`gemini.ts` |
| 报税 | `tax-filing/*`、`firm/engagement/*` | `firm.ts`、`tax-filing-*.ts`、`TaxFilingTodosView` |
| 事务所 CRM | `firm/clients/*`、`firm/engagements`、`firm/permissions` 等 | `firm.ts`、`firm-clients.ts` |
| 库存（可选） | `inbound*`、`outbound*`、`ai-inventory` | 库存相关与 feature-flags |
| 聊天 | `_layout` 与 `chat-to-log` | `chat-logs.ts`、`gemini-helper.ts` |
| 官网 | `vouchap-website/app/*` | 匿名 RPC `firm_get_client_invite_info` |

---

## 附录 B：原始指令存档

| 文件 | 用途 |
|------|------|
| **`docs/PRD-Appendix-B-User-Prompts-Full-Corpus.md`** | 去重后的原始用户/Composer 文本；带自动标签；**不作评审主文档**。 |
| **`docs/PRD-Section9-User-Driven-Requirements.md`** | 按标签分组的脚本输出副本。 |
| **`docs/build_prd_user_corpus.py`** | 从 `Vouchap_Full_Chats_Merged.md` 与 `Cursor_Deep_Scrape.txt` 重建附录。 |

---

*— 文档结束 —*
