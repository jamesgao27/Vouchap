# Proposal：Wholestore（已归档）

> **现行稿已迁至 Adaven-platform**：`Adaven-platform/docs/PROPOSAL-Wholestore.md`  
> 本文件保留 2026-08-17 内部讨论草案，不再作为对外报价依据。

**面向厂家与经销商的 B2B 下单、履约与结算平台**  
**状态**：已归档（内容过细，已被精简商务稿替代）  
**日期**：2026-08-17  
**依据**：2026-08-11 计划书；订单扫码关联物流；页面级功能架构；AI 同步编码（不单列手写编码人周）

产品面向用户的文案使用 **English**（Factory / Dealer / Invoice / Tracking 等）。本文为内部讨论，使用中文。

---

## 0. 一句话

经销商在 **Wholestore** 注册、看专属价、下单、查账单与物流；厂家审核客户、管价格与订单，发货时 **扫码把物流单号绑到订单**，双方在门户直接看物流进展。库存与履约账本在客户的 **ERP（默认 Finale Inventory）**；发票与应收在客户的 **QuickBooks Online**。

本提案重点：

1. **功能架构**：大模块 + 每个模块下的 **具体交互页面**（谁用、页上做什么）。  
2. **客户配合**：上线前必须确认的 ERP / QuickBooks / 物流版本，以及 API 授权、沙箱、主数据与验收窗口。

报价按人周计算，但 **不单列开发人员从零编码**：产品经理定义页面的同时输出提示词，AI 编程同步出代码。人周主要计产品/提示词、联调与验收。

---

## 1. 目标与非目标

### 1.1 要解决的问题

- 经销商靠邮件/表格下单，错单、漏单、价格不一致。  
- 库存在 ERP、订单在表格、账在会计软件，三套对不上。  
- 发货后物流单号散落在面单/聊天里，厂家与经销商无法在同一订单上跟踪。  
- 厂家无法标准化入驻审核、客户价、账期与催款。

### 1.2 非目标（完整版之前不做）

- 自动信用审批、多级采购审批、复杂催款工作流  
- 退货与 Credit Memo、EDI、多币种  
- 多厂家共用的公开市场（产品支持多 Factory Space；**首期交付**按一个厂家 + 多家经销商）  
- QuickBooks Desktop（除非客户书面改范围）  
- 门户、ERP、QBO 三方各自开票/收款（禁止重复入账）  
- 自建承运商运力或仓储 WMS（扫码只做 **订单↔运单关联 + 轨迹查询**）

---

## 2. 技术栈（节略）

| 层 | 选型 |
|---|---|
| 应用代码 | Cursor 全程编写 |
| 数据与后端 | **Supabase** |
| Web 托管与外部接口代理 | **Cloudflare** |
| 移动端 | Expo（仓库扫码为主） |
| 客户系统 | ERP（默认 Finale）、QBO、承运商/轨迹 API |

---

## 3. 角色与租户

| 产品文案 | 组织 | 说明 |
|---|---|---|
| Factory | 厂家 Space | 审核经销商、配置价格与授信、监控订单、扫码发货绑单 |
| Dealer | 经销商 Space | 企业入驻、内部采购员、下单、查账、查物流 |
| Member / Admin / Warehouse | Space 成员 | 每 Space 多名用户；Warehouse 可仅有发货扫码权限 |

约束：用户与 Space **只属于 Wholestore**，与其它应用账号不通。经销商入驻须厂家审核后才启用下单。

---

## 4. 三个系统的分工

```
经销商 Web / App              厂家 Web / 仓库扫码
        \                        /
              Wholestore 门户（第 5 节各页面）
                    |
            +-------+--------+
            |                |
        客户 ERP            QuickBooks Online
     商品 / 库存 / 销售订单     Invoice / 应收 / 总账
            |
     承运商 / 轨迹（包裹进度）
```

