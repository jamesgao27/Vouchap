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

### 2026-04-05（Category / Attribution 选单：内部滚动不再误关）

**User（提示词/原意）**  
- Category、Attribution **选单选项多、出现滚动条时，一滚动选单就消失**，需修复。

**Assistant（实现前说明）**  
- **`LineItemPillAnchorDropdownWeb`**（及 Line items **批量** Portal 选单）在打开时对 **`window` `scroll` capture** 监听并**一律关菜单**；浏览器在**选单自身 `overflowY: auto`** 上滚动时同样向 window 冒泡/捕获，导致误关。

**Assistant（实现后说明 / 本轮结论）**  
- **`voucher-table-columns.tsx`**：**`onScroll`** 若 **`event.target`** 位于 **`#menuDomId`** 内则 **return**，否则 **`setOpen(false)`**；**`useLayoutEffect`** 依赖补 **`menuDomId`**。  
- **`receipt-items.tsx`**：批量选单 **`onScroll`** 同理忽略 **`#receipt-items-bulk-menu`** 内滚动；**`resize`** 仍为无条件收起（与原行为一致）。  
- **验证**：Web 表内与批量：选单拉高至出滚动条，滚轮/拖拽滚动列表，选单保持；滚外层表格/页面仍应关闭选单。

**关联**  
- `vouchap-app/src/mobile-ui/components/voucher-table-columns.tsx`、`vouchap-app/src/mobile-ui/app/receipt-items.tsx`

---

### 2026-04-05（Web 顶栏返回：箭头间歇消失）

**User（提示词/原意）**  
- Web **顶行返回箭头经常消失**；有时**占位仍可点**仅**无箭头**；有时**占位也没了**。

**Assistant（实现前说明）**  
- Web **Stack** 使用 JS **`NativeStackView`**，默认 **`HeaderBackButton`** 为 **PNG + RN `Image` `tintColor`**；**RN Web** 上易出现**位图画不出来**但**仍有点击区**。整条按钮缺失另可能与 **`canGoBack`/栈** 或页级 **`headerLeft`** 有关；本次消除 PNG/tint 主因。

**Assistant（实现后说明 / 本轮结论）**  
- 新增 **`vouchap-app/src/mobile-ui/lib/web-stack-header-left.tsx`**：**仅 web** 合并 **`getWebStackHeaderLeftScreenOptions()`**：**`HeaderBackButton`** + **`backImage`** 用 **Unicode U+2039** 与 **系统 UI 字体**，不依赖位图着色。  
- **`app/_layout.tsx`**、**`tax-filing/project/[projectId]/_layout.tsx`**、**`tax-filing/order/[orderId]/_layout.tsx`** 的 **`screenOptions`** 已合并；**非 web** 返回 **`{}`**，原生不变。

**关联**  
- `vouchap-app/src/mobile-ui/lib/web-stack-header-left.tsx`、`vouchap-app/src/mobile-ui/app/_layout.tsx`、`vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/_layout.tsx`、`vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/_layout.tsx`

---

### 2026-04-05（小票：标准税率表 + 行税、辖区、对账与异步重算）

**User（提示词/原意）**  
- 设计并实现 **标准税率表 / 行项目税表** 及后端：**识别时**优先用 `tax_rate_catalog`，缺失则用内置标准税率 **写入 space 缓存** 再算行税；**行税合计 vs 票面 tax**：接近则通过，差距大则 **异步** 换辖区重算；仍对不齐则 **差额可接受**（票面 `receipts.tax` 为准，行税以计算为准）。  
- 接续此前已存在的迁移草稿与 `receipt-item-tax.ts`，补全接入与 prompt。

**Assistant（实现前说明）**  
- 修复 `scheduleReceiptTaxRecalcIfNeeded` 中非法条件；在 **`saveReceipt` / `updateReceipt`** 写入 **`tax_jurisdiction_*`**（来自识别或推断），保存行项后 **`applyReceiptItemTaxesAndReconcile`**，大差额时 **`scheduleReceiptTaxRecalcIfNeeded`**。  
- 扩展 **`Receipt` / `GeminiReceiptResult`**、**`convertGeminiResultToReceipt`**、**`buildReceiptExtractionRules`** 与文本/语音小票 prompt 输出 **`taxJurisdictionCountry` / `taxJurisdictionRegion`**。  
- **`getReceipt*`** 映射 **`tax_reconciliation_status`、`tax_items_sum`、`tax_variance_amount`**。  
- 依赖迁移：`supabase/migrations/20260405220000_tax_rate_catalog_and_receipt_item_taxes.sql`（若尚未在生产执行需 deploy）。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-item-tax.ts`**：`pending_recalc` 循环后若仍为 pending 则降为 **`variance`**；重算成功则 **`matched` / `within_tolerance` / `skipped`** 时退出循环。  
- **`database.ts`**：`insert`/`update` 税辖区列；保存/更新影响行税或税总额时触发 **apply + schedule**；列表/详情 **Receipt** 带回对账字段。  
- **`types/index.ts`**、**`receipt-helpers.ts`**、**`gemini.ts`**：辖区与类型、prompt 一致。  
- **验证**：应用迁移后保存含明细的 CAD 小票 → `receipt_item_taxes` 有行、**`tax_reconciliation_status`** 非空；人为大差额 CA 场景可观察 **`pending_recalc`** → 异步尝试其他省或最终 **`variance`**。全量 `tsc` 工程内仍有既有报错，与本次改动文件无新增可指出的阻塞项。

**关联**  
- `vouchap-app/supabase/migrations/20260405220000_tax_rate_catalog_and_receipt_item_taxes.sql`、`vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/src/shared-logic/database.ts`、`vouchap-app/src/shared-logic/types/index.ts`、`vouchap-app/src/shared-logic/receipt-helpers.ts`、`vouchap-app/src/shared-logic/gemini.ts`

---

### 2026-04-06（标准税率迁入 crm schema；space 对标准表只读）

**User（提示词/原意）**  
- 数据库已有 **`crm`** schema；**标准税率表**放到该 schema；**模型/运营侧**可对标准表写入；**用户 space**（客户端 authenticated）对标准税率为 **只读**。

**Assistant（实现前说明）**  
- 新增 **`crm.tax_rate_standard`**（无 `space_id`），**RLS**：`authenticated` 仅 **SELECT**；写操作交给 **service_role**（或后续 CRM 后台），与「用户不可改标准表」一致。  
- **`public.tax_rate_catalog`**：去掉 **`space_id IS NULL`** 平台行，**`space_id` NOT NULL** 专作 space 缓存；原平台种子迁入 crm 并 **DELETE** 旧行；**`receipt_item_taxes`** 增加 **`crm_tax_rate_standard_id`**，与 **`tax_rate_catalog_id`**（仅缓存行）二选一引用。  
- 应用层 **`receipt-item-tax.ts`**：合并查询 **`crm.tax_rate_standard`** 与 **`public.tax_rate_catalog`**；**`supabase/config.toml`** 增加 **`api.schemas` 含 `crm`**；托管项目需在 **Dashboard → API → Exposed schemas** 勾选 **`crm`**。

**Assistant（实现后说明 / 本轮结论）**  
- 迁移 **`20260406120000_crm_tax_rate_standard.sql`**：建表、seed、从 public 迁遗留平台行、`receipt_item_taxes` 新列、删 public 平台行、**`tax_rate_catalog.space_id` NOT NULL**、收紧 **`tax_rate_catalog` SELECT** 策略仅本 space。  
- **`receipt-item-tax.ts`**：`schema('crm').from('tax_rate_standard')` + 原 **`tax_rate_catalog`**；写入行税时按来源填 **`crm_tax_rate_standard_id` 或 `tax_rate_catalog_id`**。  
- **`crm.tax_rate_standard.source`** 允许 **`model`**，便于 pipeline 用 service role 落库。  
- **验证**：跑迁移 → 客户端仍可取 CRM 标准税率并算行税；authenticated 对 **`crm.tax_rate_standard`** 无 INSERT；Supabase 未暴露 **`crm`** 时 `.schema('crm')` 会失败，需同步 config + Dashboard。

**关联**  
- `vouchap-app/supabase/migrations/20260406120000_crm_tax_rate_standard.sql`、`vouchap-app/supabase/config.toml`、`vouchap-app/src/shared-logic/receipt-item-tax.ts`

---

### 2026-04-06（crm 标准税表：美国各州 + 加拿大各省种子）

**User（提示词/原意）**  
- 检索**美国、加拿大**各税种/税率，**写入标准税表**（`crm.tax_rate_standard`）。

**Assistant（实现前说明）**  
- 加拿大：按省补全 **HST 单轨**（ON/NB/NL/PE/NS）、**GST+PST/SK**、**GST+RST/MB**、**GST+QST/QC**、**GST-only**（AB/NT/NU/YT）及 **CA 空 region 的 GST 兜底**；NS **HST 14%** 自 **2025-04-01** 起（与公开税改表述一致）。  
- 美国：每州一行 **`COMBINED_SALES_TAX`** = Tax Foundation **2025-01-01** 表 **州税 + 人口加权平均地方税**（仅作小票估算参考，不含免税品/基地差异）；另加 **`US` + 空 region** 全美国约 **6.65%** 粗 fallback。  
- 新建幂等迁移 **`20260406180000_seed_crm_tax_rate_standard_us_ca.sql`**（`NOT EXISTS` 自然键 + `effective_from`）。

**Assistant（实现后说明 / 本轮结论）**  
- 已写入迁移；表 **`COMMENT`** 标明来源与「非申报级精度」限制。  
- **修复**：NE 州行 `effective_from` 笔误 **`2022025-01-01`** → **`2025-01-01`**。  
- **验证**：`supabase db push` / SQL Editor 执行迁移后 `SELECT country_code, region_code, tax_kind_code, rate FROM crm.tax_rate_standard WHERE country_code IN ('US','CA') ORDER BY 1,2,4;`；业务上仍需法务/税务复核再用于申报。

**关联**  
- `vouchap-app/supabase/migrations/20260406180000_seed_crm_tax_rate_standard_us_ca.sql`

---

### 2026-04-06（小票行税无数据：美国 effective_from + CRM 回退）

**User（提示词/原意）**  
- Dev 拍摄小票后 **`receipt_item_taxes` 没有数据**。

**Assistant（实现前说明）**  
- 根因：**美国**标准税率种子使用 **`effective_from = 2025-01-01`**，查询使用 **`effective_from <= receipt_date`**，小票日期早于 2025 时 **CRM 无匹配行**；**`builtinStandardRates` 仅含加拿大**，美国不会写入 **`tax_rate_catalog` 缓存**，最终 **pickRates 为空**。次要风险：**Supabase 未暴露 `crm` schema** 时查询失败且无回退。  
- 计划：**迁移** 将美国 **`COMBINED`** 行的 **`effective_from` 统一改为 `2000-01-01`**；补 **NS HST 15%**（至 2025-03-31）；同步修正 **`20260406180000`** 中美国与 NS 种子；**应用侧** CRM 结果按 **`effective_from` / `effective_to` 在内存收窄**；**`builtinStandardRates` 增加美国**（`us-combined-sales-tax-builtin.ts`）；**insert 失败日志** 打出 code/details。

**Assistant（实现后说明 / 本轮结论）**  
- 新增 **`20260406200000_tax_standard_us_effective_from_and_ns_hst.sql`**；**`us-combined-sales-tax-builtin.ts`**；**`receipt-item-tax.ts`** 如上。  
- **验证**：执行新迁移后，**USD + 小票日期 2024** 仍应命中 CRM；控制台若见 **`crm.tax_rate_standard failed`** 须在 **Project Settings → API → Exposed schemas** 勾选 **`crm`**。已存小票可再编辑保存触发 **`updateReceipt`** 或依赖后续产品「重算税」入口。

**关联**  
- `vouchap-app/supabase/migrations/20260406200000_tax_standard_us_effective_from_and_ns_hst.sql`、`vouchap-app/supabase/migrations/20260406180000_seed_crm_tax_rate_standard_us_ca.sql`、`vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/src/shared-logic/us-combined-sales-tax-builtin.ts`

---

### 2026-04-06（拍照小票仍无 item-tax：辖区/日期/receipt-processor 二次 apply）

**User（提示词/原意）**  
- 已按说明执行迁移后，**识别新小票仍无 item-tax 数据**。

**Assistant（实现前说明）**  
- 可能原因：**(1)** 初次 **`saveReceipt({ items: [] })`** 后本就不会写行税（仅说明性日志）；**(2)** **`updateReceipt` 之后**仍无辖区时 **`country` 为空**（非 USD/CAD 且无 `tax_jurisdiction_*`）直接 skipped；**(3)** **`date` 非 ISO** 导致 CRM 有效期比较异常；**(4)** 需确认识别完成后 **`applyReceiptItemTaxesAndReconcile` 一定执行**。  
- 拟：**辖区回退**（空币种按 USD→US；显式 CAD→CA）、**`receiptTaxAsOfDate`**、**诊断日志**、在 **`receipt-processor.ts`** 于 **`updateReceipt` 成功后再次调用 apply+schedule**。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-item-tax.ts`**：如上；无明细时 warn 说明「行税在明细写入后才算」。  
- **`receipt-processor.ts`**：**`getCurrentUser` + `bgSpaceId`** 下二次 **`applyReceiptItemTaxesAndReconcile`**（与 `updateReceipt` 内调用重复但幂等）。  
- **验证**：拍票 → 识别结束 → 看控制台 **`[receipt-item-tax] No tax rows computed`** 或 **`crm.tax_rate_standard failed`**；**非 USD/CAD** 且无辖区仍将 skipped（需模型返回辖区或扩展币种表）。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/src/shared-logic/receipt-processor.ts`

---

### 2026-04-06（updateReceipt：先删后插行项目是否致关联冗余、是否需改）

**User（提示词/原意）**  
- 日志显示**修改 receipt 详情**时是**删除 item 再重新添加**，是否会导致**关联数据冗余**？**是否必要**调整更新逻辑？

**Assistant（实现前说明）**  
- 无代码变更；查阅 **`database.ts` 中 `updateReceipt`**、`receipt_item_taxes` 迁移 FK。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt_item_taxes.receipt_item_id` → `receipt_items.id` 为 `ON DELETE CASCADE`**，删行项目会**级联删除**对应行税，**不会**长期堆积「孤儿」行税行，语义上**不是**「关联表冗余堆积」。  
- **代价**：每次编辑换来**新的 `receipt_items.id`**，随后 **`applyReceiptItemTaxesAndReconcile` 全量重算并插入**属于**预期**；若别处未来用**稳定 item 外键**（审计、第三方同步），全删全插会使旧 ID 失效——当前代码库未见除 **`receipt_item_taxes`** 外对 **item id** 的强依赖。  
- **是否必改**：非为「防冗余」而必改；若需**稳定 ID / 少写放大 / 保留细粒度审计**，可改为 **按 id upsert / 仅 diff 变更行**（实现与冲突处理成本更高）。

