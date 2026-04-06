# PRD / 工程对话溯源日志（用户提示词 × 助手说明）

> **用途**：作为**单一累积文档**：  
> 1）**全部有实质内容的用户提示词**（**含与 PRD 无关**的排错、重构、脚本、环境等）；  
> 2）助手在本轮中的说明，尤其 **实现代码前**（意图、假设、将动哪些文件）与 **实现代码后**（具体改动、验证方式、风险）。  
> 正式 PRD 仍以 `docs/PRD-Vouchap-Platform-And-Marketing-Site.md` 为准；本文件是「原声 + 当时怎么说清楚」的全量素材库。  
> **维护规则**：**`.cursor/rules/prd-source-log.mdc`**（`alwaysApply`）。助手须**写入文件**，不得只口头承诺。

---

## 书写格式（复制以下块追加到「记录」区）

```markdown
### YYYY-MM-DD（可选：短标题）

**User（提示词/原意）**  
- …尽量保留原话；过长可摘要并注明「节选」。

**Assistant（实现前说明，若有）**  
- …本轮计划、前置假设、预计修改路径或文件。

**Assistant（实现后说明 / 本轮结论）**  
- …实际改动摘要、如何验证、已知限制；若未改代码，则写问答/结论要点。

**关联（可选）**  
- 路径 / PR / Issue：…  
- PRD REQ（仅当涉及时）：REQ-…  

---
```

---

## 记录

### 2026-04-02（建立 PRD 溯源日志机制）

**User（提示词/原意）**  
- 定一个规则：后续我的提示词，和你的理解内容，都要存到一个文件中，用于以后整理 PRD。

**Assistant（实现前说明，若有）**  
- 新建 `docs/PRD-SOURCE-LOG.md` 模板与首条记录；新增 `alwaysApply` 规则；在 `.cursorrules` 增加指向。

**Assistant（实现后说明 / 本轮结论）**  
- 首版写入策略：以「产品/PRD 相关或明确要求记下」为主，纯无产品语义的排错可跳过；模板为 User + Assistant + 关联。  
- （注：随后在同日第二条需求中已扩大为**全量**提示词与实现前后说明，见下一条。）

**关联**  
- 规则文件：`.cursor/rules/prd-source-log.mdc`  
- 正式 PRD：`docs/PRD-Vouchap-Platform-And-Marketing-Site.md`  
- 原始导出归档：`docs/PRD-Appendix-B-User-Prompts-Full-Corpus.md`  

---

### 2026-04-02（扩大日志范围：非 PRD 提示词 + 实现前后说明）

**User（提示词/原意）**  
- 不涉及 PRD 的所有提示词，以及你在实现代码前后的回复说明，都要纳入这个文档。

**Assistant（实现前说明，若有）**  
- 将更新 `docs/PRD-SOURCE-LOG.md` 的标题与用途说明；重写 `.cursor/rules/prd-source-log.mdc`：取消「仅 PRD 相关才记」的豁免为主流逻辑；要求凡有实质对话即追加，且**改代码**时必须写清实现前/后；极短无信息回合可略。同步改 `.cursorrules` 对应 bullet。

**Assistant（实现后说明 / 本轮结论）**  
- 已落实：日志定位为「全量对话+实现溯源」；规则 `alwaysApply` 下默认每条实质任务结束都追加；模板拆分「实现前 / 实现后」。PRD 合并仍为可选后续工作，与本全量日志并行。

**关联**  
- `.cursor/rules/prd-source-log.mdc`、`docs/PRD-SOURCE-LOG.md`、`/Users/macbook/Vouchap/.cursorrules`  

---

### 2026-04-01（Client 侧按已发布 Service Catalog 发起 engagement）

**User（提示词/原意）**  
1. client 端 tax filing 模块增加 add，样式和交互复用 firm 侧 service catalog 的 add template。  
2. 增加 published 的 Service Catalog 展示页，展示各 firm 的 template_status 为 published 的模板；列表复用 firm 侧 service catalog 列表。

**Assistant（实现前说明，若有）**  
- DB：client 非 firm 成员无法 `INSERT firm.orders`；新增 `firm.list_published_skus_for_client_catalog`、`firm.client_create_onboarding_order_from_published_sku`（SECURITY DEFINER），并限制调用者须为 `spaces.kind=client` 的成员。  
- UI：抽出 `ServiceCatalogShared`（`firmSkuToProjectListItem` + 与 firm 一致的「虚线 Add」入口组件），firm `service-catalog` 改为引用；client 新路由 `tax-filing/service-catalog`；`tax-filing/index` 增加「Add from catalog」入口（Web 列表/网格首行、移动端 `ListHeaderComponent`）。

**Assistant（实现后说明 / 本轮结论）**  
- 迁移：`vouchap-app/supabase/migrations/20260401120000_client_published_catalog_rpc.sql`。  
- 逻辑：`firm.ts` 中 `getPublishedSkusForClientCatalog`、`clientCreateOnboardingOrderFromPublishedSku`（`supabase.schema('firm').rpc`）。  
- 类型：`FirmSku` 增加可选 `firmName`。  
- 选中模板后确认浮窗 → 建 onboarding 订单 → `router.replace` 至 `/firm/engagement/:id`。  
- **验证**：`supabase db push` 或等价应用迁移后，以 client 空间登录 → Tax Filing → Add from catalog → 选模板 → 应在列表出现新 onboarding；无迁移则 RPC 不存在会报错。

**关联**  
- `vouchap-app/src/mobile-ui/app/tax-filing/service-catalog.tsx`、`firm/service-catalog.tsx`、`components/ServiceCatalogShared.tsx`、`tax-filing/index.tsx`、`_layout.tsx`

---

### 2026-04-01（Published Services 仅含真正 Published 模板）

**User（提示词/原意）**  
- client 端 Published Services 不应出现角标为 Private 的 template，只应展示各 firm 已 published 的。

**Assistant（实现后说明 / 本轮结论）**  
- 根因：`is_sku_published_catalog` 曾允许 `is_published=true` 且 `template_status<>'draft'`，会把 **private** 等状态混入。  
- 修复：**仅当** `template_status = 'published'` **且** `is_published = true` 才视为目录可见；已更新 `20260401120000_*.sql` 并新增 `20260401123000_strict_published_catalog_template_status.sql` 便于已部署库 `migrate up`。