| 系统 | 事实来源 | 门户页面上呈现什么 |
|---|---|---|
| **Wholestore** | 用户、入驻、客户价、购物车、门户订单、运单绑定 | 下单与查单；**不**当库存账本、**不**当总账 |
| **客户 ERP** | SKU、库存、销售订单、出库数量 | Shop 库存提示；Order 上的履约数量 / ERP 单号 |
| **QuickBooks Online** | Invoice、应收、Payment | Invoices / Invoice 只读 |
| **承运商 / 轨迹** | 运输节点 | Tracking 时间线 |

原则：出库数量以 ERP 为准；**哪张运单属于哪张门户订单** 以扫码/录入绑定为准；同一 Invoice / Payment 只由一条链路创建。

---

## 5. 功能架构（大模块 × 页面）

页面标题用 **English**。「谁」：Factory Admin / Dealer Admin / Buyer / Warehouse / Viewer。  
采购主路径在 **Web**；**Mobile** 以扫码发货和查单 / 查轨迹为主。

### 5.1 导览

```
经销商 Web                         厂家 Web
Sign In / Sign Up                  Sign In
Apply as Dealer ──审核──►          Home（待办）
Shop → Product → Cart → Checkout   Dealers / Applications
Orders → Order → Tracking          Products / Price Lists
Invoices → Invoice                 Orders → Order → Add Tracking
Team / Company Profile             Invoices · Team · Activity
                                   Connections / Sync Issues

移动端（双方查单）                 移动端（仓管）
Orders → Order → Tracking          Ship → Find Order → Scan Label → Confirm
```

```
[M1 账号与空间] → [M2 入驻与经销商]
        ↓
[M3 商品与价格] → [M4 购物车与下单]
        ↓
[M5 订单与履约] → [M6 发货与物流] → [M7 账单与账期]
        ↑
[M8 厂家工作台]  [M9 成员与审计]  [M10 连接与同步]
```

---

### M1 账号与空间

登录、注册、加入组织、切换当前 Factory / Dealer。未登录不能进业务页。

| 页面 | 端 | 谁 | 页上做什么 |
|---|---|---|---|
| **Sign In** | Web / Mobile | 全员 | 邮箱+密码登录；去注册、重置密码 |
| **Sign Up** | Web | 新用户 | 注册；随后去申请经销商或等待邀请 |
| **Reset Password** | Web | 全员 | 申请重置；设新密码后回 Sign In |
| **Accept Invitation** | Web | 被邀请人 | 打开邀请链接，确认加入某 Space 与角色 |
| **Select Space** | Web / Mobile | 多组织用户 | 属多个组织时先选当前 Factory 或 Dealer |
| **Account Settings** | Web | 全员 | 改显示名、密码；查看自己所属组织 |

顶栏（非独立页）：当前组织名、切换、退出。SSO 为加项，不做单独页。

**客户配合**：首批厂家管理员邮箱；是否允许经销商自助 Sign Up（默认允许，须审核后才能进 Shop）。

---

### M2 入驻与经销商

经销商提交企业资料；厂家审核通过后才开放下单。通过后维护档案与经销商团队。

| 页面 | 端 | 谁 | 页上做什么 |
|---|---|---|---|
| **Apply as Dealer** | Web | 申请人 | 填公司名、税号、地址、联系人；提交；未完成可存草稿 |
| **Application Status** | Web | 申请人 | 看 Pending / Approved / Rejected；驳回原因；可再提交 |
| **Dealer Applications** | Web | Factory Admin | 列表+筛选（状态、日期）；点进审核 |
| **Review Application** | Web | Factory Admin | 看资料；Approve（可选分配价盘/账期）或 Reject（必填原因） |
| **Dealers** | Web | Factory Admin | 已通过经销商目录；搜索；进档案 |
| **Dealer Profile**（厂家看） | Web | Factory Admin | 启用/停用下单；账期；绑定价盘；填写 ERP / QBO 对照码 |
| **Company Profile** | Web | Dealer Admin | 维护本企业资料（改关键字段可要求厂家再确认） |
| **Team Members**（经销商） | Web | Dealer Admin | 本企业成员；改角色（Admin / Buyer / Viewer）；停用 |
| **Invite Member** | Web | Dealer Admin | 填邮箱与角色发邀请（对方走 Accept Invitation） |