**关联**  
- `vouchap-app/src/shared-logic/database.ts`（`updateReceipt`）、`vouchap-app/supabase/migrations/20260405220000_tax_rate_catalog_and_receipt_item_taxes.sql`

---

### 2026-04-06（曼省等小票：只识别部分税种、行税合计与票面税差很大）

**User（提示词/原意）**  
- 刚识别的小票（**加拿大曼尼托巴省快餐**）**只识别了部分税种**，items 税总额与**小票税额偏差很大**，需核实并修复。

**Assistant（实现前说明）**  
- 假设根因：**识别返回的 `taxJurisdictionRegion` 为全称**（如 Manitoba）与 **`crm.tax_rate_standard.region_code`（MB）** 不一致；**`pickRatesForRegion`** 对 CRM 行需 **`bestScore >= 3`** 才入选：**GST** 仍可借 **`CA` + 空 region** 行得分入选，**RST 仅存在于 MB 行**时得分不足被丢弃 → **只有 5% GST、缺 7% RST**，与**约 12% 合计税**严重偏差。  
- 拟：**加拿大省名/别名 → ISO 二位码** 规范化；**`builtinStandardRates`** 补 **MB（GST+RST）、SK（GST+PST）**；**`CA_ALT_REGIONS`** 加入 MB/SK/QC；**Gemini 提示**强制二位省码。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-item-tax.ts`**：新增 **`normalizeCanadianRegionCode`**（导出）、在 **`applyReceiptItemTaxesAndReconcile`** 内 **`country === 'CA'`** 时写入规范化 region；补内置税率与重算省份列表；修正 **`NORTHWEST TERRITORIES`** 对象字面量键须加引号（否则 TS 语法错）。  
- **`gemini.ts`**：**`taxJurisdictionRegion` 必须为二位代码**，禁止全称。  
- **验证**：将票面 **`tax_jurisdiction_region` 设为 `Manitoba` 或 `MB`** 后保存/重算，**`receipt_item_taxes`** 应同时含 **GST + RST**，**`tax_items_sum`** 与 **`receipts.tax`** 接近；仍差时需查 **行价是否含税、分类税级** 等与模型无关因素。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/src/shared-logic/gemini.ts`

---

### 2026-04-06（保存小票：行税先出现 PST/RST 后消失只剩 GST）

**User（提示词/原意）**  
- **修改保存**刚才的小票，后台**短时间出现 pst 数据**，**最终又消失只剩 gst**。

**Assistant（实现前说明）**  
- 根因：**`scheduleReceiptTaxRecalcIfNeeded`** 在 **`pending_recalc`** 时对 **`CA_ALT_REGIONS`** 依次 **`regionOverride`** 重算；列表末尾曾含 **`''`** → **`pickRatesForRegion`** 只保留联邦 **GST**（`, CA region_code ''`），**删掉** 省税行 → 用户看到先有两税、后被异步一轮**覆盖成仅 GST**。  
- 另：**非 CA 小票**不应跑加拿大学历轮询。  
- 拟：**移除 `''`**；**扩展**备选省列表（含领土）；`schedule` 查询补上 **`tax_jurisdiction_country`**；不引入「凡有省码就禁止轮询」（与 **CAD 默认写 ON** 冲突）。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-item-tax.ts`**：**`CA_ALT_REGIONS`** 去掉 **空 region**；**`scheduleReceiptTaxRecalcIfNeeded`** 中 **`country !== 'CA'`** 时仅把 **`pending_recalc` → `variance`**，不执行省轮询；循环跳过条件用 **`normBase`** 与 **`baseRegion`** 与大写 **alt** 对齐。  
- **验证**：保存后 **Supabase** 观察 **`receipt_item_taxes`**：不应再出现「数秒后只剩 GST」；若 **`pending_recalc`** 仍存在，最后一轮不再使用 **`regionOverride: ''`**。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`

---

### 2026-04-06（重存小票后台仍只有 GST）

**User（提示词/原意）**  
- **重新保存**改小票，**后台仍只有 gst**（预期曼省等应有省税行）。

**Assistant（实现前说明）**  
- 推断：空间中 **`tax_rate_catalog`** 已有 **其它省**（常见 **CAD 默认 ON**）的 **GST** 行时，`pickRatesForRegion` 会为 **GST** 选中该行（score≥3），**`picked.size > 0`** → **`resolveRateRows`** **不会**再执行 **`ensureSpaceCatalogFromBuiltin`**；**RST** 仅存在于 **MB/对应省** 或 **CRM**，缓存无省税 → **最终只写入 GST**。另：**`CA ''` 联邦 GST** 会在非严格筛选时与省行并存，对 **HST 省**也不利。  
- 拟：在 **`region` 已非空** 时，候选税率 **仅限 `region_code` 与辖区一致** 的行，迫使 **MB** 场景 **`picked` 为空** 直至 **`ensure`** 写入 **GST+RST**，或 **CRM** 仅有省区行时正确双轨。

