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