**客户配合**：审核要哪些字段；谁点 Approve；是否先导入已有经销商（第 7.4 节）。

---

### M3 商品与价格

经销商按自己的价盘浏览可售商品。厂家维护价盘；SKU 来自 ERP 同步，本模块 **没有「新建 SKU」页**。

| 页面 | 端 | 谁 | 页上做什么 |
|---|---|---|---|
| **Shop** | Web | Buyer / Dealer Admin | 搜索、筛选；看客户价、库存提示、MOQ；加入购物车 |
| **Product** | Web | 同上 | 规格、包装、价、可售数量；改数量加入购物车 |
| **Synced Products** | Web | Factory Admin | 只读 SKU 列表；上次同步时间 |
| **Product**（厂家只读） | Web | Factory Admin | 对照 ERP 展示字段；不在此改库存 |
| **Price Lists** | Web | Factory Admin | 价盘列表；新建 / 复制 / 停用 |
| **Edit Price List** | Web | Factory Admin | 按 SKU 填客户价、MOQ、整箱/散件；可文件导入 |
| **Assign Price List** | Web | Factory Admin | 把价盘绑到一个或多个经销商（也可从 Dealer Profile 进） |

无价且无默认策略的 SKU 不出现在 Shop。经销商看不到他人价格。

**客户配合**：ERP 版本与只读授权（第 7.1 节）；价盘文件（第 7.4 节）。

---

### M4 购物车与下单

从选品到提交一张门户订单。提交后系统去写 ERP（用户进确认页 / 订单详情，不进技术配置页）。

| 页面 | 端 | 谁 | 页上做什么 |
|---|---|---|---|
| **Cart** | Web | Buyer / Dealer Admin | 改数量、删行；MOQ / 整箱不符时页内提示；去结算 |
| **Checkout** | Web | 同上 | 确认行与客户价、送货地址；填 **PO#**；Place Order |
| **Order Placed** | Web | 同上 | 显示门户订单号；打开 Order |
| **（操作）Reorder** | Web | 同上 | 在历史 Order 上 Copy to Cart，回 Cart 再改再下 |

MVP：完整采购只在 Web。Mobile 不做 Cart / Checkout。

**客户配合**：PO# 是否必填；提交后是否还要厂家再确认（默认提交即进入履约）。

---

### M5 订单与履约

双方查看订单。一笔门户订单只对应 **一张** ERP 销售订单；失败时厂家在 Sync Issues 重试，经销商不必再 Place Order。

| 页面 | 端 | 谁 | 页上做什么 |
|---|---|---|---|
| **Orders** | Web / Mobile | 经销商看本企业；厂家看全部关联经销商 | 按状态 / 日期 / PO# / 订单号筛选；进详情 |
| **Order** | Web / Mobile | 同上 | 行、数量、价、状态；只读 ERP 单号与履约数量；去 Tracking、Invoice |
| **Sync Issues** | Web | Factory Admin | 写入 ERP 失败的订单；看错误摘要；**Retry**（不得开出第二张 ERP 单） |

对用户展示的状态（English）：Submitted / In fulfillment / Partially shipped / Shipped / Invoiced / Failed to sync。无缺货处理页、无退货页。

**客户配合**：ERP 写单权限、沙箱样例单、必填字段（第 7.1 节）。

---

### M6 发货与物流

仓管把物流单号绑到订单；厂家与经销商在同一订单上查阅轨迹。一单可多运单。同一跟踪号不能绑到第二张单。