**Assistant（实现后说明 / 本轮结论）**  
- **`pickRatesForRegion`**：当 **`reg`** 非空时先用 **`scoped`** 过滤 **`region_code === reg`**（大小写不敏感），再按 kind 打分。  
- **验证**：`tax_jurisdiction_region = MB`（或规范化后 MB）、CRM/缓存无 MB 时重存后应出现 **`RST`** + **`GST`**；若仍为单列，查 **`crm` schema 暴露**、**RLS**、`tax_rate_catalog` **insert** 报错日志。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`

---

### 2026-04-06（Winnipeg 小票误用 14% HST 而非 GST+PST/RST）

**User（提示词/原意）**  
- 票面有 **Winnipeg**、**GST 5% / PST 7%** 字样，却用 **14% HST** 计算；需核查逻辑，确保**标准税率取用正确**。

**Assistant（实现前说明）**  
- **14% HST** 与种子 **NS**（`crm.tax_rate_standard`）一致；**模型**误填 **`tax_jurisdiction_region`**（如 **NS**）或 **`pending_recalc`** 跨省轮询在 **`within_tolerance`** 时**过早 break**，会误选 **NS** 单轨 HST。  
- **曼省**应为 **GST+RST**（票面常写 **PST**），**非** HST 省。  
- 拟：**从 `processed_by` + entity name/address 推断** Winnipeg、**R** 邮编、**GST+PST** 文本；若与 **HST 省**辖区冲突则**覆盖为 MB**；**禁用**跨省轮询中 **within_tolerance** 的「误匹配」；**Gemini** 规则补强。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-item-tax.ts`**：新增 **`inferCanadianRegionFromReceiptSignals`**、**`receiptTextSuggestsGstPlusProvincialNotHst`**（导出）；**`applyReceiptItemTaxesAndReconcile`** 拉取 **`processed_by`、`entity_id`** 并读 **`entities(name,address)`** 拼证据；**CA** 下在模型区划为 **ON/NB/NS/NL/PE** 且文本含 **GST+PST** 或推断 **MB/BC** 时**纠正辖区**；**`scheduleReceiptTaxRecalcIfNeeded`** **取消**跨省依次重算，仅 **`pending_recalc` → `variance`**（避免 NS 等误匹配）。  
- **`gemini.ts`**：Winnipeg / R 邮编 → **MB**；**GST+PST** 与 HST 省互斥说明。  
- **验证**：保存后 **`receipt_item_taxes`** 应为 **GST+RST**（非单列 HST）；**重新识别**旧小票以更新模型输出的 `taxJurisdictionRegion`。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/src/shared-logic/gemini.ts`

---

### 2026-04-07（混合税率行：食品免税与行税合计严格对账）

**User（提示词/原意）**  
- 部分 **item 适用税率不同**（如食品免税），识别却**统一税率**；**items 税总额与票面税额**不一致；需**严格校验**，**只允许四舍五入末位差异**。

**Assistant（实现前说明）**  
- 根因：行税仅按 **分类 → category_tax_class_map**；无**行级免税**时全部为 **STANDARD_TAXABLE**；对账曾用 **绝对 0.02 + 相对 2%**，易把**实质差异**标成 **within_tolerance**。  
- 拟：**`receipt_items.tax_class_code`** 可覆盖分类；**Gemini** 输出可选 **`taxClassCode`**（**EXEMPT** / **ZERO_RATED**）；**对账**仅允许 **≤0.01**（末位分币舍入），**去掉相对容差**；**variance** 时 **console.warn**。

**Assistant（实现后说明 / 本轮结论）**  
- **迁移** **`20260407100000_receipt_items_tax_class_code.sql`**；**`receipt-item-tax.ts`**：**`normalizeReceiptItemTaxClassCode`**、**`RECONCILE_ROUNDING_EPS = 0.01`**、**`reconcileStatus`** 仅 **matched / variance**（≤1 分视为 **matched**）；**`apply`** 读 **`tax_class_code`** 优先于分类；**`database.ts`** 写入/读出 **`tax_class_code`**；**`types`**、**`receipt-helpers`**、**`gemini`** 管线接 **`taxClassCode`**。  
- **验证**：迁移后 **免税行** 识别带 **EXEMPT** 时行税和应逼近 **`receipts.tax`**；仍 **variance** 须人工改分类或行税级。  
- **CRM**：当前种子以 **STANDARD_TAXABLE** 为主；**EXEMPT** 无税率行属预期（**0** 税）。

**关联**  
- `vouchap-app/supabase/migrations/20260407100000_receipt_items_tax_class_code.sql`、`vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/src/shared-logic/database.ts`、`vouchap-app/src/shared-logic/receipt-helpers.ts`、`vouchap-app/src/shared-logic/gemini.ts`、`vouchap-app/src/shared-logic/types/index.ts`

---

### 2026-04-07（加国超市：模型未标 EXEMPT 时用关键词启发式）

**User（提示词/原意）**  
- 终端仍报 **行税合计远高于票面税**（如 `receiptTax` 0.68 vs `sumItems` 2.24）；**免税行仍按全额计税**。

**Assistant（实现前说明）**  
- 先前 **`inferCanadianRetailGroceryTaxClass` / `canApplyCanadianGroceryTaxHeuristic`** 已加，但 **正则字符串转义错误**导致启发式几乎不生效；**`convertGeminiResultToReceipt`** 未在模型缺 **`taxClassCode`** 时调用启发式。  
- 拟：**字面量 `/.../i` 正则**重写启发式；**`receipt-helpers`** 在 **`CAD`、非 QC、国家空或 CA** 且模型未给合法 class 时补 **`EXEMPT`**；**`gemini`** 规则补充加国超市分行标注；果汁等应税关键字进 blocklist。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-item-tax.ts`**：`inferCanadianRetailGroceryTaxClass` 改为清晰 **`RegExp` 字面量**；扩充零食/果汁等 **应税** 词；**`wings`** 使用 **`\bwings\b`**。  
- **`receipt-helpers.ts`**：调用 **`canApplyCanadianGroceryTaxHeuristic(result)`** + **`inferCanadianRetailGroceryTaxClass(itemName, categoryName, resolvedCategory.name)`** 回填 **`taxClassCode`**。  
- **`gemini.ts`**：`RECEIPT_JSON_ITEMS_RULE` 增加加拿大超市 **基本食品 vs 即食/饮料/零食** 的 **`EXEMPT`** 说明。  
- **验证**：同一曼省/混合税率小票重扫后 **`sumItems`≈`receipt.tax`**（≤0.01）；异常品名可再扩关键词。已知 **QC** 不启用启发式；**Shopping** 等非 Grocery 分类依赖 **品名关键词** 命中。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/src/shared-logic/receipt-helpers.ts`、`vouchap-app/src/shared-logic/gemini.ts`

---

### 2026-04-07（行税计算阶段应用加国免税启发式 + Toast 诊断）

**User（提示词/原意）**  
- 仍错：**免税行仍按全额计税**，总额与票面不一致；**原生相机**时 Metro 日志看不到。

**Assistant（实现前说明）**  
- 根因：`receipt_items.tax_class_code` 为空时，`applyReceiptItemTaxesAndReconcile` **仅用 `category_tax_class_map`**，分类多为 STANDARD_TAXABLE，**永远在分类之后才算税**，识别阶段写的启发式若不命中则 DB 仍 null。  
- 拟：在 **`applyReceiptItemTaxesAndReconcile`** 内对 **CAD、非 QC** 在分类前调用与识别端一致的 **`inferCanadianRetailGroceryTaxClass`**（商户/证据字符串含店名以便判 Walmart 等）；将 **EXEMPT 写回 `receipt_items`**；用现有 **`showToast`**（与 ToastHost 订阅）在 **仍有 variance 或刚标 exempt** 时提示；去掉 **`processReceiptInBackground` 内第二次 `apply`**（与 `updateReceipt` 重复）。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-item-tax.ts`**：扩充关键词与 **商超私牌 / WM 行样式**、**已知杂货商商户名**；`Shopping` 分类仅在 **杂货商 + 食品/私牌 SKU** 时标 EXEMPT；行税循环顺序为 **显式 override → 启发式 → `category_tax_class_map`**；持久化推断的 **`tax_class_code`**；**英文 Toast** 提示 exempt 行数与 variance。  
- **`receipt-helpers.ts`**：启发式第四参传入 **`payeeName`**。  
- **`receipt-processor.ts`**：移除重复的 **`applyReceiptItemTaxesAndReconcile` / `scheduleReceiptTaxRecalcIfNeeded`**。  
- **验证**：加国混合税小票保存后 **`receipt_item_taxes` 合计应逼近 `receipts.tax`**；原生拍完后应出现 Toast（无 Metro 亦可）。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`、`receipt-helpers.ts`、`receipt-processor.ts`

---

### 2026-04-08（EXEMPT/ZERO_RATED 走平台地区税率镜像，去掉前端启发式）

**User（提示词/原意）**  
- **免税应配置地区税率**，识别到 **`tax_class_code` 后直接套用**，不要用前端启发式；**魁北克不应再特殊判断**。

**Assistant（实现前说明）**  
- 现状：`crm.tax_rate_standard` 几乎仅 **STANDARD_TAXABLE**；`builtinStandardRates` 对 EXEMPT 返回空，`resolveRateRows` 曾禁止对 EXEMPT **ensureSpaceCatalogFromBuiltin**，免税行无法与应税行走同一套 **按税种解析** 的路径。  
- 拟：**迁移** 为每条 CA/US 的 STANDARD 行镜像 **EXEMPT、ZERO_RATED**（**相同 tax_kind、effective 区间，rate=0**）；**builtin** 对 EXEMPT/ZERO_RATED 返回与应税**相同税种结构、税率全 0**；**`resolveRateRows`** 在缺缓存时也对免税类 **ensure**；删除 **`inferCanadianRetailGroceryTaxClass` / `canApplyCanadianGroceryTaxHeuristic`** 及 **`applyReceiptItemTaxesAndReconcile` 内推断与写回**；**`gemini`** 说明由平台按辖区解析 0%。

**Assistant（实现后说明 / 本轮结论）**  
- **`20260408100000_crm_exempt_zero_rated_mirror_standard.sql`**：从 **STANDARD_TAXABLE** 复制 **EXEMPT、ZERO_RATED**（**country CA/US**）。  
- **`receipt-item-tax.ts`**：**`builtinStandardTaxableLines`** 补全 **NB/NL/PE/NS/QC**；**`builtinStandardRates`** 对 EXEMPT/ZERO_RATED 映射为 **0%**；**`resolveRateRows`** 对免税类同样 **builtin 回填**；移除全部加国关键词启发式；** variance Toast** 保留。  
- **`receipt-helpers.ts`**：仅保留模型 **`taxClassCode`** 规范化。  
- **`gemini.ts`**：**`RECEIPT_JSON_ITEMS_RULE`** 与平台税率一致表述。  
- **验证**：部署迁移后对任意省（含 **QC**）行 **`tax_class_code=EXEMPT`** 时 **`resolveRateRows`** 应得到 **与各税种对应的 0 税率行**（或写入空间缓存）；**须跑 Supabase migration**。

**关联**  
- `vouchap-app/supabase/migrations/20260408100000_crm_exempt_zero_rated_mirror_standard.sql`、`vouchap-app/src/shared-logic/receipt-item-tax.ts`、`receipt-helpers.ts`、`gemini.ts`

---

### 2026-04-08（拍照/文档识别丢弃 taxClassCode 导致行税永远按应税算）

**User（提示词/原意）**  
- **免税类目仍识别不对**，行税额与**票面仍不一致**。

**Assistant（实现前说明）**  
- **`recognizeReceipt`（图片）与 `recognizeReceiptFromDocument`** 在组装返回的 **`items` 时未拷贝 `taxClassCode`**，模型即便输出免税类，`convertGeminiResultToReceipt` 也拿不到 → DB **`tax_class_code` 空** → 仅 **`category_tax_class_map`**，几乎全部 **STANDARD_TAXABLE**。同一路径还曾**丢弃 `taxJurisdictionCountry/Region`**（蛇形字段也未兼容），辖区错会进一步放大差额。  
- 拟：映射 **`taxClassCode` / `tax_class_code` / `taxClass`** 并经 **`normalizeReceiptItemTaxClassCode`**；返回体写入 **`taxJurisdiction*`**；**`recognizeReceiptFromText` / 音频** 在统一 item 时显式写入 **`taxClassCode`**；规范化函数增加常见别名（如 **TAX_EXEMPT**）。

**Assistant（实现后说明 / 本轮结论）**  
- **`gemini.ts`**：新增 **`normalizedItemTaxClassCode`**；图片/文档返回项含 **`taxClassCode`** 与 **`taxJurisdictionCountry/Region`**（含 **`tax_jurisdiction_*`**）；文字与音频 item 合并逻辑同步。  
- **`receipt-item-tax.ts`**：**`TAX_CLASS_ALIASES`** 映射非法但常见的模型写法。  
- **验证**：对混合税小票拍照后 **`receipt_items.tax_class_code`** 应有 **EXEMPT**（若模型输出）；行税和逼近 **`receipts.tax`**（另需已部署 **EXEMPT 镜像 migration**）。

**关联**  
- `vouchap-app/src/shared-logic/gemini.ts`、`vouchap-app/src/shared-logic/receipt-item-tax.ts`

---

### 2026-04-08（加拿大杂货分类默认 EXEMPT：无 map、非 QC）

**User（提示词/原意）**  
- **食品**仍未走 **0 税率**。

**Assistant（实现前说明）**  
- 仅依赖模型 **`taxClassCode`** 与 **`category_tax_class_map`** 时，预设分类名 **Groceries / Food / 食品** 等常**无 map 行**，回落 **STANDARD_TAXABLE**。  
- 拟：在 **`applyReceiptItemTaxesAndReconcile`** 与 **`convertGeminiResultToReceipt`** 中，当 **CAD、CA、辖区非 QC**、**行上无税类**、**分类无 `category_tax_class_map` 行**（避免覆盖用户显式 STANDARD）、且分类显示名匹配 **杂货类**（含 **grocer**、**grocery**、**food**、**食品/食物**，排除 **meal/restaurant/外餐** 等）→ **`EXEMPT`**（仍走平台镜像 0%）；算税后 **写回 `receipt_items.tax_class_code`**。  
- **QC** 不做分类默认免税（QST/食品规则复杂）。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-item-tax.ts`**：导出 **`canApplyCanadianGroceryCategoryExemptDefault`**、**`expenseCategoryDefaultsExemptInCanada`**；**`fetchCategoryTaxClassFromMap`** 区分 **hadRow**；杂货分类默认与持久化。  
- **`receipt-helpers.ts`**：转换时同步默认 **EXEMPT**。  
- **验证**：杂货小票、分类为 **Groceries**、无 map 时行税和应下降；若已为 **`category_tax_class_map` 配置税类**则以配置为准。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`、`receipt-helpers.ts`

---

### 2026-04-05（北美小票税：DB 规则、POS 码映射、Decimal、尾差与审计）

**User（提示词/原意）**  
- 从 **storeInfo / 辖区** 定位场景；逐项通过 **查库规则** 得税种与税率，**禁止**品类硬编码；**item_tax = price × Σrates**，区分 **inclusive / exclusive**；汇总与 **receipt.tax** 比对：**±0.02** 尾差摊到**金额最大应税行**，否则 **审计标记** + **`audit_comment`**；多税种、**Decimal**、负价折扣按税率比例。

**Assistant（实现前说明，若有）**  
- 新增 **`crm.pos_tax_code_rule`**（国家/省/商户 ILIKE / POS 字母 → **`tax_class_code`**）及示例 seed；**`receipt_items.pos_tax_code`**；**`receipts.tax_audit_required` / `tax_audit_comment`**。  
- **`receipt-item-tax.ts`**：**`decimal.js`** 算行税；解析顺序为 **行 `tax_class_code` → POS 规则 → `category_tax_class_map` → STANDARD**；移除 **加拿大杂货分类名默认 EXEMPT**；导出 **`getApplicableTaxRules`**；尾差与 **`finalizeReconciliation`**；**inclusive** 仅在**单价单一价内税种**时拆税。  
- **Gemini / types / database / receipt-helpers**：**`posTaxCode`** 管线；收据读写审计字段。

**Assistant（实现后说明 / 本轮结论）**  
- 迁移：**`vouchap-app/supabase/migrations/20260409100000_pos_tax_code_rule_and_audit.sql`**。依赖：**`decimal.js`**。  
- **验证**：跑 migration 后，**MB Walmart 样例**在 **pos_tax_code=D/H** 且商户名匹配时应对 **`ZERO_RATED` / `STANDARD_TAXABLE`**；**|Σ 行税 − receipt.tax| ≤ 0.02** 时摊差后 **`tax_items_sum`** 对齐票面、**`tax_audit_required=false`**；超额则 **`variance` + 英文 audit 注释**。  
- **残留**：POS seed **merchant-specific**，生产需按零售商扩充；**价内税 + 多税种并行**未完整建模。

**关联**  
- `vouchap-app/supabase/migrations/20260409100000_pos_tax_code_rule_and_audit.sql`、`receipt-item-tax.ts`、`gemini.ts`、`database.ts`、`types/index.ts`、`receipt-helpers.ts`

---

### 2026-04-05（POS 税码：自动学习并晋升 CRM 规则）

**User（提示词/原意）**  
- 仅静态 **`pos_tax_code_rule` 没用**，必须配套**自动变聪明**的机制。

**Assistant（实现前说明，若有）**  
- 在**对账 matched**、行上 **`pos_tax_code` 存在**且**尚无匹配 CRM 规则**时，若税类来自 **模型行 `tax_class_code`** 或 **`category_tax_class_map` 有行**，则视为可信信号。  
- 新增 **`public.pos_tax_code_learning_events`** 追加观测；**SECURITY DEFINER** RPC **`record_pos_tax_learning_and_maybe_promote`**：校验 **user_spaces + receipt 归属**，同色类在 **180 天内达 `p_min_observations`（默认 2）** 且无**多类冲突**、无**已存在不同类规则**时，**INSERT `crm.pos_tax_code_rule`**（`source=learned`，`priority=150`）。商户名规范为 **`normalize_merchant_pattern_for_learning`**（空格→`%`，与 ILIKE 种子一致）。

**Assistant（实现后说明 / 本轮结论）**  
- 迁移：**`20260410120000_pos_tax_code_learning.sql`**；**`receipt-item-tax.ts`** 在 **`finalStatus === matched`** 且非 **`recalcPass`** 时对符合条件的行逐个 **`rpc`**。  
- **验证**：两张「同店+同省+同 POS 码+同类」且对账成功的小票（或一单两行）后，应出现 **`learned`** 规则；下一张小票应能 **直接命中规则**。  
- **残留**：信噪依赖模型/分类；**多类同码**会 **`conflicting_classes`** 不晋升；不调用外网搜索。

**关联**  
- `vouchap-app/supabase/migrations/20260410120000_pos_tax_code_learning.sql`、`vouchap-app/src/shared-logic/receipt-item-tax.ts`

---

### 2026-04-05（POS D 仍按 STANDARD 计税：优先级与商户名）

**User（提示词/原意）**  
- 行上 **pos_tax_code=D** 应按规则 **ZERO_RATED**，却回填 **STANDARD_TAXABLE**，税额错且与票面校对失败仍落库。

**Assistant（实现前说明，若有）**  
- 根因：**`tax_class_code`（模型默认应税）优先于 `pos_tax_code_rule`**；另 **`entity` 未建时 `merchantName` 为空** 导致 **%WALMART%** 不匹配。  
- 拟：**CRM POS 规则优先**于行上模型税类；**`processed_by`** 补 **`supplierName`**；**商户 ILIKE** 改为 **分段字母数字** 匹配以使 **Wal-Mart** 命中 **WALMART**；命中规则后 **回写 `receipt_items.tax_class_code`**；**`getApplicableTaxRules`** 同步顺序。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`receipt-item-tax.ts`**（含 **`extractSupplierNameFromProcessedBy` export**）。小票主表仍会保存；校错时 **`tax_reconciliation_status=variance` / `tax_audit_required`** 为预期，根因修复后应对齐票面。  
- **验证**：无 entity、仅有 AI **`supplierName` + pos D + MB** 时行税应为 0 类镜面税率；DB 行 **`tax_class_code`** 应为 **ZERO_RATED**。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`

---

### 2026-04-05（清理 crm.tax_rate_standard 重复种子与库内重复行）

**User（提示词/原意）**  
- **`tax_rate_standard`** 已有数据检查清理，剔除不必要重复项。

**Assistant（实现前说明，若有）**  
- **061200** 中 CA 小样与 **061800** 全量 CA/US 种子自然键重复；**062000** 中 NS HST 插入与 **061800** 重复。  
- 拟：061200 **删除**该段 INSERT，以 **061800** 为唯一参考税率种子；062000 **删除**冗余 NS INSERT，**UPDATE US** 仅修正仍为 **effective_from = 2025-01-01** 的历史行；新增 **`20260411100000_tax_rate_standard_dedupe.sql`**：按自然键去重并 **回写 receipt_item_taxes** 再删多余 id。

**Assistant（实现后说明 / 本轮结论）**  
- 已修改 **`20260406120000_crm_tax_rate_standard.sql`**、**`20260406200000_tax_standard_us_effective_from_and_ns_hst.sql`**；新增 dedupe 迁移。新环境只依赖 **061800** 作为主种子。  
- **验证**：`supabase db reset` 或新库迁移后 **crm.tax_rate_standard** 无同键多行；生产若曾绕过唯一约束可跑 dedupe。

**关联**  
- `vouchap-app/supabase/migrations/20260406120000_crm_tax_rate_standard.sql`、`20260406200000_tax_standard_us_effective_from_and_ns_hst.sql`、`20260411100000_tax_rate_standard_dedupe.sql`

---

### 2026-04-05（CRM 表重命名：pos_tax_code_rule → tax_pos_code_rule）

**User（提示词/原意）**  
- **`pos_tax_code_rule`** 表更名为 **`tax_pos_code_rule`**。