---

### 2026-04-01（Client Service Marketplace：搜索与筛选）

**User（提示词/原意）**  
- Client 端 Published Services 应体现为 **Service Marketplace**；增加 **筛选、搜索**，便于 client 主动找合适服务。

**Assistant（实现后说明 / 本轮结论）**  
- 导航标题与入口：`Service Marketplace`（Stack title、`ServiceCatalogAddEntryTile` 文案）；页面副标题与说明改为 marketplace 语境。  
- **搜索**：对 name、description、firmName、taxCountry、taxScenario、tags 合并字符串做不区分大小写子串匹配（全客户端过滤，数据仍来自现有 RPC）。  
- **筛选**：横向 chips — **Provider**（firm 名）、**Jurisdiction**（tax_country）、**Scenario**（tax_scenario），含 All；有 **Clear filters** 与「x of y services」计数。  
- 文件：`tax-filing/service-catalog.tsx`、`_layout.tsx`、`tax-filing/index.tsx`。

---

### 2026-04-01（Service Marketplace：对齐 Engagements 筛选交互、去掉 Provider 筛选）

**User（提示词/原意）**  
- 筛选搜索的交互复用 firm 端 engagements 模块设计；**不要 Provider 筛选**（发布者会很多）。

**Assistant（实现后说明 / 本轮结论）**  
- **工具条**：与 `firm/engagements` 一致的 **Filter（分类维度的浮层）+ Search**；Web 用 portal + `service-marketplace-filter-*` 的 DOM id 与外部点击关闭。  
- **分类**：`firm-classification-dimensions` 增加 SKU 维度的 `collectClassificationOptionsForSkuDim`、`skuMatchesClassificationDimFilters` 等（税季在目录行暂无字段时 season 为空）；**EngagementClassificationFilterChips** 抽到 `@/components/EngagementClassificationFilterChips`，engagements 改为引用。  
- **移除**：Provider 横向 chips；保留 firm 名在搜索 haystack 中可搜到。  
- 文件：`firm-classification-dimensions.ts`、`EngagementClassificationFilterChips.tsx`、`firm/engagements.tsx`、`tax-filing/service-catalog.tsx`。  
- **后续**：筛选浮层定位 — Web 改为 `filterAnchorRef` + `measureInWindow` 并监听 window scroll/resize；Native 将下拉移入 Filter 外层 `groupWrap`（`alignSelf: 'flex-start'`），避免相对整条 toolbar `left: 0` 贴左上角。  
- **UI**：去掉结果统计与「Service templates」/页内说明文案；网格与列表切换移至筛选搜索行最左侧。  
- **Marketplace**：不展示模板 Draft/Private/Published 角标与状态 pill；收藏复用 Tax Filing 置顶持久化模式（`service_marketplace_favorite_sku_ids`），列表排序 favorites 在前；卡片/列表行用星标 `pinAppearance="favorite"`。  
- **Tax Filing**：Client「Service Marketplace」入口由列表顶部改为 **紧跟在已有 engagements 之后**（移动端 Active section 末行；Web grid/list 亦为订单之后）；首屏加载中仍走原 ListEmpty 逻辑。  
- **Marketplace 下单**：两步 — `MarketplaceServiceSelectionModal`（确认选择、突出 firm / template、说明订单与邮件跟进）；通过后打开既有 `EngagementConsentModal` 勾选条款再 `clientCreateOnboardingOrderFromPublishedSku`。

---

### 2026-04-03（Tina 报税附件：优化 AI 识别提示词，减少 task 错位）

**User（提示词/原意）**  
- 提交给 Tina 的文件，AI 识别提示词需优化；明确的税务资料不能识别内容与类型，导致与 task 关联错位。

**Assistant（实现前说明）**  
- 预匹配：`tax-filing-task-matcher.ts` 提示词过简、缺少易混表单区分与场景聚焦；识别：`tax-filing-recognition-prompt.ts` 在提供 todoContext 时要求「优先按当前分类」，会在预匹配错误时强化误判。  
- 计划：扩展 matcher / recognition 的表单清单与识别协议；将 todoContext 标为「provisional」并明确 trust document + `suggested_task_id`；task list 区块强调按 doc_type 纠正；chat 上传时向 matcher 传入 `fileName` 作弱线索。

**Assistant（实现后说明 / 本轮结论）**  
- **Matcher**：增加 `fileName` 可选字段；重写 `buildTaskMatcherPrompt`（表头/编号读取步骤、T1/T2/1040/1120 场景聚焦、加拿大/美国常见表单与混淆项、标题含精确 form code 优先）。  
- **Recognition**：`BASE_SYSTEM_PROMPT` 改为 identification-first 与具体 `doc_type` 命名；扩展 T1/T2/1040/1120-S 场景块（T4A 家族、RL-1、T5008、多类 1099/1098、K-1 等）；todo + taskList 文案改为「自动化路由可能错误」并强制定位 `suggested_task_id` 纠错逻辑。  
- **chat-to-log**：`classifyTaxDocumentAndPickTask` 的 `projectContext` 增加 `fileName`。  
- **验证**：在真实项目中向 Tina 上传 T4 vs T4A、1099-INT vs 1099-DIV 等易混图；观察首跳 task 与识别完成后是否通过 `suggested_task_id` 纠正。**限制**：非图片附件仍走 fallback task，未调用 vision matcher（既有行为）。

**关联**  
- `vouchap-app/src/shared-logic/tax-filing-task-matcher.ts`、`tax-filing-recognition-prompt.ts`、`src/mobile-ui/app/chat-to-log.tsx`

---

### 2026-04-03（Tina：项目分类标签注入 AI 提示词 + task 列表）

**User（提示词/原意）**  
- 需要把所在 project 的分类标签内容提取出来，植入提示词，结合 task 名称列表，以便更明确当前识别文件的候选类型。