| 页面 | 端 | 谁 | 页上做什么 |
|---|---|---|---|
| **Ship** | Mobile | Warehouse / Factory Admin | 发货首页：开始扫码，或看未发完订单 |
| **Find Order** | Mobile | 同上 | 扫订单条码 **或** 搜订单号 / PO#；确认是这一单 |
| **Scan Label** | Mobile | 同上 | 扫面单，得到承运商 + Tracking #；失败则去手工页 |
| **Enter Tracking** | Mobile / Web | 同上 | 选承运商、键入跟踪号 |
| **Confirm Shipment** | Mobile / Web | 同上 | 核对订单与跟踪号后 Confirm；重复号则拒绝并提示已绑哪一单 |
| **Tracking** | Web / Mobile | Factory 与对应 Dealer | 该单全部运单；当前状态；时间线（Shipped / In transit / Out for delivery / Delivered / Exception） |
| **Add Tracking** | Web | Factory Admin / Warehouse | Web 补录（结果与扫码确认相同） |
| **（操作）Unbind Tracking** | Web | Factory Admin | 绑错时解绑（须再确认一次） |

出库件数以 ERP 为准；运单归属以本模块绑定为准。

**客户配合**：承运商、轨迹 API、面单样张、手机还是扫码枪（第 7.3 节）。

---

### M7 账单与账期

只读账期与 Invoice。门户不做在线支付（除非另开范围）。开票只走一条链路。

| 页面 | 端 | 谁 | 页上做什么 |
|---|---|---|---|
| **Account Balance** | Web | Dealer Admin / 财务 Viewer；厂家在 Dealer Profile 可见摘要 | 账期（Net 15/30/60）、应付合计、逾期提示 |
| **Invoices** | Web | 经销商看本企业；厂家看全部 | 号、日期、金额、状态；筛逾期 |
| **Invoice** | Web | 同上 | 只读头与行、关联订单、QBO 发票号；**无「新建发票」** |

催款、对账、Credit Memo 放完整版。

**客户配合**：QBO 授权、科目与 Terms、谁开票（第 7.2 节）。

---

### M8 厂家工作台

登录后的首页。审核 / 价盘 / 订单仍进入上面各模块页面。

| 页面 | 端 | 谁 | 页上做什么 |
|---|---|---|---|
| **Home**（Factory） | Web | Factory Admin | 待审核数、待发货/异常订单、同步失败条数；快捷进 Applications / Orders / Sync Issues |
| **Home**（Dealer） | Web | Dealer | 最近订单、待付发票、在途物流；快捷进 Shop / Orders / Invoices |

**客户配合**：指定 1–2 名厂家管理员做 UAT。

---

### M9 成员与审计

厂家团队与关键操作记录。经销商团队见 M2。

| 页面 | 端 | 谁 | 页上做什么 |
|---|---|---|---|
| **Team Members**（厂家） | Web | Factory Admin | 厂家成员；角色 Admin / Warehouse / Viewer；邀请、停用 |
| **Invite Member**（厂家） | Web | Factory Admin | 邮箱 + 角色发邀请 |
| **Activity** | Web | Factory Admin | 审核、改价、下单、绑/解绑运单、重试同步；按人 / 对象 / 时间筛 |
| **Activity Detail** | Web | Factory Admin | 单条：谁、何时、做了什么 |

**客户配合**：谁仓管、谁财务只读（第 7.4 节 D4）。

---

### M10 连接与同步

厂家查看外部系统是否连通。不在此改 ERP / QBO 里的业务单据。

| 页面 | 端 | 谁 | 页上做什么 |
|---|---|---|---|
| **Connections** | Web | Factory Admin | ERP / QBO / 轨迹是否已授权；引导去对方网站完成授权 |
| **Sync Health** | Web | Factory Admin | 商品同步、写单、拉发票、拉轨迹的上次成功 / 失败时间 |
| **Job History** | Web | Factory Admin | 最近作业列表（偏查询；失败重试在 Sync Issues） |