**Assistant（实现前说明，若有）**  
- 基线迁移 **`20260409100000`** 改为新建 **`crm.tax_pos_code_rule`**（索引 **`idx_tax_pos_code_rule_country`**、RLS 策略名 **`crm_tax_pos_code_rule_select`**）；**`20260410120000`** 内 RPC / COMMENT 全部指向新表名。  
- 已部署且仍为旧表名的库：新增 **`20260411120000_rename_pos_tax_code_rule_to_tax_pos_code_rule.sql`**，**`RENAME`**（仅当 **`crm.pos_tax_code_rule`** 存在且 **`crm.tax_pos_code_rule`** 不存在）并 **`CREATE OR REPLACE`** **`record_pos_tax_learning_and_maybe_promote`**，避免函数体仍引用旧表名。  
- 应用层：**`receipt-item-tax.ts`** **`.schema('crm').from('tax_pos_code_rule')`**；**`types/index.ts`** 注释同步。

**Assistant（实现后说明 / 本轮结论）**  
- 已改上述迁移与 TS；新增 rename 迁移。  
- **验证**：新库 **`supabase db reset`** 后存在 **`crm.tax_pos_code_rule`**；旧库 **`db push`** 后旧表被重命名且学习 RPC 仍可晋升规则；客户端拉规则无 404。  
- **残留**：若历史环境 RLS 策略名仍为旧命名，仅影响可读性，不影响权限。

**关联**  
- `vouchap-app/supabase/migrations/20260409100000_pos_tax_code_rule_and_audit.sql`、`20260410120000_pos_tax_code_learning.sql`、`20260411120000_rename_pos_tax_code_rule_to_tax_pos_code_rule.sql`、`receipt-item-tax.ts`、`types/index.ts`

---

### 2026-04-05（Walmart：pos_tax_code 已有但 tax_class_code 未走 CRM 规则）

**User（提示词/原意）**  
- Walmart 小票 **POS code 已识别**，**`tax_class_code` 仍未按规则**（截图 **D/E** 等为 **STANDARD_TAXABLE**）。

**Assistant（实现前说明，若有）**  
- 根因 1：**已关联 entity 时仅用 `entity.name` 做 `%WALMART%` 匹配**，若实体名为用户改过、简称或与票头商户不一致，**不会再用 `processed_by` 里的商户**，导致 **POS 规则不命中**。  
- 根因 2：种子仅有 **D/H**，**无 **E**，E 行会落默认应税。  
- 拟：**`mergeMerchantHintsForPosRules(primary, extractSupplierNameFromProcessedBy)`** 合并后再 **`pickPosTaxClassFromRules`**；**扩大 `extractSupplierNameFromProcessedBy`**（`merchantName` / `storeName` / 一层 `parsedResult`）；**单字母码**在仅含杂字符时规范为字母位；学习 RPC 的 **`p_merchant_display_name`** 与 POS 匹配用同一合并串；**091000 + 迁移 111300** 增加 **CA Walmart E → ZERO_RATED**（示例种子，可按店修正）。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`receipt-item-tax.ts`**；已更新 **`20260409100000`** 种子并新增 **`20260411130000_tax_pos_code_rule_walmart_ca_e.sql`**。  
- **验证**：关联非 Walmart 实体但 **`processed_by.supplierName`** 含 Walmart 时，**D** 应解析为 **ZERO_RATED**；跑迁移后 **E** 同省/CA 兜底应有规则。若 **`crm.tax_pos_code_rule` 客户端查不到**（schema 未暴露），仍会得到空规则——需 Dashboard 暴露 **crm**。  
- **残留**：**GP** 等复合码需单独种子；**E 的税意因省/店可能不同**，运营可按实票改 **`maps_to_tax_class_code`**。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/supabase/migrations/20260409100000_pos_tax_code_rule_and_audit.sql`、`20260411130000_tax_pos_code_rule_walmart_ca_e.sql`

---

### 2026-04-05（票面税额驱动的 POS 码自学习：receipt.tax 拟合 + 学习）

**User（提示词/原意）**  
- 计算仍不对；应能根据**票面税额**发现不对；需要按**票面税额核算**做**自学习**，使 **`pos_tax_code` 含义**越来越准。

**Assistant（实现前说明，若有）**  
- 原学习仅在 **`tax_reconciliation_status=matched`** 且行类来自 **override/category** 时触发，**默认 STANDARD** 不参与**；与「用票面总额校验」脱节。  
- 拟：在 **`Σ` 行税 ≠ `receipt.tax`**（`variance`）时，对**有 `pos_tax_code` 且无 CRM POS 规则**的行做**坐标下降**（在 **STANDARD / ZERO_RATED / EXEMPT** 间试探），使 **`Σ`（含尾差摊分）与 `receipt.tax` 差 ≤ 0.02**；成功则**回写行 `tax_class_code`**、**`receipt_item_taxes` 用 `recalc`**，并对这些行调用 **`record_pos_tax_learning_and_maybe_promote`**（票面拟合标签）。  
- 首遍已 **matched** 时：保留原防刷策略（**纯默认 STANDARD** 不学），**拟合成功**则**一律**学。  
- 抽取 **`buildDraftsFromTaxClassMap`**、**`applyPennyTailAllocation`**、**`greedyFitPosLineClassesToReceiptTax`**；**`ApplyReceiptItemTaxOptions.skipReceiptTaxFit`**。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`vouchap-app/src/shared-logic/receipt-item-tax.ts`**（无新 DB 迁移）。  
- **验证**：构造 **税额对不齐** 且多行带 **POS 码**、无 CRM 规则的小票 → 拟合后应对齐票面并写入学习事件；**全票无 POS 码或仅 CRM 已锁行** → 不拟合。  
- **残留**：拟合**不唯一**时可能取到局部最优；行数 **>28** 跳过；**价内税+多税种**仍可能无法单靠三类切换对齐。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`

---

### 2026-04-05（Walmart POS E：仅 GST、不收 PST/RST — `GST_ONLY`）

**User（提示词/原意）**  
- 票面 **GST / PST（或 MB 的 RST）** 分项与计算不符；**`pos_tax_code=E` 不收 PST**（省税不应按全额应税摊到 E 行）。

**Assistant（实现前说明，若有）**  
- **E→`ZERO_RATED`** 会令 **GST+省税** 均为 0；**E→`STANDARD_TAXABLE`** 则 **GST+PST/RST** 全征 → **省税合计偏大**。  
- 拟新增 **`GST_ONLY`**：**MB/BC/SK** 在 CRM 为 **GST 5% + 省税税种 0%**；扩展 **POS 规则 / 学习** CHECK 与 RPC；**Walmart CA E** 改为 **`GST_ONLY`**；**builtinStandardRates** 与 **receipt.tax 拟合**候选含 **`GST_ONLY`**（CA MB/BC/SK）。

**Assistant（实现后说明 / 本轮结论）**  
- 迁移 **`20260411140000_gst_only_tax_class_walmart_e.sql`**；已同步 **`091000`/`101200`/`111300`** 与 **`receipt-item-tax.ts`**。  
- **验证**：**`supabase db push`** 后 **E** 行仅 **5% GST**，省税仅来自 **非 E 应税行**；**`receipt.tax` 总额**校对应改善。  
- **残留**：票面印 **「PST」** 而 MB 实为 **RST** 仅为展示差异；**QC** 等未加 **GST_ONLY** 种子。

**关联**  
- `vouchap-app/supabase/migrations/20260411140000_gst_only_tax_class_walmart_e.sql`、`receipt-item-tax.ts`

---

### 2026-04-05（撤销 GST_ONLY：按税种过滤 + 票面规则收尾）

**User（提示词/原意）**  
- 不应新增 **`GST_ONLY`**，应为**多税种分别匹配**（如 POS 码仅计 GST）。  
- 总结：**严格按票面税额校验**，不对则重新组合，正确则学习；**票面税额为 0** 则各 item 税额记 0；**仅一项 item** 时：若票面已**分税种**则直接记入该 item；若**未分税种**则按规则拆分税种并校验票面。

**Assistant（实现前说明，若有）**  
- **`crm.tax_pos_code_rule.included_tax_kind_codes`**（NULL=辖区全部税种；`['GST']`=本行只保留 GST 分量）替代行税类 **`GST_ONLY`**；迁移 **`20260411140000_tax_pos_rule_included_tax_kinds.sql`** 等已就位。  
- 拟在 **`applyReceiptItemTaxesAndReconcile`**：`receipt.tax===0` 短路清空行税并 **matched**；**单明细 + `tax_breakdown`** 且分项和≈票面时直接写入 **`receipt_item_taxes`**；主循环用 **`resolvePosTaxCodeRule`** 建立 **`taxKindFilterByItemId`**，**`buildDraftsFromTaxClassMap`** / **`greedyFitPosLineClassesToReceiptTax`** 全路径传入；查询收据增加 **`tax_breakdown`**。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`vouchap-app/src/shared-logic/receipt-item-tax.ts`**：`parseReceiptTaxBreakdown` / **`canonicalTaxKindFromBreakdownKey`**（MB 票面 PST→RST）；零税额分支；单 item+**`tax_breakdown`** 与 **`receipt.tax`** 对齐则落库；主路径与拟合路径传入 **`taxKindFilterByItemId`**。  
- **验证**：零税小票 → 行税全 0；单 item 带 `{GST,PST}` JSON 且与总额一致 → 按税种写入；Walmart **E** + **`included_tax_kind_codes={GST}`** → 仅 GST 行分量。  
- **残留**：**保存/解析流水线**若未写入 **`tax_breakdown`** 需在各层类型与 insert 中补字段；多行小票仍依赖规则引擎+拟合与票面总额对齐。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/supabase/migrations/20260411140000_tax_pos_rule_included_tax_kinds.sql`

---

### 2026-04-05（crm.tax_rate_standard：EXEMPT / ZERO_RATED 不重复存）

**User（提示词/原意）**  
- `tax_rate_standard` 里**不需要 EXEMPT 与 ZERO_RATED 并存**（与不要 GST_ONLY 式冗余一致）。

**Assistant（实现前说明，若有）**  
- 现状：迁移 **`081000`** 对每条 **STANDARD** 复制了 **EXEMPT + ZERO_RATED** 两套全 0 行；语义上两行相同。  
- 拟：**CRM 只保留 EXEMPT 镜像**；**`receipt_items.tax_class_code`** 仍可为 **EXEMPT | ZERO_RATED**（申报/展示语义）；查询 CRM 时 **ZERO_RATED → EXEMPT**；**space cache** 对两种 class 并查以兼容旧缓存。

**Assistant（实现后说明 / 本轮结论）**  
- 新迁移 **`20260411150000_tax_rate_standard_drop_zero_rated_mirror.sql`**：`receipt_item_taxes` 上 FK 从 **ZERO_RATED** 标准行迁到同键 **EXEMPT** 行后 **DELETE ZERO_RATED**；更新表 COMMENT。  
- **`081000`** 改为只插入 **EXEMPT** 镜像（新库不再生成 **ZERO_RATED** CRM 行）。  
- **`receipt-item-tax.ts`**：`crmTaxClassForStandardLookup`、`queryCatalogCandidates` 对 **public.tax_rate_catalog** 在 EXEMPT/ZERO_RATED 时用 **`.in('tax_class_code', ['EXEMPT','ZERO_RATED'])`**。  
- **验证**：`supabase db push` 后 **crm** 无 **ZERO_RATED** 行；零税率行计算与 **crm_tax_rate_standard_id** 仍可用。

**关联**  
- `vouchap-app/supabase/migrations/20260408100000_crm_exempt_zero_rated_mirror_standard.sql`、`20260411150000_tax_rate_standard_drop_zero_rated_mirror.sql`、`receipt-item-tax.ts`

---

### 2026-04-05（无明细小票：合并为单行再走单明细税路径）

**User（提示词/原意）**  
- 无明细的小票处理有问题，应**落一行 item**，合并到**单明细**的处理路径（`tax_breakdown`、规则引擎等）。

**Assistant（实现前说明，若有）**  
- 原逻辑：**无 `receipt_items`** 时直接 **skipped** 且不写行税。  
- 拟：在 **`applyReceiptItemTaxesAndReconcile`** 内若明细为空，**插入一条**合成行（英文名 **Receipt total (merged)**），**price** = `total_amount − tax`（与常见价外税一致；缺税且 total>0 时用 total）；分类用空间内默认支出类；成功后再 **select** 明细并走原有流程。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`vouchap-app/src/shared-logic/receipt-item-tax.ts`**：`mergedLineExclusiveBase`、`pickDefaultExpenseCategoryId`、`ensureSingleMergedLineItem`；收据查询增加 **`total_amount`**。  
- **验证**：保存仅有抬头 **`total_amount`/`tax`**、无 AI 行明细的收据 → 应出现一行合并明细并完成税额拆分/对账；空间**无任何 category** 时仍会 skipped（与旧 save 依赖一致）。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`

---

### 2026-04-05（receipt_item_taxes 空表：ZERO/EXEMPT 被跳过 + 辖区无行时联邦兜底）

**User（提示词/原意）**  
- **`tax_class_code`**：item 与税种 **1:N**，直接挂一个 class 的结构有问题。  
- 实测：**pos_tax_code** 已有，**`receipt_item_taxes`** 仍无数据。

**Assistant（实现前说明，若有）**  
- **语义**：`tax_class_code` = **supply / 税率包**（选 CRM 哪套行）；**税种明细** = **`receipt_item_taxes`**（每 **`tax_kind_code`** 一行）。  
- **空表根因**：**`buildDraftsFromTaxClassMap`** 在 **`taxAmt.isZero() && rateZero`** 时跳过，**ZERO_RATED/EXEMPT** 下行税率全 0 → 无 draft。  
- 次要：strict 省份筛选无行时未退 **`region_code ''`**。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipt-item-tax.ts`**：**EXEMPT/ZERO_RATED** 仍写入 **amount=0** 的税种行；**`pickRatesForRegion`** 无省份行时用联邦行；**rateMap 空** 且 line price>0 时 **warn**。注释与 **`types/index.ts`** 已澄清。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/src/shared-logic/types/index.ts`