**Assistant（实现前说明）**  
- 列表 pills 对应 `projects.tax_country`、`tax_scenario`、`tax_season_year`、`tags`；`getProjectById` 已含这些字段；附件上下文 RPC `getProjectTodoAttachmentWithContext` 原先只取 tax_country/tax_scenario，需补 tags、tax_season_year。  
- 新增共享函数生成去重标签数组；`TaxDocumentTaskMatcherContext` 与 `TaxFilingProjectContext` 增加可选 `classificationLabels`；matcher / recognition 提示词增加「Engagement classification」并与 TASK LIST 联动说明。

**Assistant（实现后说明 / 本轮结论）**  
- 新文件 `tax-filing-project-classification-labels.ts`：`classificationLabelsForTaxFilingPrompt`。  
- `firm.getProjectTodoAttachmentWithContext` 的 project 增加 `tags`、`taxSeasonYear` 查询与返回。  
- `tax-filing-task-matcher`： prompts 内增加 engagement 区块。  
- `tax-filing-recognition-prompt`：Current context 与 task list 段落引用分类标签。  
- `chat-to-log`、`tax-filing-attachment-followup`、`TaxFilingTodosView` 识别调用处传入 `classificationLabels`。  
- **验证**：任一同步了 tags/税年的 project 走 Tina 上传，抓包或日志可见 prompt 中含标签 + task 标题；附件重试识别同样带标签。

**关联**  
- `vouchap-app/src/shared-logic/tax-filing-project-classification-labels.ts`、`firm.ts`、`tax-filing-task-matcher.ts`、`tax-filing-recognition-prompt.ts`、`chat-to-log.tsx`、`tax-filing-attachment-followup.ts`、`TaxFilingTodosView.tsx`

---

### 2026-04-03（项目 Classification：以 projects 为编辑源，初始来自 template/order）

**User（提示词/原意）**  
- project 的 classification 标签应可编辑；初始来自 order 关联的 firm 模板；后续双方可改；保存在 projects 表。

**Assistant（实现前说明）**  
- DB 已有 `projects_fill_tax_fields_from_order`、订单从 SKU 填税字段；但 firm 端 Info 之前改 classification 只写 `updateOrderClassificationByLabelNames`，展示又混用 order 与 project；需统一读写 `projects`，并与订单列表用的 text/tags 对齐。  
- 新增迁移：project UPDATE 时把 `tags` 同步到 `firm.orders.tags`（原有触发器只同步 tax_country/scenario/year）。

**Assistant（实现后说明 / 本轮结论）**  
- **迁移** `20260403120000_sync_project_tags_to_order.sql`：扩展 `sync_project_tax_fields_to_order`，在 `tags` 变更时同步到订单；触发列为 `tax_country, tax_scenario, tax_season_year, tags`。  
- **confirmOrderAndCreateProjectTodos**：insert project 不再手写 tax_country/scenario（由触发器从 order 复制）；保留名称/封面来自 SKU；订单无 `tax_season_year` 时用 due_at/created_at 年写入 project 兜底。  
- **getProjectByOrderId**：select/返回增加 `tags`。  
- **info.tsx**：加载与展示分类均以 **project** 为准；**client** 开放 Classification 铅笔与编辑（税季、jurisdiction、scenario、自定义标签）；**firm** 保存时先 `updateProject` 分类再 `updateOrderClassificationByLabelNames`（保留标签维度与列表）；自定义标签只读展示 `project.tags`。  
- **验证**：客户确认订单后检查 project 税字段与 order/SKU 一致；client/firm 编辑保存后 Tina/列表与 `projects` 一致；跑迁移后改 project tags 应回写 order.tags。

**关联**  
- `supabase/migrations/20260403120000_sync_project_tags_to_order.sql`、`firm.ts`、`src/mobile-ui/app/tax-filing/project/[projectId]/info.tsx`

---

### 2026-04-03（Firm SKU 模板 Info：自定义标签 + custom_label_ids）

**User（提示词/原意）**  
-（会话续接）firm 端 `skus` 表有 `custom_label_ids`，应在 template 的 Info 页支持维护自定义标签。

**Assistant（实现前说明）**  
- `getSkuById` / `fetchSkuHeaderFromTable` 需拉取 `firm_space_id`、`custom_label_ids`，展示名优先按 id 解析 `firm.order_labels`（与订单侧一致）；`updateFirmSku` 在写入 `tags` 时用 `ensureOrderLabelIdsByNames(..., 'custom')` 同步 `custom_label_ids`。  
- UI：在 `firm/sku/[skuId].tsx` 的 Classification 卡片增加与 project info firm 模式类似的 Custom labels 多选 + 内联新增，英文文案。

**Assistant（实现后说明 / 本轮结论）**  
- **`firm.ts`**：`FirmSkuHeader` 增加 `firmSpaceId`；`fetchSkuHeaderFromTable` select 含 `custom_label_ids` / `firm_space_id`，标签展示优先按 `custom_label_ids` 顺序解析名称，否则回退 `tags` 文本列；`updateFirmSku` 在 `payload.tags` 有值时解析 firm 空间、`ensureOrderLabelIdsByNames` 后同时更新 `tags` 与 `custom_label_ids`。  
- **`[skuId].tsx`**：加载 `getFirmOrderLabelsByDimension(..., 'custom')`；编辑态 pills + Add label 输入；保存时合并 `tagInput` 并入 `updateFirmSku` 的 `tags`。  
- **验证**：firm 成员打开某一 Service Template → Info → Edit info，增删自定义标签并 Save；DB `firm.skus.tags` 与 `custom_label_ids` 与 `order_labels` 一致；新建订单应从 SKU 复制到订单（既有流程）。

**关联**  
- `vouchap-app/src/shared-logic/firm.ts`、`vouchap-app/src/mobile-ui/app/firm/sku/[skuId].tsx`

---

### 2026-04-03（核实：skus/orders 文字列是否已弃用、仅 label_id）

**User（提示词/原意）**  
- 核实 `skus`、`orders` 上的文字字段（`tax_country`、`tax_scenario`、`tags`、`tax_season_year`）是否已弃用，是否全面只以 label_id 方式存储与读取。

**Assistant（实现前说明）**  
- 无代码变更；对照迁移注释、`firm.ts` 查询与映射、触发器与 RPC。