密钥与服务器参数不做客户可编辑页。

**客户配合**：生产切换窗口、双方值班人（第 7.5 节）。

---

### 5.2 页面清单：MVP vs 完整版

| 模块 | MVP 必须有的页面 | 完整版再加 |
|---|---|---|
| M1 | Sign In / Up、Reset、Accept Invitation、Select Space、Account Settings | SSO |
| M2 | Apply、Status、Applications、Review、Dealers、Profile / Team / Invite | 额度、多级审批 |
| M3 | Shop、Product、Synced Products、Price Lists、Edit / Assign Price List | 复杂阶梯、多仓库存页 |
| M4 | Cart、Checkout、Order Placed、Reorder | 模板、快速补货、Mobile 下单 |
| M5 | Orders、Order、Sync Issues | 缺货处理、退货单 |
| M6 | Ship 全流程、Tracking、Add / Unbind Tracking | 批量扫、称重拍照、异常工单 |
| M7 | Account Balance、Invoices、Invoice | 催款、对账、在线支付 |
| M8 | Factory / Dealer Home | 分析看板 |
| M9 | Team、Invite、Activity、Activity Detail | 更细权限矩阵 |
| M10 | Connections、Sync Health、Job History | 客户自助改字段映射 |

### 5.3 端分工

| 端 | MVP 页面范围 |
|---|---|
| **Web** | 入驻、价盘、下单、订单、账单、工作台、连接状态、Web 补录跟踪号 |
| **Mobile** | Sign In、Select Space、Orders、Order、Tracking；仓管 **Ship → Find Order → Scan / Enter → Confirm** |

---

## 6. 主数据流（验收路径）

按页面走通即可验收：

1. **Synced Products / Shop**：ERP 有 SKU 与库存后，Shop 能展示。  
2. **Apply → Review → Dealers**：入驻通过后，**Edit / Assign Price List** 可定价。  
3. **Cart → Checkout → Order**：下单成功；Order 上出现 **一个** ERP 单号。  
4. **Ship → Confirm**（或 **Add Tracking**）：Order 上出现运单。  
5. **Tracking**：厂家与经销商看到同一进度。  
6. **Invoice**：对应 **一张** QBO 发票。  
7. 同一跟踪号再扫、同一单再 Place Order：不得出现第二张 ERP 单或第二张发票（**Sync Issues** 只允许 Retry）。

---

## 7. 客户需要配合的工作（上线关键路径）

> 日历往往卡在客户侧授权与字段确认。下列事项建议作为合同附件，未齐备则不进入对应联调周。

### 7.1 ERP（库存与履约）— 默认 Finale Inventory

须 **书面确认** 后再做适配，避免按错版本对接。

| # | 客户交付 | 说明 |
|---|---|---|
| E1 | **产品与版本** | 确认是 Finale Inventory（云）或其它 ERP。若不是 Finale，适配另估。 |
| E2 | **API 文档与环境** | 官方 API 版本、地址；**沙箱**与生产是否分开。 |
| E3 | **授权方式** | API Key / OAuth 等；创建 **专用集成账号**（不用个人登录）。 |
| E4 | **权限范围** | 至少：读商品与库存、写销售订单、读履约状态。 |
| E5 | **主数据规则** | SKU、单位、仓库代码；ERP 客户 ID 如何对应门户经销商。 |
| E6 | **写单必填项** | 税、货运方式、默认仓库、备注；各给一份已成功的手工样例单。 |
| E7 | **测试数据** | ≥20 个真实 SKU、可反复下单的测试客户（及测试仓库，若适用）。 |
| E8 | **联系人** | ERP 管理员 + 能改权限的人；建议 2 个工作日内响应。 |

无沙箱时：写单联调延期，等待按阻塞日历另计。

### 7.2 QuickBooks Online