---

### 2026-04-06（Android Chat to log：相册 unregistered ActivityResultLauncher）

**User（提示词/原意）**  
- dev Android 端 expenses 的 chat 页面，上传文件报错（截图：`ExponentImagePicker.launchImageLibraryAsync` → `IllegalStateException: unregistered ActivityResultLauncher`）。

**Assistant（实现前说明，若有）**  
- 根因倾向：Expo Modules 在 Activity `onDestroy`/`onHostResume` 后会**异步**重新 `registerActivityContracts`；原先 Android 分支用 `InteractionManager.runAfterInteractions` + `setTimeout(0)` 推迟 `launch`，易与「旧 launcher 已 unregister、新 launcher 尚未挂好」的窗口重叠；连续第二次打开相册更易触发。  
- 拟：`chat-to-log.tsx` 内改为在权限通过后**立即**调用 `launchImageLibraryAsync`，并对仅含 `unregistered ActivityResultLauncher` 的失败做短 backoff **重试**（最多 3 次）。

**Assistant（实现后说明 / 本轮结论）**  
- 已新增 `launchImageLibraryAsyncWithAndroidRelaunchRetries` + `isAndroidImagePickerLauncherNotReadyError`，移除 Android 的 defer 分支，统一 `await launchPicker()`。  
- **验证**：真机/Android 模拟器 Chat to log → 连续多次点相册选图（可先传 PDF/图再传 JPEG）；不应再出现该 IllegalStateException。若仍偶发，可把重试间隔略加大或检查开发者选项「不保留活动」场景。

**关联**  
- `vouchap-app/src/mobile-ui/app/chat-to-log.tsx`

---

### 2026-04-07（梳理现有税拆分实现 + 目标设计方案纲要）

**User（提示词/原意）**  
- 完整梳理此前代码与 SQL，并按 7 点重新梳理「税额拆到 item」的设计：①标准税率表不重复税种（如安省只挂 HST）；②receipt 用 JSON 记录分税种税额并做合计校验；③item 据辖区+pos_tax_code 判定关联税种并 JSON 落库；④按标准表算分项写入 `receipt_item_taxes`；⑤CRM 增加带 `entity_id` 的 `pos_tax_code` 表及模型自学习；⑥残差反推法分配不确定行；⑦清理无用表字段。

**Assistant（实现前说明，若有）**  
- 无本轮代码变更；通读迁移 `20260405220000`…`20260411150000` 与 `receipt-item-tax.ts`、`gemini.ts` 等，输出与现状对齐的设计纲要供后续实现对齐。