**Assistant（实现后说明 / 本轮结论）**  
- **不成立**：迁移 `20260323130000` 明确保留文字列为**去规范化兼容**；`firm.ts` 仍同时 select 文字列与 `*_label_id`/`custom_label_ids`，展示层优先 label 解析并回退文字/年份；`20260403120000` 仍将 `projects` 的税字段与 `tags` 同步到 `firm.orders` 文字列；权限逻辑侧重 label id，但**非**「仅存只读 id、弃用文字列」。若需单一数据源需另立迁移与全链路改造。

**关联**  
- `supabase/migrations/20260323130000_order_labels_library_and_label_ids.sql`、`20260403120000_sync_project_tags_to_order.sql`、`vouchap-app/src/shared-logic/firm.ts`

---

### 2026-04-03（问答：分类双轨的好处与弊端）

**User（提示词/原意）**  
- 现在的双轨有什么好处，有什么弊端？

**Assistant（实现前说明）**  
- 无代码变更；基于当前 `firm.skus`/`firm.orders` 同时存在文字列与 `*_label_id`/`custom_label_ids` 的架构作利弊归纳。

**Assistant（实现后说明 / 本轮结论）**  
- **好处**：兼容旧数据与简单查询；调试/列表直出字面量；税季可 label 与整数年份双兜底；权限用稳定 UUID；可渐进迁移。  
- **弊端**：两轨可能不一致；重复存储与对账成本；展示逻辑可能有的读 label、有的读文字；回归面大；自定义 `tags` 与 `custom_label_ids` 需严格同写。长期可收敛为「id 为唯一真值 + 展示由生成列或 join」。

**关联**  
- 同上条「核实 label_id」讨论

---

### 2026-04-03（Income 发票详情：选已有 Payer 保存误报关联方名称已存在）

**User（提示词/原意）**  
- income 模块发票详情修改，用已有 entity 替换识别错误的 entity，保存时报「关联名称已存在」，不符合设计。

**Assistant（实现前说明）**  
- Payer 选单已统一为 `entities`（`getCustomerOptions` → `getEntityOptions`），但 `handleSelectCustomer` 只写 `customerId`/`customer` 兼容字段；`saveInvoice` 仅用 `invoice.entityId` 写 `invoices.entity_id`，导致仍关联旧 AI 关联方，而 `customer_name` 已是所选名称，与 `getEntityOptionsForDuplicateCheck` 命中实体不一致，触发「关联方名称已存在」。

**Assistant（实现后说明 / 本轮结论）**  
- **`saveInvoice`**：若存在非空的 `customerId` 或 `customerSupplierId`（选单写入的实体 id），**优先**作为 `entityId` 再进入后续重名校验与 `updateEntity`。  
- **`invoice-details/[id].tsx`**：选 Payer 时同步 `entityId`/`entity`；清空选单时清空二者；选单高亮增加 `entityId`/`entity?.id` 与选项 id 一致（仅 DB 有 `entity_id` 而无兼容字段时也能显示已选）。  
- **验证**：错误识别关联实体 A，打开编辑 → Select Payer 选正确实体 B → Save，应成功且 `invoices.entity_id` 为 B。

**关联**  
- `vouchap-app/src/shared-logic/invoices.ts`、`vouchap-app/src/mobile-ui/app/invoice-details/[id].tsx`

---

### 2026-04-03（DB：receipt_items / invoice_items 列 purpose_id → attribution_id）

**User（提示词/原意）**  
- 后台仍为 `purpose_id`；应改为 `attribution_id`，并实际关联 `attributions` 的数据 id；`invoice_items` 同理。

**Assistant（实现前说明）**  
- 新增迁移：去掉旧 FK、列改名、`attribution_id` → `public.attributions(id) ON DELETE SET NULL`；同步 `vouchap-app` 中所有读写该列的 Supabase 字段名与嵌套 `attributions` 映射；更新运维脚本 `refresh_existing_spaces_categories_purposes.sql` 与根目录 `lib/` 中与 DB 列相关的旧名。

**Assistant（实现后说明 / 本轮结论）**  
- **迁移**：`vouchap-app/supabase/migrations/20260403180000_rename_line_item_purpose_id_to_attribution_id.sql`。  
- **应用**：`database.ts`、`invoices.ts`、`types`、`category-attribution-presets`、`postgrest-embed-errors`；`lib/database.ts`、`lib/invoices.ts` 列名与 embed 改为 `attribution_id` / `attributions`。  
- **验证**：对目标库执行 `supabase db push`（或等价应用迁移）后，小票/发票行项目的 Source 读写与列表应正常；若 PostgREST 仍报嵌套关系错误，需确认迁移已应用且外键生效。  
- **残留**：仓库根目录若干历史 SQL（如 `add-usage-count-to-categories-purposes.sql`、`create-new-project-schema*.sql`）仍写 `purpose_id`，仅在新环境手工执行时需自行对齐或忽略。

**关联**  
- `vouchap-app/supabase/migrations/20260403180000_rename_line_item_purpose_id_to_attribution_id.sql`、`vouchap-app/src/shared-logic/database.ts`、`vouchap-app/src/shared-logic/invoices.ts`

---

### 2026-04-05（Web 支出：按明细行表格页 + Items 入口）

**User（提示词/原意）**  
- client 版 expenses 模块 Web 端，表格上方操作行右端增加「items」入口，进入按 receipt_items 为行的新表格页；列：名称、金额、category / attribution 标签、小票 payee、小票交易时间。

**Assistant（实现前说明）**  
- 在 `receipts` Web 工具栏搜索框右侧增加「Items」跳转；新增路由 `/receipt-items`：`getAllReceiptLineItemsForList` 从 `receipt_items` 嵌套 `receipts!inner` + `entities` + `categories` + `attributions`（与现有小票一致，缺嵌套时回退 attribution 批量查询）；`DataTable` + `getReceiptLineItemColumns`；侧栏与 chat 行为与 expenses 对齐。