| # | 客户交付 | 说明 |
|---|---|---|
| Q1 | **产品确认** | **QuickBooks Online**（非 Desktop）。Desktop 为新项目。 |
| Q2 | **公司文件** | 生产 Company 与 **沙箱 Company**。 |
| Q3 | **应用授权** | QBO 管理员在约定窗口完成授权。 |
| Q4 | **权限** | 读客户 / Invoice；若由门户开票则还需写 Invoice（及是否写 Payment）。 |
| Q5 | **科目与税** | 收入、应收、税率、Terms（Net 15/30/60）与门户账期对照。 |
| Q6 | **客户对照** | QBO Customer 与门户经销商如何匹配。 |
| Q7 | **开票时点与写入者** | 发货后 vs 下单后开票；**只有一侧**创建 Invoice。 |
| Q8 | **联系人** | 财务 + 能在 Intuit 后台点授权的人。 |

### 7.3 物流与轨迹

| # | 客户交付 | 说明 |
|---|---|---|
| L1 | **承运商名单** | MVP 锁定 **2–3 家**（如 UPS / FedEx / USPS）。超出另估。 |
| L2 | **轨迹来源** | 各家官方 Tracking，或一家聚合商（产品名与套餐）。 |
| L3 | **版本与账号** | API 版本、账号、是否支持主动推送更新。 |
| L4 | **面单规则** | 各家 **面单样张**（含条码）；扫完得到的是跟踪号还是内部单号。 |
| L5 | **测试件** | 每家至少 1 个可查跟踪号（运输中 + 已签收更好）。 |
| L6 | **仓库设备** | 手机还是扫码枪。 |
| L7 | **联系人** | 仓库主管 + 物流账号管理员。 |

### 7.4 主数据、品牌与验收

| # | 客户交付 | 说明 |
|---|---|---|
| D1 | 经销商名单 | 公司名、联系人、邮箱、ERP 客户代码、QBO Customer（若已有）。 |
| D2 | 价盘 | 按经销商或等级的客户价；MOQ / 整箱规则。 |
| D3 | 品牌 | Logo、门户子域名。 |
| D4 | 用户名单 | 厂家 Admin、仓管、财务只读；首批经销商 Admin。 |
| D5 | UAT | 指定验收人；按第 6 节页面路径签字；预留 5–8 个工作日。 |
| D6 | 生产切换 | 切生产日期；期间少改价、少改权限。 |

### 7.5 责任边界

| 我方 | 客户 |
|---|---|
| 标准页面与扫码流程；按已确认版本做适配 | 开通账号、授权、沙箱、样张 |
| 联调与 UAT 陪跑 | 业务规则书面确认；按时响应权限问题 |
| 托管（Supabase + Cloudflare） | 自付 Finale / QBO / 承运商 / 轨迹原厂费用 |

客户延迟授权则排期顺延；合同建议写明等待超过 N 个工作日则暂停或改期。

---

## 8. 实施阶段（日历）

以第 7 节交付物齐备为前提。

| 阶段 | 日历周 | 累计 | 主要结果（按页面） |
|---|---|---|---|
| **S0 拍板** | 数日–1 周 | — | 第 10 节确认书；ERP / QBO / 物流版本锁定 |
| **S1 集成验证** | 2–3 | 2–3 | Shop 能读到测试 SKU；Checkout 后 Order 有 ERP 号；Invoice 能打开；Ship 绑一单能进 Tracking |
| **S2 标准 MVP** | 4–6 | **6–9** | 第 5.2 节全部 MVP 页面（定义与出码同一窗口） |
| **S3 完整版** | 4–6 | **10–15** | 第 5.2 节完整版页面（另立项） |

S2 日历跟 **产品经理写页面说明 + 提示词** 走，不另加一段「开发编码周」。卡住的是 S1 联调与客户授权，不是手写页面。