**Assistant（实现后说明 / 本轮结论）**  
- 见对话回复：**现状映射**（`crm.tax_rate_standard`、`tax_rate_catalog`、`receipt_item_taxes`、`tax_pos_code_rule`、`pos_tax_code_learning_events`、`receipts.tax_breakdown`）与 **目标架构缺口**（按税种对账、`entity_id` 维度、残差按税种分配、税率/POS 规则的自学习写入路径、废弃对象清点）。  
- **验证**：后续落地分支可对每条需求写迁移 + 单测/集成收据样例（多行 MB Walmart、ON HST、`tax_breakdown` 与多行分摊）。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`、`vouchap-app/supabase/migrations/202604*.sql`

---

### 2026-04-07（entity_pos_tax_code：弃用 tax_rate_catalog / category 映射 / 旧学习表）

**User（提示词/原意）**  
- 整合清理 `public.tax_rate_catalog`、`category_tax_class_map`、`pos_tax_code_learning_events`；标准税率只认 **crm**；商家税码表 **entity_pos_tax_code** 放 **public** 且 **entity → public.entities.id**；其余按前序设计改代码。

**Assistant（实现前说明，若有）**  
- 新增迁移：``entity_pos_tax_code``、``entity_pos_tax_code_learning_events``、``record_entity_pos_tax_learning_and_maybe_promote``；删 ``tax_rate_catalog_id``、插入 ``entity_pos_tax_code_id``、行上 ``applicable_tax_kinds``；DROP 三旧表与旧 RPC。  
- ``receipt-item-tax.ts``：仅用 ``crm.tax_rate_standard`` + 内置 fallback；POS 先 ``entity_pos_tax_code`` 再 ``crm.tax_pos_code_rule``；去掉 category 映射查询；学习仅在有 ``receipt.entity_id`` 时写实体规则。

**Assistant（实现后说明 / 本轮结论）**  
- 迁移：``vouchap-app/supabase/migrations/20260412100000_entity_pos_tax_code_tax_catalog_cleanup.sql``。  
- 逻辑：``receipt-item-tax.ts``、``types/index.ts`` 注释。  
- **验证**：`supabase db push` / 本地迁移后，有 entity 的收据多次相同 pos 码应对账并升格 ``entity_pos_tax_code``；无 CRM 行辖区仍能靠内置税率算行税。  
- **说明**：表名采用 ``entity_pos_tax_code``（与用户命名一致）；种子/运营仍可手插该行；**crm.tax_pos_code_rule** 仍作无 entity 或兜底匹配。

**关联**  
- `20260412100000_entity_pos_tax_code_tax_catalog_cleanup.sql`、`receipt-item-tax.ts`

---

### 2026-04-07（entity_pos_tax_code 增加 space_id 与 entities 对齐）

**User（提示词/原意）**  
- `entity_pos_tax_code` 仅 FK `entities.id` 不妥，`entities` 按 space 区分；迁移尚未执行，需微调 SQL。

**Assistant（实现前说明，若有）**  
- 为 `entity_pos_tax_code` / `entity_pos_tax_code_learning_events` 增加 **`space_id`**（FK `spaces`），触发器校验 **`entities.space_id`**、收据 **`receipts.space_id`** 一致；RLS 改为按 **`space_id ∈ user_spaces`**；RPC 与 TS 查询均带 **`space_id`**。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`20260412100000_entity_pos_tax_code_tax_catalog_cleanup.sql`**；**`receipt-item-tax.ts`**：`fetchEntityPosTaxCodesForEntity(spaceId,…)`，**`getApplicableTaxRules`** 恢复必填 **`spaceId`**。

**关联**  
- 同上迁移与 `receipt-item-tax.ts`

---

### 2026-04-07（更正：entity_pos_tax_code 不按 space；merchant 键不得 FK entities）

**User（提示词/原意）**  
- 不是要给 `entity_pos_tax_code` 增加 `space_id`，该表是**共用目录**；重点是表里的「商户实体」**不能**关联 `public.entities.id`（entities 按 space 区分）。

**Assistant（实现前说明，若有）**  
- 迁移与类型已按 **`merchant_entity_id`（无 FK）** + 收据列 **`receipts.merchant_entity_id`** 建模；补一处代码遗漏：`getAllReceipts` 完整映射需透出 **`merchantEntityId`**，否则详情页税逻辑与列表不一致。

**Assistant（实现后说明 / 本轮结论）**  
- **`vouchap-app/src/shared-logic/database.ts`**：在 `getAllReceipts` 的 `rows.map` 返回对象中增加 **`merchantEntityId`**（与 `getAllReceiptsForList` 等路径一致）。  
- **验证**：拉取含 `merchant_entity_id` 的收据详情，`Receipt.merchantEntityId` 有值且行税解析可命中 `entity_pos_tax_code`。  
- **说明**：上一条「给 `entity_pos_tax_code` 加 `space_id`」的方向已废弃；**学习事件表**仍保留 `space_id` 仅作 RLS/收据归属校验，**目录表**无 `space_id`。

**关联**  
- `20260412100000_entity_pos_tax_code_tax_catalog_cleanup.sql`、`database.ts`

---

### 2026-04-07（Engagement / Todos：task 行 Upload 支持任意文件类型）

**User（提示词/原意）**  
- engagement 详情页 todos、task 行上传文件，需支持上传所有文件格式，不局限于图片。

**Assistant（实现前说明，若有）**  
- Engagement 与 project 详情共用 **`TaxFilingTodosView`**，原 **`expo-image-picker`** 仅相册图片；改为 **`expo-document-picker`** 的 `*/*`，Web 侧 **`base64: false`** 便于 blob 上传。  
- **`uploadTaxFilingFile`** 已支持 `fileName`/`mimeType`；补 **`getFileExtAndMime`**：在文档/图片规则之后，对任意扩展名用 picker MIME 或 `application/octet-stream`，避免非图非表拆文档被误标成 `.jpg`。  
- **`processTaxFilingAttachmentAfterCreate`** 的 **`isImage`** 按 MIME/扩展名判断；抽出 **`tax-filing-todo-upload-helpers`** 供 **`tax-filing/order/[orderId]/index.tsx`** 内嵌 Todo 树同款上传路径复用。

**Assistant（实现后说明 / 本轮结论）**  
- 改动：**`TaxFilingTodosView.tsx`**（DocumentPicker + 正确 `isImage`）、**`supabase.ts`**（`getFileExtAndMime` 泛型扩展名）、**`tax-filing-todo-upload-helpers.ts`**（新建）、**`tax-filing/order/[orderId]/index.tsx`**（与上一致的 picker）。  
- **验证**：在 engagement / project Todos 点 task 行 Upload，可选 PDF、Office、ZIP 等；上传后存储扩展名与 MIME 合理；图片仍走 image 识别路径。  
- **风险**：极大文件 + `copyToCacheDirectory: true` 在移动端可能有性能/空间压力；AI 识别对非扫描类文件可能失败（既有行为）。

**关联**  
- `vouchap-app/src/mobile-ui/components/TaxFilingTodosView.tsx`、`vouchap-app/src/shared-logic/supabase.ts`、`vouchap-app/src/shared-logic/tax-filing-todo-upload-helpers.ts`、`vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/index.tsx`

---

### 2026-04-07（Chat 税表附件：完整展示名 + display_name + 行内改名）

**User（提示词/原意）**  
- Chat 提交 tax 文件时，仅用 **`project_todo_attachments.doc_type`** 作标题辨识度低；需要完整命名，并支持用户修改；重命名交互复用 task 名称修改（输入 + 确认/取消）。

**Assistant（实现前说明，若有）**  
- **`doc_type`** 保留为 AI 机器码；新增 **`source_file_name`**、**`display_name`**（迁移），识别成功后 **`display_name`** 由 **`buildTaxFilingAttachmentDefaultDisplayName`**（摘要首行 / 类型可读串 / 原始文件名）生成。  
- **`chat-to-log`** 卡片主标题用 **`displayName`**，**`Type: doc_type`** 降为副标；铅笔进入行内 **`TextInput` + Cancel + 确认**，写入 **`updateProjectTodoAttachment.display_name`**；历史消息 id 为 **`{logId}-preview`** 时同步 **`updateChatLogResponseData`**。  
- 列表/跟进：**`firm.ts`** 附件行映射统一走 **`projectTodoAttachmentRowToSummary`**；**`tax-filing-attachment-followup`** 与 chat 识别写库、**`TaxFilingTodosView`** 重试识别补 **`display_name`**；订单页附件卡主标题改为 **`f.name`**。

**Assistant（实现后说明 / 本轮结论）**  
- 迁移 **`20260407140000_project_todo_attachments_display_name.sql`**；新建 **`tax-filing-attachment-display-name.ts`**；改 **`firm.ts`**、**`tax-filing-attachment-followup.ts`**、**`chat-to-log.tsx`**、**`TaxFilingTodosView.tsx`**、**`tax-filing/order/[orderId]/index.tsx`**。  
- **验证**：跑迁移 → Chat 上传税表 → 卡片标题为完整默认名 → 铅笔改名后任务列表与重新进入 Chat 历史一致；详情弹窗标题优先 **`display_name`**。  
- **说明**：瞬态消息 id **`attach-preview-{attachmentId}`** 无对应 **`ai_chat_logs.id`**，改名仅落库附件；重进会话后 enrich 仍正确。

**关联**  
- `20260407140000_project_todo_attachments_display_name.sql`、`tax-filing-attachment-display-name.ts`、`firm.ts`、`chat-to-log.tsx`

---

### 2026-04-07（补：Chat 税表附件改名入口图标不可见）

**User（提示词/原意）**  
- 没有出现编辑名称的入口 icon。

**Assistant（实现后说明 / 本轮结论）**  
- **原因**：标题 **`Text`** 使用 **`flex: 1`** 时在 Web/React Native Web 上易占满行宽，右侧铅笔被挤到 **`minWidth: 0`** 区域外不可见；另 **`voucherType`** 与消息上类型不一致时整块卡片条件不成立。  
- **修复**：卡片条件改为仅依赖 **`attachmentPreview` 的 tax 形状**（**`id` + `projectId` + `todoId`**）；标题外包 **`attachmentPreviewTitleTextWrap`（flex:1）**；铅笔改为 **`create-outline` + 浅紫底按钮 `attachmentPreviewEditBtn`**。（后续需求已将改名入口从 Chat 迁至 Todos，见下条。）

**关联**  
- `vouchap-app/src/mobile-ui/app/chat-to-log.tsx`

---

### 2026-04-07（附件显示名改名：从 Chat 卡片迁至 Todos 文件行）

**User（提示词/原意）**  
- 聊天卡片上不宜修改；在 **Todos 列表上展开任务后的文件名称** 增加与 task 名称相同的行内修改交互。

**Assistant（实现前说明，若有）**  
- 移除 **`chat-to-log.tsx`** 中税表附件卡片的铅笔/行内输入/`persistTaxFilingAttachmentDisplayName` 及相关样式；卡片仅展示标题 + **`Type:`**。  
- 在 **`TaxFilingTodosView.tsx`** 的 **`TodoTree`** 附件行：Web 且非 catalog 只读时显示改名铅笔；行内 **`TextInput` + 关闭/确认** 对齐 task **`renameInline`**，确认调用 **`updateProjectTodoAttachment({ display_name })`** 后 **`refreshFiles(tree)`**；递归子树透传新 props；task/附件改名互斥（新开一端时清空另一端草稿）。

**Assistant（实现后说明 / 本轮结论）**  
- 已按上实现。  
- **验证**：Web 打开税表项目 Todos → 展开任务 → 文件行铅笔 → 改名保存 → 列表与 DB **`display_name`** 一致；Chat 历史卡片仅只读展示名（改名后重进群聊 enrich 仍可对齐）。  
- **残留**：若在 Todos 改名，已加载的 Chat 本地消息中的 **`attachmentPreview.displayName`** 不会即时变，需依赖重载/重新拉历史。

**关联**  
- `vouchap-app/src/mobile-ui/app/chat-to-log.tsx`、`vouchap-app/src/mobile-ui/components/TaxFilingTodosView.tsx`

---

### 2026-04-07（Todos/订单直接上传：不写 chat 历史）

**User（提示词/原意）**  
- **直接 upload**（非聊天内提交）的文件，**不要出现在聊天记录**里。

**Assistant（实现前说明，若有）**  
- 直接上传路径在识别成功后调用 **`processTaxFilingAttachmentAfterCreate`**，其内 **`saveTaxFilingAttachmentChatLog`** 会向 **`ai_chat_logs`** 插入与聊天一致的 **`attachmentPreview`**，导致 Tina 历史里出现 Todos/订单上传。  
- 移除该写入；聊天内税表上传仍由 **`chat-to-log.tsx`** 内 **`saveChatLog`** 负责。删除仅被该链路引用的 **`tax-filing-chat-log.ts`**；**`processTaxFilingAttachmentAfterCreate`** 去掉已无用的 **`orderId`** 参数。

**Assistant（实现后说明 / 本轮结论）**  
- 已移除 **`saveTaxFilingAttachmentChatLog`** 调用并删除模块；调用方入参已更新。  
- **验证**：在 Todos 或订单页任务行上传 → 任务下列表有文件、识别正常 → 打开同项目聊天拉历史 → 无对应 **`attachmentPreview`** 新行；仅在聊天里上传仍有卡片与 **`saveChatLog`**。  
- **说明**：此前已写入的 **`ai_chat_logs`** 不会自动删除，仅影响新上传。

**关联**  
- `vouchap-app/src/shared-logic/tax-filing-attachment-followup.ts`、`TaxFilingTodosView.tsx`、`tax-filing/order/[orderId]/index.tsx`（已删 `tax-filing-chat-log.ts`）

---

### 2026-04-07（Todos 附件改名：原位输入框 + 悬停显铅笔）

**User（提示词/原意）**  
- 修改文件名的输入框要在**阅读状态文件名称的原位**；改名入口 icon 应像 **Todos 任务行**一样**鼠标悬停/触摸热区**出现，而非常显。

**Assistant（实现前说明，若有）**  
- 原文附件行使用固定宽度 **`fileRenameListInputWidthPx`** 的输入轨，与文件名槽位错位；铅笔始终渲染。  
- 改为：附件 **`TouchableOpacity`** 上 **`onMouseEnter` / `onMouseLeave`**（与任务标题相同的 **400ms** 延时清除，新建 **`hideFileRowHoverTimeoutRef` + `fileRowHoverKey`**）；仅当 **`fileRowHoverKey`** 匹配 **`todoId + attachmentId`** 时显示 **`create-outline`**，样式对齐任务 **`terminateTaskBtnHotzone`**。行内改名用 **`fileRenameInlineNameRow`**：`TextInput` **`flex:1` + `minWidth:0`** 占据原 **`fileRowName`** 槽位，右侧保留取消/确认。进入任务行内改名时清空附件 hover，避免状态串扰。

**Assistant（实现后说明 / 本轮结论）**  
- 已改于 **`TaxFilingTodosView.tsx`**（**`TodoTree`** 附件行 + 样式 + 父级 state/callback）；移除 **`fileRenameListInputWidthPx`** 附件改名用法。  
- **验证**（Web）：展开任务 → 不悬停时无铅笔 → 悬停该行出现铅笔 → 点击后输入框覆盖原文件名区域 → 保存后列表更新。  
- **限制**：与任务标题一致，**Web** 主要依赖鼠标悬停；纯触摸 Web 端无 hover 时行为与任务行铅笔一致。

**关联**  
- `vouchap-app/src/mobile-ui/components/TaxFilingTodosView.tsx`

---

### 2026-04-07（Todos：终止/恢复/提交类操作乐观更新）

**User（提示词/原意）**  
- Todos 上**终止 task、提交、撤回**等操作要**前端先出结果**，**后端异步写库**，避免点击后延迟像没点上。

**Assistant（实现前说明，若有）**  
- 原 **`TaxFilingTodosView`** 中 **`onCancelTask` / `onRestoreTask`** 与 **Handoff 浮窗确认** 均 **`await` 写库后再 `refreshTodosPreservingScroll`**，网络慢时 UI 不变。  
- 抽 **`cloneProjectTodoTree` + `patchProjectTodoInTree`**（**`shared-logic/project-todo-tree-patch.ts`**）。当存在 **`onMergeProjectTodosTree`** 时：先 **`onMergeProjectTodosTree(patch…)`** 乐观改 **`status` / `type`**，再 **fire-and-forget** **`updateProjectTodo` / `changeProjectTodoResponsibleSide`**；失败则用快照 **`onMergeProjectTodosTree(snapshot)`** 回滚并 **`alert`**。无 **`onMergeProjectTodosTree`** 时保持原 **`await` + 全量刷新**（父级未提供本地合并无法乐观）。订单页内嵌 **TodoTree** 同步：**`setTree` 乐观 + 异步写库 + 失败回滚**；成功后仅刷新 **attachments map**（与此前全量拉树相比减轻闪烁）。Handoff：**先关浮窗**再合并树，避免遮罩挡反馈。

**Assistant（实现后说明 / 本轮结论）**  
- 已落地于 **`project-todo-tree-patch.ts`**、**`TaxFilingTodosView.tsx`**、**`tax-filing/order/[orderId]/index.tsx`**。  
- **验证**：有 **`onMergeProjectTodosTree`** 的入口点击终止/恢复/Confirm submit → 列表立即变；断网或故意失败应回滚并弹错。  
- **残留**：成功路径依赖 **Realtime / 他端** 时仍可能二次刷新；无 merge 回调的挂载点仍为阻塞刷新。

**关联**  
- `vouchap-app/src/shared-logic/project-todo-tree-patch.ts`、`TaxFilingTodosView.tsx`、`tax-filing/order/[orderId]/index.tsx`

---

### 2026-04-07（Service Marketplace：确认浮窗右侧模板预览）

**User（提示词/原意）**  
- service marketplace 的 **Confirm your selection** 浮窗，**右侧**加上与列表一致的 **template 标准预览组件**。

**Assistant（实现前说明，若有）**  
- **`MarketplaceServiceSelectionModal`**：可选 **`templatePreviewItem`**（与网格相同的 **`ProjectListCardItem`**）；Web 且窗宽 ≥680 时 **两栏**：右侧 **Template preview** + 只读 **`ProjectListCard`**；窄屏/原生在 **高亮块与 Next steps 之间**插入同一预览。  
- **`service-catalog`**：用 **`firmSkuToProjectListItem(pendingMarketplaceSku, { firmFooter: true, forClientMarketplace: true })`** 传入，与目录卡一致。  
- 修复样式：`StyleSheet` 中误用未定义变量 **`previewAsideWidth`** 改为固定 **`width: 316`**。

**Assistant（实现后说明 / 本轮结论）**  
- 已接好 **`templatePreviewItem`**；catalog 侧 **`useMemo`** 映射 pending SKU。侧栏宽度字面量，**lint** 通过。  
- **验证**：打开 Service Marketplace → 选一项 → **Confirm** 浮窗：Web 宽屏右侧见与网格一致的 **`ProjectListCard`**；缩窄或移动端预览出现在高亮与步骤之间。

**关联**  
- `vouchap-app/src/mobile-ui/components/MarketplaceServiceSelectionModal.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/service-catalog.tsx`

---

### 2026-04-07（Service Marketplace 确认浮窗：对齐 Add client 布局 + SkuPreview）

**User（提示词/原意）**  
- 找已设计过的**标准 SKU 预览**；浮窗布局需**复用 Add client** 浮窗。

**Assistant（实现前说明，若有）**  
- 标准预览组件为 **`SkuPreview`**（Add client / engagements / invite 共用）；Add client 外壳为 **`CenterModal`** + **`FirmAddClientModal`** 内 **`addClientFormRow`** 双栏（左滚动表单区、右 **`Service preview`** + **`SkuPreview`**）。  
- 将 **`MarketplaceServiceSelectionModal`** 改为同一 **`CenterModal`** 尺寸（**`maxWidth={840}` `cardHeight={660}`**）、同款双栏样式与右侧 **`SkuPreview`**；入参由 **`templatePreviewItem`** 改为 **`previewSku: FirmSku`**（catalog 传 **`pendingMarketplaceSku`**）。  
- 左侧保留确认文案 + Firm/Service 高亮 + Next steps；底部按钮样式对齐 Add client（**`flex: 1` / `flex: 1.618`**）。列表符号改为 **•**。

**Assistant（实现后说明 / 本轮结论）**  
- 已替换实现并完成 catalog 传参；**lint** 无报错。  
- **验证**：打开确认浮窗 → 外观与 Add client 一致（大圆角卡片、双栏、右侧文档树预览）；**Continue** 进入 consent 流程不变。

**关联**  
- `MarketplaceServiceSelectionModal.tsx`、`service-catalog.tsx`；参照 `FirmAddClientModal.tsx`、`SkuPreview.tsx`、`CenterModal.tsx`

---

### 2026-04-07（Marketplace 确认浮窗：修正按钮相对 SkuPreview 下缘偏高/偏低）

**User（提示词/原意）**  
- 按钮仍**太靠下**，与预览组件下缘**没对齐**。

**Assistant（实现前说明，若有）**  
- 根因：**`formRow` / 左栏用了 `minHeight`**，左栏（文案 + 步骤 + 按钮）**内容高度常大于** 右侧「标题 + 560 预览」，行高由左栏**撑开**；右栏 **`stretch`** 后在 **`SkuPreview` 下方出现空白**，按钮贴着**行底**就会落在预览卡**下缘之下**。  
- 处理：双栏行改为**固定 `height: 560 + lineHeight(18) + marginBottom(8)`**，与 `previewTitle` 的 **`lineHeight` / `marginBottom` 常量一致**；去掉会在视觉上把按钮再往下推的 **`btnRow.paddingTop`**。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`MarketplaceServiceSelectionModal.tsx`**。

---

### 2026-04-07（Marketplace 确认浮窗：Cancel/Continue 与 SkuPreview 下缘对齐）

**User（提示词/原意）**  
- **Cancel / Continue** 按钮**下缘**与**预览组件下缘**对齐。

**Assistant（实现前说明，若有）**  
- 原先按钮在左侧 **`ScrollView`** 内且左栏 **`maxHeight: 560`**，与右侧「**Service preview** + 560 卡片」总高不一致。  
- 改为左侧 **`leftPane`**：`minHeight` = 与右栏相同的 **`PREVIEW_COLUMN_HEIGHT`**（**560 + 标题区**），**`ScrollView` `flex:1`** 仅承载说明与高亮、Next steps；**`btnRow` 移出 Scroll** 置于列底；双栏 **`alignItems: stretch`**。占位预览 **`minHeight/maxHeight`** 与卡片高一致。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`MarketplaceServiceSelectionModal.tsx`**；静态检查通过。  
- **验证**：打开确认浮窗 — 右栏卡片底与左栏按钮底同一水平线；左栏正文过长时仅中间区域滚动。

---

### 2026-04-08（Engagement Todos 操作行：隐藏 0 文件 / 隐藏 canceled）

**User（提示词/原意）**  
- engagement 的 todos 列表页，在操作行（Todos/Info 页签、Terminate 等所在行），与文件计数列、状态标签列对齐位置增加复选框：**隐藏 0 文件**、**隐藏 canceled**（产品 UI 文案英文）。

**Assistant（实现前说明，若有）**  
- 在 **`ProjectDetailView`** 的 **`operationBar`** 内增加两枚筛选（`Pressable` + `Ionicons`），右对齐以贴近列表右侧「文件列 / 状态列」；列宽取自 **`TaxFilingTodosView`** 内与 `progressFilesCol`、`statusCol` 一致的导出常量 **`ENGAGEMENT_TODO_TOOLBAR_FILTER_LAYOUT`**。  
- 在 **`TaxFilingTodosView`** 增加可选 props **`hideTasksWithNoFiles` / `hideCanceledTasks`**，对 **`itemKind === 'task'`** 递归过滤树（无附件视为 `taskFilesMap[id]` 长度 0；**`status === 'canceled'`**）；空 phase/section 连带移除；与 Web 拖放预览树同一套源树再过滤；catalog 模式不启用。

**Assistant（实现后说明 / 本轮结论）**  
- 已实现：`ProjectDetailView.tsx`（状态 + 操作行 UI + 传参）、`TaxFilingTodosView.tsx`（导出布局常量、**`filterProjectTodoTreeForListDisplay`**、**`displayListTree`**、筛选后无行时提示 **「No tasks match the current filters.」**）。  
- **验证**：Firm engagement / client project 详情、Todos 页签、有真实任务树时，勾选后列表仅隐藏对应 task；全被筛掉时出现提示文案；onboarding SKU 只读 catalog 树不显示筛选。  
- **已知限制**：移动端下列宽为紧凑近似值，与列表右侧列像素级对齐可能略差于 Web。

**关联**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`、`TaxFilingTodosView.tsx`

---

### 2026-04-08（Engagement Todos 筛选条与列表列水平对齐修正）

**User（提示词/原意）**  
- 复选框位置太靠右，与文件列/状态列未对齐。

**Assistant（实现前说明，若有）**  
- 原实现把筛选放在 `operationBarMain` 内 `flex-end`，会贴在 Web **Terminate** 或移动端 **状态 pill** 左侧，与列表右侧列（相对 Scroll 16 + `treeRow.paddingRight`）不一致。  
- 改为：`operationBar` `position: 'relative'`，筛选 **`absolute`**，`right` 仅用 **`treeRow` 的 `paddingRight`**（与 `operationBar` 已有 16 内边距衔接）；Web **`operationRight`**、移动端 **pill** 在显示筛选时预留 **`fileCol + gap + statusCol`** 宽度，避免遮挡。

**Assistant（实现后说明 / 本轮结论）**  
- 已调整：`ENGAGEMENT_TODO_LIST_ALIGNED_RIGHT_INSET` 改为 12（Web）/ 4（原生）；`ProjectDetailView` 去掉流式筛选区、改为绝对层 + 预留边距。

**关联**  
- 同上两文件

---

### 2026-04-08（筛选条 right  inset 修正：16 + treeRow padding）

**User（提示词/原意）**  
- 筛选跑到最右端，比刚才更不对齐。

**Assistant（实现后说明 / 本轮结论）**  
- **原因**：绝对定位的 `right` 相对 `operationBar` **外缘**计量时，仅用 `treeRow.paddingRight`（12/4）会少算与列表一致的 **16**（与 `scrollContent` / bar 相同的横向 padding），筛选项会多靠右约 16px。  
- **处理**：`ENGAGEMENT_TODO_LIST_ALIGNED_RIGHT_INSET` 恢复为 **`16 + (web ? 12 : 4)`**，并同步 **`components/`** 与 **`src/mobile-ui/components/`** 两份 `TaxFilingTodosView.tsx`（仓库内双份实现）。

**关联**  
- `TaxFilingTodosView.tsx`（两处）

---

### 2026-04-08（Todos 筛选：操作行中部 + 不挤占 Terminate + 缩小字号）

**User（提示词/原意）**  
- 筛选仍在 Terminate 右侧，应在**该行中部**；**不影响**右端按钮位置；**字号略小**。

**Assistant（实现后说明 / 本轮结论）**  
- **`ProjectDetailView`**：操作行改为三段 — **左** Todos/Info、`flex:1` **居中**筛选、`flexShrink:0` **右** 状态 pill（移动）或 Web **operationRight**；去掉绝对定位及对 `operationRight` / pill 的 `marginRight` 预留。  
- 筛选：**Ionicons 16**，文案 **Web 10 / 原生 8** `pt`；项间 `todoFilterBetween`；`todoFilterCheck` 使用 `maxWidth: '48%'` 防窄屏溢出。  
- 移除不再使用的 **`ENGAGEMENT_TODO_*` 导出**（`components/TaxFilingTodosView.tsx`；`src/mobile-ui` 副本已无该段）。

**关联**  
- `components/ProjectDetailView.tsx`、`components/TaxFilingTodosView.tsx`（及同步的 `src/mobile-ui/components/ProjectDetailView.tsx`）

---

### 2026-04-08（Todos 筛选文案单行）

**User（提示词/原意）**  
- 位置可以；**文案不要换行**。

**Assistant（实现后说明 / 本轮结论）**  
- `ProjectDetailView` 筛选 `Text`：`numberOfLines={1}`、`ellipsizeMode="tail"`；`todoFilterCheckRow` `flexWrap: 'nowrap'`；`todoFilterCheck` / `todoFilterCheckText` `flexShrink: 1`、`minWidth: 0` 以便极窄时单行省略而非折行。

**关联**  
- `components/ProjectDetailView.tsx`、`src/mobile-ui/components/ProjectDetailView.tsx`

---

### 2026-04-08（Tina 附件 display_name：简明、与 summary 解耦）

**User（提示词/原意）**  
- Tina 识别的文件名此前要更完整可读，现在过于啰嗦，和文件描述一样；要**简明但仍完整可读**。

**Assistant（实现前说明，若有）**  
- 原逻辑用 `summary` 首行 + 文件名拼 `head — tail`，标题与 `summary` 字段大量重复。  
- 改为：`buildTaxFilingAttachmentDefaultDisplayName` 以 **`docType` 可读标签**为主；**优先**非泛化**原始文件名 stem**；仅在 IMG_/DSC_ 等泛化名时用 **summary 的短片段**（首句或截断至 ~36 字），整体 cap **~68** 字符；去掉与 type 重复的 tail。

**Assistant（实现后说明 / 本轮结论）**  
- 已重写 **`vouchap-app/src/shared-logic/tax-filing-attachment-display-name.ts`**。  
- **验证**：新识别附件列表标题应短于描述；仍含类型 + 可辨片语。

**关联**  
- 调用方：`tax-filing-attachment-followup.ts`、`chat-to-log.tsx`、`TaxFilingTodosView.tsx`、`firm.ts`（通过同一函数）

---

### 2026-04-08（Tina display_name：优先摘要可读短语）

**User（提示词/原意）**  
- 上一版简化过度；示例应显示为 **「Prescription receipt from Greencrest Pharmacy」** 一类，而非 **EXPENSE RECEIPT · 1000092341**。

**Assistant（实现后说明 / 本轮结论）**  
- 更新 **`tax-filing-attachment-display-name.ts`**：有 `summary` 时优先 **`readablePhraseFromSummary`**（去 *This is a…* 前缀、在 **「 for 」** 前截断、可再按首句 `. ` 截断），再句首大写；总长 cap **68**。纯数字/仅数字文件名视为泛化，不再与 doc_type 拼成标题。无可用摘要短语时回退 **doc_type · 文件名 / 短摘要片段**。

**关联**  
- `src/shared-logic/tax-filing-attachment-display-name.ts`

---

### 2026-04-08（附件卡片：避免与标题重复的summary + 通用去前缀）

**User（提示词/原意）**  
- 反对靠穷举规则的生硬字符截断；举例：标题与灰字 summary 开头重复，且 ellipsis 落在词中间（如 *Decemb…*）。

**Assistant（实现前说明，若有）**  
- 标题侧：用**一条通用正则**覆盖 *This …（中间 1–4 个词）… is a/an/the …*，与现有 *This is a…* 并列，减少「This document is a …」未剥离问题。  
- 卡片第二行：新增 **`taxFilingAttachmentCardSubtitleSummary`**，优先展示 **「 for 」之后**的补充信息（与标题上「 for 」前短语对齐），否则尝试去掉与 `cardTitle` 相同前缀，全重复则**不展示**第二行。  
- UI：`numberOfLines` 放宽、`ellipsizeMode="tail"`，由平台处理省略。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`vouchap-app/src/shared-logic/tax-filing-attachment-display-name.ts`**（`stripBoilerplatePrefixes`、`taxFilingAttachmentCardSubtitleSummary` 导出）；**`vouchap-app/src/mobile-ui/app/chat-to-log.tsx`** 附件预览卡用统一 `attachmentCardTitle` / `attachmentCardSubtitle`。  
- **验证**：tax filing 聊天中带 *… report for GAO…* 的摘要：标题应接近 *Diagnostic imaging report*，副标题以 *GAO,…* 起头且无整句重复；极长仍可能 tail 省略但不再人为 slice。  
- **限制**：无 *for* 且标题与 summary 结构不一致时，仍可能显示完整 summary；`ellipsizeMode` 在部分平台仍可能非严格词边界。

**关联**  
- `src/shared-logic/tax-filing-attachment-display-name.ts`、`src/mobile-ui/app/chat-to-log.tsx`

---

### 2026-04-08（报税识别提示词：summary 产出规则）

**User（提示词/原意）**  
- 应从模型侧优化提示词，让返回内容按合适规则生成（而非仅靠前端修修补补）。

**Assistant（实现前说明，若有）**  
- 在 **`tax-filing-recognition-prompt.ts`** 的 `BASE_SYSTEM_PROMPT` 增加独立 **# Summary field** 段：英文 only、禁止 *This document is…* 类套话、主体优先句式、一至两句、非税类附件同样规则；同步更新 JSON schema 示例里的 `summary` 说明。

**Assistant（实现后说明 / 本轮结论）**  
- 已更新 **`vouchap-app/src/shared-logic/tax-filing-recognition-prompt.ts`**。  
- **验证**：新跑 `runTaxFilingRecognition` / 上传附件识别后，`summary` 应以表单/报告类型直起句，少见与列表标题整段重复；已有历史行不受迁移影响。

**关联**  
- `src/shared-logic/tax-filing-recognition-prompt.ts`

---

### 2026-04-08（aim.link 旧栈架构梳理 + v2 新仓库初始化）

**User（提示词/原意）**  
- workspace 中 `aim.link` 约 23 个子项目，需从代码梳理原软件整体功能架构，以便在架构上精简剔除；新栈：后端与数据库 Supabase，Web 部署 Cloudflare，App 为 Expo 原生 React；全新 git 项目 `aim.link(v2)`，不改动现有 5 个 workspace 项目；Supabase 上已建新项目 aim.link。

**Assistant（实现前说明，若有）**  
- 浏览 `/Users/macbook/aim.link` 顶层目录与关键 `package.xml`/`pom.yml`，归纳：中台微服务 + 多只读 SaaS 业务服务 + 三套前端（PC、独立登录站、Expo）+ CRM（Blade）+ 脚本与 Maven 依赖仓；不在旧仓库内改代码。  
- 在 `/Users/macbook/aim.link-v2`（目录名避免括号）执行 `git init` 与最小 README + `.gitignore` 的首 commit，与现有 Vouchap 等仓库隔离。

**Assistant（实现后说明 / 本轮结论）**  
- 交付：对用户的中文答复中含**旧栈功能架构图式说明**与 **v2 目标部署对照**；新建 **`/Users/macbook/aim.link-v2`**（`main` 分支，首提交仅为脚手架）。  
- **验证**：`cd /Users/macbook/aim.link-v2 && git log -1 --oneline`；未触碰 `aim.link`、`aim-link-website` 等现有仓库工作区。  
- **残留**：v2 尚未添加 `app/`、`web/`、`supabase/migrations`；需在 Supabase Dashboard 绑定本地 CLI 与远程后再补。

**关联**  
- 旧代码库：`/Users/macbook/aim.link`；新仓库：`/Users/macbook/aim.link-v2`

---

### 2026-04-09（receipt item 拆分税改为异步，不阻塞识别与落库）

**User（提示词/原意）**  
- `vouchap` 项目近期增加的 item 拆分税影响了 item 本身识别和落库，要求核查优化；拆分税必须采用异步方式，不能影响既有 receipts/items 的识别记录过程。

**Assistant（实现前说明，若有）**  
- 排查 `vouchap-app/src/shared-logic/database.ts`、`receipt-processor.ts`、`receipt-item-tax.ts` 后确认：`saveReceipt` / `updateReceipt` 中同步 `await applyReceiptItemTaxesAndReconcile(...)` 会把税拆分链路耦合进主事务流程。  
- 计划将税拆分改为“主数据提交后后台异步执行（microtask）+ 全量异常兜底”，确保 receipts 与 items 识别/保存路径不被拆分税阻断。

**Assistant（实现后说明 / 本轮结论）**  
- 已在 `vouchap-app/src/shared-logic/database.ts` 新增 `runReceiptItemTaxAsync(...)`：使用 `queueMicrotask`（降级 `setTimeout(0)`）异步触发 `applyReceiptItemTaxesAndReconcile` 与 `scheduleReceiptTaxRecalcIfNeeded`，并在内部捕获异常，仅记录 warning。  
- `saveReceipt` 与 `updateReceipt` 已改为调用该异步入口，不再同步等待税拆分计算。  
- 结果：receipt 主记录与 receipt_items 的识别/落库流程与拆分税解耦；即使拆分税失败也不会反向影响主流程。

**关联**  
- `vouchap-app/src/shared-logic/database.ts`

---

### 2026-04-09（移动端上传误报 failed + 单行小票 item 兜底）

**User（提示词/原意）**  
- 移动端上传图片会提示 failed，但列表里又有识别结果；且同一小票反复识别不出唯一一行 item。

**Assistant（实现前说明，若有）**  
- 排查 `receipts.tsx` 上传链路后，发现上传后立即刷新列表的 `loadReceipts` 若瞬时查询失败会弹 `Failed to load expenses`，容易被误解为上传失败。  
- 排查 `receipt-helpers.ts` 后，发现 `convertGeminiResultToReceipt` 对空/弱结构 items 容错不足，可能出现“识别结果存在但落库无 item”。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/app/receipts.tsx`：为 `loadReceipts` 增加 `silentError` 参数；在上传后两次自动刷新（创建占位记录后、后台识别完成后）使用静默模式，避免误报 toast 干扰用户。  
- `vouchap-app/src/shared-logic/receipt-helpers.ts`：新增 `fallbackExpenseItemPrice`；当模型未返回 items 或为空时自动注入一条 `Receipt total (merged)`；同时对 `categoryName` 增加兜底来源（`categoryName -> name -> description -> Other`），并在映射后仍为空时再补一条默认 item。  
- 结果：上传后“失败提示但实际已入库”的误导显著降低；单行小票在模型漏提 item 时仍可稳定落一条 item。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipts.tsx`  
- `vouchap-app/src/shared-logic/receipt-helpers.ts`

---

### 2026-04-09（手动新增 item 保存失败：疑似 Supabase 迁移未完整应用）

**User（提示词/原意）**  
- 手动在小票里自行添加 item 也保存失败，怀疑是 Supabase 迁移问题。

**Assistant（实现前说明，若有）**  
- 重点排查 `receipt_items` 相关迁移、触发器函数与前端保存路径，确认是否存在“列已改名但触发器仍引用旧列”的线上漂移。

**Assistant（实现后说明 / 本轮结论）**  
- 高概率根因定位为：`receipt_items` 从 `purpose_id` 改到 `attribution_id` 后，若线上未应用 `20260405120000_receipt_items_usage_trigger_use_attribution_id.sql`，触发器函数 `update_usage_counts_on_item_change` 仍引用旧列，会导致 item 保存时报错。  
- 已给出建议：在 Supabase 先执行函数定义核查，再执行该迁移（或直接执行函数替换 SQL）恢复。

**关联**  
- `vouchap-app/supabase/migrations/20260403180000_rename_line_item_purpose_id_to_attribution_id.sql`  
- `vouchap-app/supabase/migrations/20260405120000_receipt_items_usage_trigger_use_attribution_id.sql`

---

### 2026-04-09（跟进诊断结果：usage trigger 已正确，继续排查其余 DB 依赖）

**User（提示词/原意）**  
- 返回了 SQL 诊断结果：`update_usage_counts_on_item_change` 函数体已使用 `attribution_id`，无旧 `purpose_id` 引用。

**Assistant（实现后说明 / 本轮结论）**  
- 已排除该函数为根因；下一步聚焦：  
  1) 其它触发器/函数是否仍引用 `purpose_id`；  
  2) `receipt_items` 是否有额外约束（如名称非空白 check）与前端新增空名称 item 冲突；  
  3) RLS / FK 在 `UPDATE receipts` -> 重建 `receipt_items` 这一路径上的实际报错点。  
- 已建议用户执行一键巡检 SQL 获取精确失败点，再给出定向修复。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipt-details/[id].tsx`  
- `vouchap-app/src/shared-logic/database.ts`

---

### 2026-04-09（用户要求 SQL 落文件，便于执行与倒查）

**User（提示词/原意）**  
- 不要在对话里散贴 SQL，要求把要执行的 SQL 落到文件，后续便于复用和回溯。

**Assistant（实现后说明 / 本轮结论）**  
- 已新增 SQL 脚本文件：`vouchap-app/supabase/receipt-items-save-failure-diagnose-and-fix.sql`。  
- 内容包含三部分：  
  1) `receipt_items`/触发器/约束/函数残留 `purpose_id` 诊断；  
  2) 缺失 `categories.usage_count`、`attributions.usage_count` 的修复；  
  3) `usage_count` 回填（可选）。

**关联**  
- `vouchap-app/supabase/receipt-items-save-failure-diagnose-and-fix.sql`

---

### 2026-04-09（修复 SQL 脚本 42809：array_agg aggregate 报错）

**User（提示词/原意）**  
- 执行 SQL 脚本仍报：`ERROR: 42809: "array_agg" is an aggregate function`。

**Assistant（实现后说明 / 本轮结论）**  
- 已修复 `vouchap-app/supabase/receipt-items-save-failure-diagnose-and-fix.sql` 中函数扫描段：  
  - 对 `pg_proc` 增加 `p.prokind in ('f','p')` 过滤，仅扫描普通函数/过程；  
  - 避免对 aggregate/window 对象调用 `pg_get_functiondef` 引发 42809。  
- 现在可重新执行脚本，不应再在该位置触发 `array_agg` 报错。

**关联**  
- `vouchap-app/supabase/receipt-items-save-failure-diagnose-and-fix.sql`

---

### 2026-04-09（发现残留函数 update_all_purpose_usage_counts，补兼容修复）

**User（提示词/原意）**  
- 诊断结果返回残留函数：`public.update_all_purpose_usage_counts`。

**Assistant（实现后说明 / 本轮结论）**  
- 已在 `vouchap-app/supabase/receipt-items-save-failure-diagnose-and-fix.sql` 增加兼容修复段：  
  - `CREATE OR REPLACE FUNCTION public.update_all_purpose_usage_counts()`；  
  - 逻辑改为基于 `receipt_items.attribution_id` 回填 `attributions.usage_count`，避免旧语义函数残留影响。  
- 这样即便线上仍有旧函数名调用，也不会再依赖 legacy `purposes/purpose_id`。

**关联**  
- `vouchap-app/supabase/receipt-items-save-failure-diagnose-and-fix.sql`

---

### 2026-04-09（usage_count 已存在后的兜底修复：新增 item 名称非空）

**User（提示词/原意）**  
- 诊断结果显示 `attributions.usage_count` 与 `categories.usage_count` 均已存在，继续定位新增 item 保存失败。

**Assistant（实现后说明 / 本轮结论）**  
- 结合前端与落库逻辑，补充“名称非空”防御，规避环境中可能存在的空白名称约束导致保存失败：  
  - `vouchap-app/src/mobile-ui/app/receipt-details/[id].tsx`：新增 item 默认名由空字符串改为 `Receipt item`。  
  - `vouchap-app/src/shared-logic/database.ts`：新增 `normalizeReceiptItemNameForSave`，在 `saveReceipt` / `updateReceipt` 写入 `receipt_items` 时统一将空白名称兜底为 `Receipt item`。  
- 已通过相关文件 lint 检查。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipt-details/[id].tsx`  
- `vouchap-app/src/shared-logic/database.ts`

---

### 2026-04-09（老 app 拍照/文档识别无法落库 items：图片路径缺 items 兜底）

**User（提示词/原意）**  
- 老的 app 不能识别、不能落库 items；要求检查并修复。

**Assistant（实现前说明，若有）**  
- 对照 `recognizeReceipt`（图片）与 `recognizeReceiptFromText`：`JSON.parse` 后直接对 `parsedResult.items` 做 `reduce`/`map`，若模型省略 `items` 或非数组/空数组会抛错，整轮识别失败则无法进入 `convertGeminiResultToReceipt` 与 `saveReceipt`。文字路径已有兜底，图片/文档路径缺失，表现为「老流程（拍照为主）」更易失败。  
- `saveReceipt` 在缺 `categoryId` 时用 `item.name` 去 `findCategoryByName`，易把商品名当成分类名，与分类解析不一致；改为优先 `item.category?.name` / `categoryName`。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/shared-logic/gemini.ts`：新增 `ensureGeminiParsedReceiptItems`，在 `recognizeReceipt` 与 `recognizeReceiptFromDocument` 中于 `reduce`/`map` 之前调用，与文字路径一致至少合成一行（`General Purchase` + 默认分类/用途 + `max(0, totalAmount - tax)`）。  
- `vouchap-app/src/shared-logic/database.ts`：`saveReceipt` 分类兜底查找改为 `categoryNameHint`（category 名 / categoryName），不再误用商品名。  
- 验证建议：用拍照上传一张小票，或构造模型返回无 `items` 的 JSON（若可），应不再整单报错；保存后 `receipt_items` 至少一行。

**关联**  
- `vouchap-app/src/shared-logic/gemini.ts`  
- `vouchap-app/src/shared-logic/database.ts`

---

### 2026-04-09（撤回 purpose_id 兼容迁移；问题域更正为行税拆分后）

**User（提示词/原意）**  
- 撤回上一步；现在不是 attribution 兼容问题，app 是改为 attribution 之后构建的；问题是在开发拆分 items 税额之后出现的。

**Assistant（实现后说明 / 本轮结论）**  
- 已删除迁移 `20260413120000_receipt_items_legacy_purpose_id_compat.sql`；已从 `receipt-items-save-failure-diagnose-and-fix.sql` 移除 Part D（purpose_id/attribution 兼容说明）。  
- 与用户结论对齐：后续应聚焦「拆分 items 税额」相关（应用侧如 `receipt-item-tax` / `applyReceiptItemTaxesAndReconcile`、库侧如 `receipt_item_taxes` 与相关迁移/RLS/触发器），而非 purpose_id 列兼容。

**关联**  
- （撤回）`20260413120000_receipt_items_legacy_purpose_id_compat.sql`、诊断脚本 Part D

---

### 2026-04-10（logo2 商店图标 / logo3 应用内与网站）

**User（提示词/原意）**  
- `assets` 下增加 `logo2`、`logo3` 两个 PNG：`logo2` 用于构建 app 的市场图标；`logo3` 用于应用内和网站各处展示图标。

**Assistant（实现后说明 / 本轮结论）**  
- 将 `Vouchap/assets/logo2.png`、`logo3.png` 复制入 `vouchap-app/src/mobile-ui/assets/`（经 `assets` 符号链接供 Metro 打包）。  
- `vouchap-app/app.config.js`：`expo.icon`、`android.adaptiveIcon.foregroundImage` → `logo2.png`；`expo.web.favicon` → `logo3.png`。  
- 应用内原 `icon.png` 引用改为 `logo3.png`（`WebSidebar`、`login`、`register`、`reset-password`、`set-password`、`setup-space`）。  
- `vouchap-website`：`public/logo3.png`，`layout.tsx` / `Navbar` / `client-join` / `auth/confirm` 中 `/logo.png` 改为 `/logo3.png`。  
- 更新 `vouchap-app/src/mobile-ui/assets/README.md` 与 `Vouchap/assets/README.md` 说明同步方式。  
- 验证：改图标后执行 `npx expo prebuild` 或完整原生构建以刷新商店图标；网站与 Web favicon 以 `public/logo3.png` 为准。

**关联**  
- `vouchap-app/app.config.js`、`vouchap-app/src/mobile-ui/assets/logo2.png`、`logo3.png`  
- `vouchap-website/public/logo3.png`

---

### 2026-04-10（logo3 文件更新后同步到 app / 网站）

**User（提示词/原意）**  
- logo3 文件更新了一下，各处更新。

**Assistant（实现后说明 / 本轮结论）**  
- 无代码变更；自 `Vouchap/assets/logo3.png` 覆盖复制至 `vouchap-app/src/mobile-ui/assets/logo3.png` 与 `vouchap-website/public/logo3.png`。  
- 验证：Expo 可 `-c` 清缓存重载；Next 站若 CDN 缓存 favicon 需硬刷新或等失效。

---

### 2026-04-10（仅 Web 左侧栏用 logo3，其余用 logo.png）

**User（提示词/原意）**  
- 应用内和网站内，除了 web 端左侧栏用 logo3，其余各处仍用 logo.png 比较合适。

**Assistant（实现后说明 / 本轮结论）**  
- `WebSidebar.tsx` 保留 `logo3.png`；登录/注册/重置密码、setup-space、Expo `web.favicon` 改回 `logo.png`；营销站 `layout` / `Navbar` / `client-join` / `auth/confirm` 改回 `/logo.png`。  
- 自 `vouchap-website/public/logo.png` 复制入 `vouchap-app/src/mobile-ui/assets/logo.png` 与 `Vouchap/assets/logo.png` 以便打包。  
- 已更新 `vouchap-app/src/mobile-ui/assets/README.md` 与 `Vouchap/assets/README.md` 说明分工。

**关联**  
- `vouchap-app/app.config.js`、`vouchap-app/src/mobile-ui/components/WebSidebar.tsx`  
- `vouchap-website/app/layout.tsx`、`components/Navbar.tsx` 等

---

### 2026-04-10（Web 左侧栏字标上移 + 黑金色）

**User（提示词/原意）**  
- web 端左侧栏 logo 下方的 Vouchap，位置上移与 logo 靠近，更换成跟 logo 一样风格的黑金色。

**Assistant（实现后说明 / 本轮结论）**  
- `WebSidebar.tsx`：缩小品牌区与字标间距（`marginTop: -8`、`logoImage` 轻微负下边距、略收 `mainNavSection` 上边距）；字标拆为「Vouch」`#0D0D0D` +「ap」金属金 `#C9A24D`，Poppins 字重 700，金色段加轻 `textShadow` 贴近黑金质感。

**关联**  
- `vouchap-app/src/mobile-ui/components/WebSidebar.tsx`

---

### 2026-04-10（侧栏字标 Poppins 加粗至 900）

**User（提示词/原意）**  
- 字体需进一步加粗。

**Assistant（实现后说明 / 本轮结论）**  
- `WebSidebar` 品牌字 `fontWeight` 由 `700` 改为 `900`；`_layout.tsx` 中 Google Fonts 由仅 `wght@700` 改为 `700;900`，并 `document.fonts.load('900 25px Poppins')` 与字标字号一致。

**关联**  
- `vouchap-app/src/mobile-ui/components/WebSidebar.tsx`、`vouchap-app/src/mobile-ui/app/_layout.tsx`

---

### 2026-04-10（字标改为黑色金边，非分段配色）

**User（提示词/原意）**  
- 黑色金边，而不是部分黑色部分金色。

**Assistant（实现后说明 / 本轮结论）**  
- `WebSidebar.tsx`：整词「Vouchap」统一为填充 `#0D0D0D`，Web 端使用 `WebkitTextStroke: 1.25px #C9A24D` + `WebkitTextFillColor: #0D0D0D` 实现金边黑字；去掉 Vouch/ap 分段。

**关联**  
- `vouchap-app/src/mobile-ui/components/WebSidebar.tsx`

---

### 2026-04-09（ExpoDocumentPicker 原生模块未找到：懒加载 + app.config 插件）

**User（提示词/原意）**  
- 终端报错：`Cannot find native module 'ExpoDocumentPicker'`，栈指向 `TaxFilingTodosView.tsx` 对 `expo-document-picker` 的 import。

**Assistant（实现前说明，若有）**  
- 依赖已在 package.json 时，顶层 import 会在模块加载时绑定原生桥；当前运行的 Android 二进制（Expo Go 与 SDK 不匹配或 dev client 未包含该模块）会整屏崩溃。  
- 改为按需 `import('expo-document-picker')` 通过封装 `pickTaxFilingDocument`，避免进入含 TaxFilingTodosView 的路由即崩；并在 `app.config.js` 增加 `expo-document-picker` 插件，便于 `prebuild`/`run:android` 正确链接。彻底修复需本地重建原生：`npx expo run:android`（或 iOS）。

**Assistant（实现后说明 / 本轮结论）**  
- 新增 `pickTaxFilingDocument` 封装；`TaxFilingTodosView.tsx` 与 `tax-filing/order/[orderId]/index.tsx` 改为调用之。  
- `app.config.js` 的 `plugins` 增加 `"expo-document-picker"`。  
- **更正路径**：`@/lib/*` 在 tsconfig 中映射到 `src/shared-logic/*`，实现文件须在 `src/shared-logic/tax-filing-document-picker.ts`（非 `mobile-ui/lib`），否则 Metro 报 SHA-1 / 找不到文件。

**关联**  
- `vouchap-app/src/shared-logic/tax-filing-document-picker.ts`  
- `vouchap-app/app.config.js`  
- `vouchap-app/src/mobile-ui/components/TaxFilingTodosView.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/index.tsx`

---