**Assistant（实现后说明 / 本轮结论）**  
- **类型**：`ReceiptLineItemListRow`（`types/index.ts`）。  
- **数据**：`getAllReceiptLineItemsForList`（`database.ts`），按交易日期降序再按名称。  
- **UI**：`receipt-items.tsx`（Web 表格 + 搜索 + 下拉刷新 + 行跳转 `receipt-details`）；`voucher-table-columns.tsx` 增加 `getReceiptLineItemColumns`；`receipts.tsx` Web 仅显示「Items」按钮；`_layout.tsx` 注册 `receipt-items`、`chatType`/`defaultChatOpen`/全局 FAB 排除；`WebSidebar` Expenses 高亮包含 `/receipt-items`。  
- **验证**：Web 打开 Expenses → 点 Items → 列与数据正确；点行进入对应小票详情；非 Web 进入该路由提示可用桌面 Web。  
- **残留**：行数多时未做分页，一次性拉全空间明细（与 `getAllReceipts` 量级策略不同，若数据极大需后续分页）。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipts.tsx`、`receipt-items.tsx`、`vouchap-app/src/shared-logic/database.ts`、`vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`

---

### 2026-04-05（Line items 表：Item 列最大 50ch + 省略）

**User（提示词/原意）**  
- items 名称列宽度设为 50 字符最大宽度，过长用缩略显示。

**Assistant（实现前说明）**  
- `DataTableColumn` 增加可选 `maxWidth`（number | string），作用于 th/td；Item 列 `maxWidth: '50ch'`、`numberOfLines={1}` + `ellipsizeMode="tail"`；Web 上为完整名称加 `title` 悬停提示。

**Assistant（实现后说明 / 本轮结论）**  
- **`DataTable.tsx`**：`maxWidth` 合并进表头与两种 tbody 单元格样式。  
- **`voucher-table-columns.tsx`**：`getReceiptLineItemColumns` 的 Item 列 `minWidth: 120`、`maxWidth: '50ch'`，单行省略；Web 传 `title` 显示全文。  
- **验证**：Web 打开 Line items，长名称列宽不超过约 50ch，尾部 `…`，悬停见全文。

---

### 2026-04-05（Line items：Is asset 列 + 多选/分组/筛选/批量改 category·attribution·is asset）

**User（提示词/原意）**  
- items 表在 attribution 后增加 Is asset 列；多选、全选、分组、筛选；选中后批量修改 category、attribution、Is asset。

**Assistant（实现前说明）**  
- `ReceiptLineItemListRow` 增加 `isAsset`、`categoryId`、`attributionId`；`getAllReceiptLineItemsForList` 映射 DB 字段；列配置增加 Is asset；`receipt-items` 启用 `DataTable` 多选与表头全选；工具栏 Group / Filter（月份、Category、Attribution、Is asset 子项多选/单选）；选中行显示批量栏，弹层选择 category / attribution（含 None）/ Yes·No，循环 `updateReceiptItem` 后刷新。

**Assistant（实现后说明 / 本轮结论）**  
- **类型与数据**：`types/index.ts`、`database.ts` 行映射 `is_asset`、`category_id`、`attribution_id`。  
- **列**：`voucher-table-columns.tsx` 在 Attribution 与 Payee 之间增加 **Is asset**（Yes/No）。  
- **页面**：`receipt-items.tsx` 分组（None / Transaction month / Category / Attribution / Payee / Is asset）、筛选（同上维度 + Is asset 三态）、搜索；`selectable` + `selectableRevealOnHover`；批量 Category / Attribution / Is asset；浮层样式用 RN `StyleSheet` 避免 `WEB_POPOVER.optionRow` 与 `ViewStyle` 不兼容。  
- **验证**：Web Line items 勾选、表头全选、分组与筛选联动；批量改三类字段后列表与详情一致。  
- **残留**：批量为顺序 `await` 大量行时可能较慢；`tsc` 对 `react-dom` 声明的提示与项目他处一致。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipt-items.tsx`、`vouchap-app/src/shared-logic/database.ts`、`vouchap-app/src/shared-logic/types/index.ts`、`vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`

---

### 2026-04-05（改 receipt item attribution 失败：usage 触发器仍引用 purpose_id）

**User（提示词/原意）**  
- 已执行 `purpose_id`→`attribution_id` 迁移后仍失败；不要再用回退 `purpose` 的兼容写法，后续要删 `purposes` 表。

**Assistant（实现前说明）**  
- 核实：历史脚本 `add-usage-count-to-categories-purposes.sql` 在 `receipt_items` 上的触发器函数 `update_usage_counts_on_item_change()` 仍读写 `OLD/NEW.purpose_id` 并更新 `purposes.usage_count`。列改名后 `purpose_id` 不存在，任意 UPDATE 行项目在触发器内即报错，客户端表现为 Failed to update item。  
- 撤销此前客户端对 `purpose_id` 的回退逻辑，仅保留 DB 侧修复。

**Assistant（实现后说明 / 本轮结论）**  
- **迁移** `20260405120000_receipt_items_usage_trigger_use_attribution_id.sql`：`CREATE OR REPLACE` 该函数，改为 `attribution_id` + 维护 `public.attributions.usage_count`（与行项目 FK 一致）。  
- **代码**：移除 `isAttributionIdColumnUnknownError` 及 insert/update 的 `purpose_id` 回退；`receiptItemAttributionRefId` 仅读 `attribution_id`。  
- **验证**：对已跑过列改名迁移的环境再 `db push` 本迁移后，详情页/Line items 修改 attribution 应成功；若从未安装旧 usage 脚本，函数被替换无副作用。

**关联**  
- `vouchap-app/supabase/migrations/20260405120000_receipt_items_usage_trigger_use_attribution_id.sql`、`add-usage-count-to-categories-purposes.sql`（历史手工脚本，新环境以迁移为准）

---

### 2026-04-05（Line items 表内编辑 Category / Attribution / Is asset）

**User（提示词/原意）**  
- 表格内直接改 category、attribution、Is asset；Is asset：true 为点亮勾选，false 为空白格样式。

**Assistant（实现前说明）**  
- `DataTableColumn` 增加 `stopRowPress`，在 `td` 上 `stopPropagation`，避免点编辑格触发 `onRowPress` 进详情。  
- `getReceiptLineItemColumns`：Web 上 Category/Attribution 用 **`LineItemNativeSelect`（原生 `<select>`）** 内联下拉；`onCategoryChange` / `onAttributionChange` 写库并乐观更新；Is asset 为 `checkbox`（真）/`square-outline`（假）可点击切换。  
- `receipt-items` 传入上述回调；批量编辑仍可用居中浮层。