首期客户适配（标准 MVP 可演示之后）：连账号、导价盘、扫码试跑、UAT，约 **3–5 周**（含客户响应）。

---

## 9. 工作量与报价

### 9.1 计价方法（AI 同步编码）

| 计什么 | 不计什么 |
|---|---|
| 产品经理定义页面的同时 **写出可执行提示词** | 开发人员按模块从零手写的编码人周 |
| 提示词落地后的合入、走查、改错（少量） | 「先出 PRD、再排开发」的第二段工期 |
| ERP / QBO / 轨迹 **联调**、UAT、等客户授权 | 把 AI 出码再乘一遍传统人海系数 |

工作方式：产品经理按第 5 节逐页写清交互并输出提示词 → AI 编程在同一日历窗口出页面代码 → 不另雇一组开发把同一范围再写一遍。

- 单位仍是 **人周**（40 人时）。  
- 成本单价：**CAD 3,000 / 人周**（约 **USD 2,200 / 人周**；约 CAD 75 / 人时、USD 55 / 人时）。签约可改费率，人周不变。

### 9.2 标准产品研发（公司做一次，多客户复用）

**按工作类型（报价用这张表）**

| 工作类型 | 人周 | 说明 |
|---|---|---|
| 产品定义 + 提示词（M1–M10） | 4.5 | 与出码同一窗口，见下表人日 |
| 合入 / 走查 / 改明显错误 | 1.5 | 不是从零编码；与上项基本并行，只计增量 |
| ERP / QBO / 轨迹联调（S1） | 3 | 提示词不能代替真账号联调 |
| 黄金路径验收（第 6 节） | 1.5 | 按页面走通 |
| 接口与现场差异缓冲 | 2 | 文档与实口不一致 |
| **MVP 立项合计** | **13 人周** | 日历约 **6–9 周**（授权齐备时） |

**按模块：只计产品经理人日（编码不同步加计）**

| 模块 | 产品+提示词（人日） | 另计开发编码 |
|---|---|---|
| M1 账号与空间 | 1.5 | 无（同步完成） |
| M2 入驻与经销商 | 2 | 无 |
| M3 商品与价格 | 3 | 无 |
| M4 购物车与下单 | 2.5 | 无 |
| M5 订单与履约 | 2 | 无 |
| M6 发货与物流 | 3.5 | 无 |
| M7 账单与账期 | 2 | 无 |
| M8 工作台 | 1.5 | 无 |
| M9 成员与审计 | 1 | 无 |
| M10 连接与同步 | 1.5 | 无 |
| **小计** | **21 人日 ≈ 4.5 人周** | **0** |

完整版（S3）同样不单列手写编码，另约 **8–12 人周**（产品+提示词与联调），不计入首期。

| 范围 | 人周 | @ CAD 3,000 / 人周 | 约合 USD（@ 2,200） |
|---|---|---|---|
| 标准 MVP | 13 | **CAD 39,000** | **约 USD 29,000** |
| 完整版增量 | 10（中位） | CAD 30,000 | 约 USD 22,000 |
| 完整版累计 | 23 | CAD 69,000 | 约 USD 51,000 |

若仍按「模块手写编码」计，仅 MVP 页面就会回到约 40+ 人周；本提案 **不采用** 该算法。ERP 非 Finale 只上调 **联调** 人周，不加回手写编码。

### 9.3 单客户上线适配（按工作量报价）

适配几乎没有新页面编码，人周是对照、授权、导入与陪跑：

| 适配项 | 人周 | 客户必须先完成 |
|---|---|---|
| ERP 连接、字段对照、Shop / Order 验收 | 1.0 | 第 7.1 节 E1–E8 |
| QBO 授权、Invoice 页能打开 | 1.0 | 第 7.2 节 Q1–Q8 |
| 轨迹 + 面单试扫（Ship / Tracking） | 0.75 | 第 7.3 节 L1–L7 |
| 经销商与价盘导入 | 0.75 | D1–D2 |
| 域名、Logo、账号 | 0.5 | D3–D4 |
| UAT 按第 6 节走页面 | 1.5 | D5–D6 |
| **合计** | **5.5 人周** | |
| 等待缓冲 | 1 | 授权不全时启用 |
| **适配报价基数** | **5.5–6.5 人周** | **CAD 16,500–19,500（约 USD 12,000–14,000）** |

不含：新页面、第二套 ERP、QBD、EDI、退货、全量历史迁移、第 4 家及以后承运商。溢出按人周另报。

对外合同可只签第 9.3 节 + 订阅；第 9.2 节作为公司立项，不默认打进首个客户账单。

### 9.4 订阅（上线后）

覆盖托管、同步、标准页面升级与支持，不是把 13 人周摊进一个月。

| 档 | 月费 USD | 含 |
|---|---|---|
| Launch | 350–450 | 约定单量、标准同步、2–3 家轨迹、邮件支持 |
| Grow | 550–750 | 更高配额、工作时段支持 |
| Scale | 850–1,100 | SLA、更高配额 |

Finale / QBO / 承运商原厂费用客户直付。轨迹超量建议按次附加。

### 9.5 给客户的报价包

1. **实施**：第 9.3 节固定范围（或 5.5 人周上限 + 超出按周）。  
2. **订阅**：第 9.4 节按档。  
3. **前提**：第 7 节客户义务 + 第 10 节假设。  
4. 买断 / 独家另议，不默认含 13 人周标准研发。

---

## 10. 启动前必须书面确定（确认书）

| # | 事项 | 默认假设 |
|---|---|---|
| 1 | 首期范围 | 一个厂家 + 其经销商 |
| 2 | ERP | **Finale Inventory 云**；版本见客户填的 7.1 |
| 3 | 会计 | **QuickBooks Online**；谁开票在 S1 锁定 |
| 4 | 价盘 | 门户 **Price Lists** 维护；SKU 在 ERP |
| 5 | 物流 | 2–3 家承运商或一家聚合；**Ship / Tracking** 绑跟踪号 |
| 6 | 缺货 / 退货 / 多级审批 | 首期不做对应页面 |
| 7 | 托管 | Supabase + Cloudflare |
| 8 | 商务 | 实施按 9.3；订阅按 9.4；标准研发按 9.2 公司承担（除非买断） |

客户填写：**ERP 产品与 API 版本、QBO 环境、承运商/轨迹产品与 API 版本、授权完成日期**。

---

## 11. 风险

| 风险 | 缓解 |
|---|---|
| ERP 不是 Finale 或接口不够 | S0 锁版本；否则重估人周 |
| 授权拖延 | 第 7 节为开工门禁；超期暂停 |
| 面单扫出的不是跟踪号 | 要样张；**Enter Tracking** 作后备 |
| 轨迹查询费过高 | 订阅配额 + 超量计价 |
| 重复开票 / 重复 ERP 单 | 页面上禁止二次 Place Order；Sync Issues 只 Retry |
| 把适配做成新页面 | 以第 5.2 节白名单为准，溢出另报 |
| 提示词不完整导致返工 | 按第 5 节逐页写提示词；合入走查计在 1.5 人周内 |

---

## 12. 建议决策与下一步

1. 以第 5 节 **页面清单** 作为范围（不是接口或表结构说明书）。  
2. 先收齐第 7 节：ERP、QBO、物流的 **版本 + 授权 + 沙箱 + 样张**。  
3. 对内约 **13 人周** 做齐 MVP（约 CAD 39k / USD 29k）；对客户实施约 **5.5–6.5 人周**（约 CAD 16.5k–19.5k / USD 12k–14k）+ 月费。单价 CAD 3,000 / 人周。  
4. 第 10 节确认书签字后再锁 SOW。

本文件为提案，**不含代码实施**。