**Assistant（实现后说明 / 本轮结论）**  
- **`DataTable.tsx`**：`stopRowPress` → `td.onClick` 阻止冒泡。  
- **`voucher-table-columns.tsx`**：`LineItemNativeSelect` + Is asset 勾选样式。  
- **`receipt-items.tsx`**：`onCategoryChange` / `onAttributionChange` / `onIsAssetCellPress` + `updateReceiptItem`；**表内不设 Category/Attribution 居中弹窗**。  
- **验证**：Web Line items 在单元格内下拉改 Category/Attribution；点勾选切换 Is asset 且不跳转详情。

---

### 2026-04-05（移除 Line items 表内 cellEdit Portal 死代码）

**User（提示词/原意）**  
- 表格内直接修改不宜浮出浮窗，应直接下拉选择；续作需删除仍引用 `cellEdit` 的 Portal 残留。

**Assistant（实现前说明）**  
- `receipt-items.tsx` 底部仍保留 `createPortal` + `cellEdit` / `cellEditWorking` / `applyCellCategory` / `applyCellAttribution` 块，但相关 state 与函数已移除，会导致 TS 报错或运行异常；整段删除。

**Assistant（实现后说明 / 本轮结论）**  
- 已删除该 Portal；表内编辑仅依赖 `voucher-table-columns` 的 `LineItemNativeSelect`。`read_lints`：`receipt-items.tsx` 无新问题。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipt-items.tsx`

---

### 2026-04-05（Line items：标签底色 + Attribution 下拉锚定在单元格下方）

**User（提示词/原意）**  
- 下拉样式可保留，但表格内闭合态须为带底色标签样式；Attribution 的下拉列表需在修改位置（锚点）**下方**展开。

**Assistant（实现前说明）**  
- Category 仍用原生 `<select>`，增加 `appearance: 'pill'`：按选中项 `color` 作为闭合态药丸背景、白字、自定义 chevron；选项类型扩展 `color?`。  
- Attribution 不用原生 select（弹出方向不可控且易被 `td { overflow: hidden }` 裁切），改为 `LineItemAttributionAnchorDropdownWeb`：`nativeID` 锚点 + `getBoundingClientRect` + `createPortal` 固定定位在 `bottom + 4px`；滚动/点击外侧关闭。

**Assistant（实现后说明 / 本轮结论）**  
- **`voucher-table-columns.tsx`**：`LineItemNativeSelect` 支持 `pill`；新增 `LineItemAttributionAnchorDropdownWeb`；列配置传入带 `color` 的 options。  
- **验证**：Web Line items 中 Category 闭合为彩色标签；点 Attribution 标签在**其下方**出列表并完成修改。`read_lints`：`react-dom` 类型提示与项目他处一致。

**关联**  
- `vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`

---

### 2026-04-05（Line items Category 药丸高度与宽度）

**User（提示词/原意）**  
- Category 标签高度过高，应与其它标签一致；宽度过宽，应随文案自适应。

**Assistant（实现前说明）**  
- 闭合态与 `LineTagPill` / Attribution 药丸对齐：`padding` 3px×8px 量级、`fontSize` 11、`lineHeight` 13px，去掉额外 `minHeight`。  
- 去掉外层 `minWidth` + select `width:100%` 造成的拉满列宽；pill 使用 `width: max-content`、`maxWidth: 200`，并加 `fieldSizing: 'content'`（Chromium 下按当前选中项收窄，减轻「按最长 option 撑开」）。

**Assistant（实现后说明 / 本轮结论）**  
- **`voucher-table-columns.tsx`**：`LineItemNativeSelect` 的 `pill` 分支与 Category 列外层 `View` 已按上调整。  
- **验证**：Web Line items 中 Category 与 Attribution 药丸视觉高度接近；标签宽度随名称变化、最长约 200px。不支持 `field-sizing` 的浏览器仍可能略受最长 option 影响，必要时可再改为与 Attribution 同型的自定义锚定列表。

**关联**  
- `vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`

---

### 2026-04-05（Line items Attribution 药丸高度）

**User（提示词/原意）**  
- Attribution 标签高度偏高，可能因下拉 icon 过大。

**Assistant（实现后说明 / 本轮结论）**  
- **`voucher-table-columns.tsx`**：`LineItemAttributionAnchorDropdownWeb` 中药丸将 `chevron-down` 由 12 改为 **10**，文案增加 **`lineHeight: 13`**（与 Category pill 一致），`gap` 4→**2**。

**关联**  
- `vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`

---

### 2026-04-05（Line items Attribution 选项去掉 None）

**User（提示词/原意）**  
- Attribution 的选项不需要 None。

**Assistant（实现后说明 / 本轮结论）**  
- **`voucher-table-columns.tsx`**：表内 Attribution 选项列表不再含空项；未知 id 仍 `unshift`；无选中时药丸文案 **—**、灰色。下拉回调仅传 **string**。  
- **`receipt-items.tsx`**：批量「Set attribution」浮层去掉 **None** 行。筛选/分组里表示「未归属」的文案未改（非选项列表）。

**关联**  
- `vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`、`vouchap-app/src/mobile-ui/app/receipt-items.tsx`

---

### 2026-04-05（Web 支出详情行项目 Category/Attribution 与表格同款选单）

**User（提示词/原意）**  
- Web 端详情页内 Category、Attribution 选单采用与 Line items 表格相同的组件。

**Assistant（实现前说明）**  
- 导出 **`LineItemNativeSelect`**、**`LineItemAttributionAnchorDropdownWeb`**，并抽出 **`buildLineItemCategoryOptions`** / **`lineItemCategorySelectValue`** / **`buildLineItemAttributionOptions`** 供表与详情共用。  
- **`receipt-details/[id].tsx`**：Web 且列表非空时用上述组件；原生端仍用底部 Modal（Modal `visible` 在 Web 关闭）。新建行无 `item.id` 时走 **`handleItemChange`**；已持久化行走 **`handleItemChangeDirect`**。**`handleItemChange`** 补 **`attributionId`** 分支；**`handleItemChangeDirect`** 在 **`editing`** 时同步 **`setEditedReceipt`**，避免编辑态 UI 与库不一致。

**Assistant（实现后说明 / 本轮结论）**  
- 已实现并联调路径与表格一致（含 Attribution 下拉锚定下方、无 None 项）。  
- **验证**：Web 打开支出详情，行项目 Category/Attribution 与 Line items 表交互一致；移动端仍为 Bottom sheet。

**关联**  
- `vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`、`vouchap-app/src/mobile-ui/app/receipt-details/[id].tsx`

---

### 2026-04-05（Attribution 锚定下拉位置：避免视口左上角）

**User（提示词/原意）**  
- Attribution 选单出现在页面左上角，需检查优化。

**Assistant（实现后说明 / 本轮结论）**  
- **`LineItemAttributionAnchorDropdownWeb`**：`nativeID` + `getElementById` 在 ScrollView/详情页等场景下常测到 **0×0 或未命中节点**，`fixed` 菜单即贴在 (0,0)。改为 **`ref` + `measureInWindow`**（优先），其次 **`ref`/`id` 的 `getBoundingClientRect`**；`rowId` 做 **`lineItemAttributionAnchorId` 安全化**；Web 补充 **`id` 属性**、`collapsable={false}`；打开后 **rAF 双帧 + 50ms** 再测一次以等布局稳定；DOM 全零矩形则跳过，避免误用左上角。

**关联**  
- `vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`

---

### 2026-04-05（Category / Attribution：管理页与选单按 usage_count 排序 · 续）

**User（提示词/原意）**  
- Category、Attribution 在**管理页**与各类**选单**中，选项顺序按 space 内 **`usage_count`**（`usageCount`）排序（与既有 `sortScopeTagsForDisplay` / `getCategories` / `getAttributions` 规则一致：Other 最后等）。

**Assistant（实现前说明）**  
- 共享层已映射并排序；需补齐：**表格/详情共用的 `buildLineItem*`**、**行项目筛选与批量选单**、**设置内嵌 ScopeSettingsManager**、**收支详情底部 Modal 列表**、**独立 manage 页在乐观更新后重排**；`categories-manage` 改用 `@/lib` 别名与其它屏一致。

**Assistant（实现后说明 / 本轮结论）**  
- **`voucher-table-columns.tsx`**：`buildLineItemCategoryOptions` / `buildLineItemAttributionOptions` 对入参先 `sortScopeTagsForDisplay`，未知 id 仍 `unshift`。  
- **`receipt-items.tsx`**：筛选 Category/Attribution 选项按 `usageCount` 等排序（结合已加载的 categories/attributions）；批量设置浮层使用排序后列表。  
- **`ScopeSettingsManager.tsx`**：列表用 `useMemo` 排序视图；新增/改名后 `setState` 内再排序。  
- **`categories-manage.tsx`** / **`attributions-manage.tsx`**：新增/更新后 `sortScopeTagsForDisplay`；分类管理 imports 改为 `@/lib`、`@/types`。  
- **`receipt-details/[id].tsx`**、**`invoice-details/[id].tsx`**：原生 Modal 选单使用 `categoriesSorted` / `attributionsSorted`。  
- **验证**：打开分类/用途管理、支出或收入详情行项目选单、Line items 表内下拉及行项目列表筛选，顺序应与 DB `usage_count` + Other 置底规则一致；新建项乐观更新后列表不应长期卡在末尾。  
- **说明**：全量 `tsc` 工程内仍有既有报错，未以本次变更为由一并清理。

**关联**  
- `vouchap-app/src/shared-logic/sort-scope-tags-for-display.ts`、`vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`、`vouchap-app/src/mobile-ui/app/receipt-items.tsx`、`vouchap-app/src/mobile-ui/components/ScopeSettingsManager.tsx`、`vouchap-app/src/mobile-ui/app/categories-manage.tsx`、`vouchap-app/src/mobile-ui/app/attributions-manage.tsx`、`vouchap-app/src/mobile-ui/app/receipt-details/[id].tsx`、`vouchap-app/src/mobile-ui/app/invoice-details/[id].tsx`

---

### 2026-04-05（Line items：工具栏高度与 Category 药丸聚焦蓝框）

**User（提示词/原意）**  
- Line items 表格页内**操作行**略减高，与**选中后**操作行高度一致，避免选中后页面抖动。  
- **Category** 标签点选后有**蓝色外框**，需消除。

**Assistant（实现前说明）**  
- 抖动来源：`receipt-items` 顶栏在未选（Group/Filter/Search）与已选（批量条）间垂直 padding 不一致；`DataTable` 表头全选在 `selectableRevealOnHover` 下由**条件卸载**改为与表体一致**始终挂载**更稳。  
- 蓝框：Web 原生 `<select>` 聚焦默认 `outline`。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-items.tsx`**（首版）：曾整体压低顶栏高度。  
- **更正（与 Expenses 表一致）**：`toolbarSlot` / `header` / `bulkBar` 与 **`receipts.tsx`** 对齐——固定 **高度 52**、`bulkBar` 使用 **gap 12**、**paddingVertical 10**、**bulkBtn / bulkBtnClear 8×12**、`bulkText` **marginRight 8**；未选态 `header` 与 **Group/Filter/Search** 的 padding、**gap 12**、按钮 **8×12**、搜索框 **paddingVertical 8** 与 receipts 一致；批量图标 **17→18**。  
- **`DataTable.tsx`**：表头全选 `input` 始终渲染，`opacity` + `pointerEvents` 与「有无选中」及 reveal 模式对齐（不再在未选时卸载节点）。  
- **`voucher-table-columns.tsx`**：`LineItemNativeSelect` 样式增加 **`outline: 'none'`**、**`outlineWidth: 0`**。  
- **验证**：Web Line items 勾选一行前后顶栏与表头区域无明显高度跳动；点选 Category 药丸后无浏览器默认蓝色聚焦框。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipt-items.tsx`、`vouchap-app/src/mobile-ui/components/DataTable.tsx`、`vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`

---

### 2026-04-05（Line items Category / Attribution 选单：统一样式与向下展开）

**User（提示词/原意）**  
- Category 与 Attribution **选单样式**（半透明、展开位置）不一致。  
- 应统一：**Category 的半透明 + 鼠标悬停反色**；**Attribution 的展开位置**（始终在下方下拉，而非随当前项上下翻转）。

**Assistant（实现前说明）**  
- Category 原为 Web **原生 `<select>`**，列表由系统绘制；Attribution 为 **Portal + 锚点下方固定坐标**。  
- 抽取共用 **`LineItemPillAnchorDropdownWeb`**：药丸触发一致；菜单 `rgba` + `backdrop-filter` 半透明；选项 `hover` 深底白字；位置沿用 `measure` + `top + height + 4`。

**Assistant（实现后说明 / 本轮结论）**  
- **`voucher-table-columns.tsx`**：新增 **`LineItemPillAnchorDropdownWeb`**（`kind: 'category' | 'attribution'`，`anchorId` 前缀区分）；**`LineItemAttributionAnchorDropdownWeb`** 改为薄封装。Line items 表内 **Category** 列改用该组件（不再用原生 pill select）。**`LineItemNativeSelect`** 仍保留供非 pill 场景。  
- **`receipt-details/[id].tsx`**：Web 行项目 **Category** 改为 **`LineItemPillAnchorDropdownWeb`**；与 Attribution 共用同一 `lineStableId` 作为 rowId（DOM id 仍因 `kind` 不同而不冲突）。  
- **验证**：Web Line items 与支出详情行项目：两列药丸一致；展开均在药丸**下方**；菜单毛玻璃半透明；悬停选项反色；选中为浅紫底。  
- **后续**：悬停由深灰反色改为 **#6C5CE7** 浅高光（见下条）。

**关联**  
- `vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`、`vouchap-app/src/mobile-ui/app/receipt-details/[id].tsx`

---

### 2026-04-05（Line items 药丸选单：悬停改亮紫蓝）

**User（提示词/原意）**  
- 反色悬停过深，改用亮蓝色（品牌 **#6C5CE7**）。

**Assistant（实现后说明 / 本轮结论）**  
- **`LineItemPillAnchorDropdownWeb`**：悬停底 **`rgba(108, 92, 231, 0.28)`**；文案 **#2D3436**，勾选 **#6C5CE7**；色点悬停描边为淡紫。

**关联**  
- `vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`

---

### 2026-04-05（Line items 批量：锚定下拉 + Is asset 双态 + 二次确认）

**User（提示词/原意）**  
- 批量 Category/Attribution 用**操作行按钮向下**拉出选单，不用固定居中浮窗。**Is asset** 不要选单，整批标资产 / 再点整批取消。**批量**均需**二次确认**，复用统一浮窗。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-items.tsx`**：Portal 锚定菜单 + **`confirmThen`**；**Is asset** 按**当前选中行**推导：并非全部为 asset 时第一次为**全部标 asset**；**已全部为 asset** 时第一次即为**全部取消**（**`bulkSelectedAllAsset`**，按钮文案 **Not asset**）。已弃用按次翻转的 `bulkAssetNextTrue`。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipt-items.tsx`、`vouchap-app/src/shared-logic/alertWeb.ts`

---

### 2026-04-05（Line items 批量操作三按钮：弱化视觉重量）

**User（提示词/原意）**  
- 三个批量修改操作按钮（Category / Attribution / Is asset）**样式过深**，需**弱化**，减轻深色实心主按钮感。

**Assistant（实现前说明）**  
- 原为 **`bulkBtn`** 实心 **`#6C5CE7`** + 白字/白图标；**`bulkBar`** 为 **`#E8E0F7`**。拟改为**浅色底 + 淡紫描边 + 紫字/紫图标**的 secondary 风格；**`bulkBtnAltHint`**（**Not asset** 双态）改为略强调描边与极浅紫底，替代原白描边。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-items.tsx`**：**`bulkBar`** → **`#F2EDFA`**；**`bulkBtn`** → 近白底、**`borderColor: rgba(108,92,231,0.32)`**；**`bulkBtnText`** → **`#5B4DC7`**；三处 **Ionicons** 改为 **`#6C5CE7`**；**`bulkBtnAltHint`** → 稍粗描边 + 浅紫底。  
- **验证**：进入批量选中，三按钮为轻量 outline，与条带对比度仍可读；**Not asset** 态（全选均为 asset 时）有轻微强调。  
- **残留**：若与 receipts 批量条需严格像素对齐，可再对表单项单列比对。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipt-items.tsx`

---

### 2026-04-05（Line items 批量 Is asset：双态按钮文案 Not asset）

**User（提示词/原意）**  
- 将 **Is asset (clear)** 改为 **Not asset**。

**Assistant（实现前说明）**  
- 无逻辑变更；仅批量条按钮在 **`bulkSelectedAllAsset`** 时的展示文案。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-items.tsx`**：**`bulkSelectedAllAsset`** 时按钮显示 **Not asset**，否则 **Is asset**；确认弹窗仍为 **Mark as non-asset** / **Mark … as non-asset?**（与操作一致）。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipt-items.tsx`

---

### 2026-04-05（Line items：Web chat 右栏默认关闭）

**User（提示词/原意）**  
- **Line Items** 页 chat **右栏默认不打开**；**其他页面**保持现有默认策略。

**Assistant（实现前说明）**  
- **`defaultChatOpen`** 此前对 **`/receipt-items`** 与 **`/receipts`** 同为 **true**。拟移除 line items 的默认打开，使其落入末支 **false**。  
- 原先 **`WebChatFab`** 在 **`/receipt-items`** 与 **`/receipts`** 一样被排除；line items 若默认关栏且无 FAB 则难以再打开，故**仅从 FAB 排除条件中去掉 `receipt-items`**，**保留 `receipts` 等**。

**Assistant（实现后说明 / 本轮结论）**  
- **`_layout.tsx`**：**`defaultChatOpen`** 不再对 **`/receipt-items`** 返回 **true**；**`WebChatFab`** 在 line items 且右栏关闭时**可显示**（类型仍为 **`chatTypeFromPathname` → receipt**）。  
- **验证**：Web 打开 Line items → 右栏关闭、主区更宽；点 FAB 可打开右栏；从 Line items 切到 Expenses 列表 → 仍默认打开右栏（未改）。

**关联**  
- `vouchap-app/src/mobile-ui/app/_layout.tsx`

---
