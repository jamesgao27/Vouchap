# PRD / 工程对话溯源日志（用户提示词 × 助手说明）

> **用途**：作为**单一累积文档**：  
> 1）**全部有实质内容的用户提示词**（**含与 PRD 无关**的排错、重构、脚本、环境等）；  
> 2）助手在本轮中的说明，尤其 **实现代码前**（意图、假设、将动哪些文件）与 **实现代码后**（具体改动、验证方式、风险）。  
> 正式 PRD 仍以 `docs/PRD-Vouchap-Platform-And-Marketing-Site.md` 为准；本文件是「原声 + 当时怎么说清楚」的全量素材库。  
> **维护规则**：**`.cursor/rules/prd-source-log.mdc`**（`alwaysApply`）。助手须**写入文件**，不得只口头承诺。

---

### 2026-05-01（vouchap-website：Showcase 合并主题为一张 · 四构图版本 A–D）

**User（提示词/原意）**  
- 前述**两个内容重点合并在一张**，出**三四个版本**。**文字精简**，**图片需密切联系内容主题**。

**Assistant（实现前说明）**  
- **`ShowcaseSlides.tsx`**：共用常量 **`MERGED.head` / `MERGED.sub`**（一句标题 + 一句副文案）；**四屏 scroll-snap**，构图分别为：**A** 数据条 + Insights / Collaboration / Expenses（TAM+AI 证据）；**B** 左文案+芯片 + 大 engagement + 底栏 CRM·Portal·Catalog·Marketplace；**C** 双大 AI 屏 + 底四格迷你数据；**D** 顶精简标题 + **2×2** 四宫格（协作/意图/需求侧/规模化）。  
- 更新 **`app/showcase/page.tsx`** metadata。

**Assistant（实现后说明 / 本轮结论）**  
- 已实现；**`npm run build`** 通过。

**关联**  
- `vouchap-website/components/ShowcaseSlides.tsx`、`vouchap-website/app/showcase/page.tsx`

### 2026-05-01（vouchap-website：Showcase 重做 — 仅两幅海报：底座协作 vs AI+市场）

**User（提示词/原意）**  
- Showcase **越做越差**，需兼顾**构图与主题**；**必要时多张图**。集中精力：**①** 基于 **aim.link** 基础架构，**Vouchap** 垂直用于 **firm 与 client** 协作落地；**②** **AI** 服务最后一公里，**税务服务市场规模**很大。

**Assistant（实现前说明）**  
- 将 **`ShowcaseSlides.tsx`** 从五屏收束为 **两幅 16:9 海报**（scroll-snap）。  
- **Poster 1**：左栏文案（aim.link 底座 → Vouchap 税务垂直、低边际、双方便利）+ 右栏 **1 大 3 小** 构图：主图 **engagement**，三缩略 **Clients / Portal / Service catalog** 并加短标注。  
- **Poster 2**：**AI 最后一公里** 与 **TAM 数据**同屏：上段主文案、**四格数据**、下 **双图**（tax collaboration + expenses）+ 图注。  
- 更新 **`app/showcase/page.tsx`** metadata。

**Assistant（实现后说明 / 本轮结论）**  
- 已替换实现；**`npm run build`** 通过。

**关联**  
- `vouchap-website/components/ShowcaseSlides.tsx`、`vouchap-website/app/showcase/page.tsx`

### 2026-05-01（vouchap-website：营销截图「发糊」—`unoptimized` + `images.deviceSizes`）

**User（提示词/原意）**  
- 提供的图片分辨率很高，**为何网站上全是模糊的**？

**Assistant（实现前说明）**  
- 根因通常有三：**①** Next.js `Image` 默认经 Sharp 缩图并转 WebP（`quality` 默认 75），细文字易糊；**②** 仓库内 `web_*.png` 曾测得约 **1024px 宽**，在 **2× Retina** 上铺满栏宽时像素不足；**③** `sizes` 过小会拉更小的衍生图。  
- 拟新增 **`lib/screenshotImage.ts`**（`unoptimized: true`）供 **Hero / Firm invite / Tax pains / Marketplace / Showcase 配图** 使用，**跳过优化管线**直出 `public` PNG；**`next.config.mjs`** 放宽 **`images.deviceSizes`**。并在日志中说明：若需极锐，**源图需约 2× 展示 CSS 宽度**（如 1920–2400px 宽）并覆盖 `public` 文件。

**Assistant（实现后说明 / 本轮结论）**  
- 已落地；**`npm run build`** 通过。

**关联**  
- `vouchap-website/lib/screenshotImage.ts`、`next.config.mjs`、`components/Hero.tsx`、`FirmInviteHighlight.tsx`、`TaxPainSolutions.tsx`、`ServiceMarketplaceHighlight.tsx`、`ShowcaseSlides.tsx`

### 2026-05-01（vouchap-website：Hero / Firm invite 用新 Portal 主图 + Cody 副图，清理旧 landing 图）

**User（提示词/原意）**  
- 网站**主图仍用**新的 **Secure Portal** 截图；**此前旧图清理掉**。  
- 「**A branded, secure landing page every time you invite a client**」模块：**主图**用新截的 **portal**，**副图**用 **Cody**。

**Assistant（实现前说明）**  
- 将 portal 存为 **`web_secure_portal_invite.png`**，**`landingAssets`** 以 **`webSecurePortalInvite`** 暴露；**Hero** 与 **FirmInviteHighlight** 主卡均用该资源；Firm invite 副卡保持 **`webCodyAssistant`**。  
- **`ASSET_V`** 递增至 **`20260502`**。删除不再引用的 **legacy** `vouchap_landing_assets` 下旧 PNG 及根目录 **`dashboard.png`**。

**Assistant（实现后说明 / 本轮结论）**  
- 已移除 **`client_auto_invite`**、**`secure_portal_invitation`** 等共 **9** 个旧资源文件 + **`public/dashboard.png`**。  
- **`npm run build`** 通过。

**关联**  
- `vouchap-website/lib/landingAssets.ts`、`components/Hero.tsx`、`components/FirmInviteHighlight.tsx`、`public/vouchap_landing_assets/web_secure_portal_invite.png`

### 2026-05-01（vouchap-website：全站 Web 截图换新 + Showcase 同步，`object-contain`）

**User（提示词/原意）**  
- 重新截取软件截图，**按主题替换**网站上现有 **Web 端**截图；**尽量不裁剪、不拉伸**。**Showcase** 也用新图。

**Assistant（实现前说明）**  
- 将用户提供的 8 张图复制到 **`public/vouchap_landing_assets/`**，统一命名为 **`web_*.png`**；**`lib/landingAssets.ts`** 用 **`ASSET_V=20260501`** 做缓存穿透；Hero / Firm invite 扇形卡 / Tax pains / Marketplace 模块 / Showcase 全部改引用。  
- Showcase **`SlideFigure`** 默认 **`object-contain`** + 深色 letterbox，避免裁切。

**Assistant（实现后说明 / 本轮结论）**  
- 映射：**Expenses**→收据痛点；**Tax collaboration**→协同/任务+Tina；**Firm clients**→CRM 列表+Cody；**Insights**→全局洞察；**Engagement**→共享 engagement；**Service catalog**→firm 发布模板；**Tax filing marketplace**→客户端集市；**Cody**→邀请区副卡。Hero 主图改为 **Firm clients**；原 invite 落地长图引用已移除。  
- **`npm run build`** 通过。

**关联**  
- `vouchap-website/public/vouchap_landing_assets/web_*.png`、`lib/landingAssets.ts`、`Hero.tsx`、`FirmInviteHighlight.tsx`、`TaxPainSolutions.tsx`、`ServiceMarketplaceHighlight.tsx`、`ShowcaseSlides.tsx`

### 2026-05-01（vouchap-website：Marketplace 截图 / 首页模块 / Showcase 全幅独立海报字阶）

**User（提示词/原意）**  
- **Marketplace** 用用户提供的 **Service Marketplace** 实机截图；**网站首页**增加同主题模块。  
- Showcase 仍不够友好；场景为 **10 秒轮播**、文字要更突出；只向主办方交 **2–3 幅**、**可能只采用一页**—**每一页都要完整设计**。

**Assistant（实现前说明）**  
- 将截图保存为 **`public/vouchap_landing_assets/service_marketplace.png`**；新增 **`ServiceMarketplaceHighlight`**（`/#marketplace`，CTA 指向 **`platform…/tax-filing/service-catalog`**）。  
- Showcase：**去掉分列弱视觉**，改为统一 **「顶部 aim.link + Vouchap + chip｜中间 showcase-hero-panel 超大标题 + 单行 tagline｜底部整幅配图 flex-1」**；**globals** 增加 **`showcase-hero-panel` / `showcase-hero-title` / `showcase-tagline`**；Marketplace 屏配图 **`object-contain`**；页脚说明「任选 2–3 屏」。

**Assistant（实现后说明 / 本轮结论）**  
- 已实现并 **`npm run build`** 通过。  
- **Navbar** 增加 **Marketplace** 锚点链接。

**关联**  
- `vouchap-website/public/vouchap_landing_assets/service_marketplace.png`、`vouchap-website/components/ServiceMarketplaceHighlight.tsx`、`vouchap-website/components/ShowcaseSlides.tsx`、`vouchap-website/app/globals.css`、`vouchap-website/app/page.tsx`、`vouchap-website/components/Navbar.tsx`

### 2026-05-01（vouchap-website：Showcase 配图 / 可读性 / 去掉底部四格 / marketplace 屏）

**User（提示词/原意）**  
- 每一幅增加**必要配图**（从网站现有资源选取）；**文字可读性更好**（主办方 PPT 上轮播，每家 **10 秒**）；**不需要底部页签**（即移除 InvestorQuad）；再增加宣传点：**tax filing marketplace**—firm 发布服务模板，吸引 client **直接下单报税服务**。

**Assistant（实现前说明）**  
- 拟用 `public/vouchap_landing_assets/*.png` 与 `dashboard.png` 等与各屏语义对齐；在 **`globals.css`** 增加 **`.showcase-*`** 对比面板与字重阴影类；**重写 `ShowcaseSlides.tsx`**：左/右图文分栏、删 **`InvestorQuad`**、精简英文文案；**新增第 5 屏** marketplace（`secure_portal_invitation.png` 贴合品牌化获客闭环）。

**Assistant（实现后说明 / 本轮结论）**  
- 已实现上述：**五屏**（CRM / AI / Market / aim.link / Marketplace）；配图分别为 firm client detail、client tasks、dashboard、shared tax todo、portal invitation；可读性靠半透明 **`showcase-text-panel`** + **`showcase-title`/`showcase-body` 阴影**与更大字号；底部四格已移除；元数据 description 已更新。

**验证建议**  
- `npm run dev` 打开 **`/showcase`**，全屏模拟 **1920×1080** 远距可读性；轮播计时自行对齐 **10s/屏**。

**关联**  
- `vouchap-website/app/globals.css`、`vouchap-website/components/ShowcaseSlides.tsx`、`vouchap-website/app/showcase/page.tsx`

### 2026-05-01（vouchap-website：投资人 Showcase 多幅 16:9 海报页）

**User（提示词/原意）**  
- 在 **vouchap-website** 增加 **Showcase** 页面；面向天使投资人；每幅按 **1920×1080** 海报基准、多幅 **向下步进滚动**；各幅需覆盖：①税务 firm 与 client 协同 CRM；② AI 解决报税协同最后一公里（业务意图，非仅识别）；③ 北美税务市场规模（从根目录 **Vouchap BP2.5.5-202603** 取数）；④ Vouchap 为 **aim.link** 垂直落地、统一底座、垂直研发边际成本低；主品牌 **aim.link**，内容侧重 Vouchap；投资人视角文案；**UI 英文**。

**Assistant（实现前说明）**  
- 在 **`/Users/macbook/vouchap-website`** 新增 **`app/showcase/page.tsx`**（元数据 + 顶栏含 aim.link 标）与 **`components/ShowcaseSlides.tsx`**（`scroll-snap` 四屏，内层 **`aspect-ratio: 16/9`** 画布随视口缩放，等价 1920×1080 设计基准）。  
- 从 BP 文档（`textutil` 转 TXT）摘录：**北美合规约 $160B+**、**美国约 $145.5B / ~157K firms**、**加拿大 2024 约 $30.3B CAD / 30,427 firms**、**加拿大微所占比 74.6%（少于 5 人）** 等用于第三屏。  
- 导航 **`components/Navbar.tsx`** 增加 **Showcase** 链接。

**Assistant（实现后说明 / 本轮结论）**  
- 已落地上述文件与导航；四屏分别以 CRM、AI 意图、市场规模、aim.link 平台为视觉中心，底部 **InvestorQuad** 四格在每屏重复四个主题（高亮随屏变化）。  
- **`npm run build`** 阶段 **编译与类型检查通过**；收集 page data 时出现 **`/_document` PageNotFoundError**（疑为环境/既有 Next 配置问题，非本页独有语法错误）。

**验证建议**  
- 本地 **`cd vouchap-website && npm run web`**（或 `npm run dev`）打开 **`/showcase`**，竖向滚动确认 snap 与 16:9 画布；导出 PNG 时可用浏览器全屏 1920×1080 截屏每帧。

**关联**  
- `vouchap-website/app/showcase/page.tsx`、`vouchap-website/components/ShowcaseSlides.tsx`、`vouchap-website/components/Navbar.tsx`；市场数字出处：仓库根 **`Vouchap BP2.5.5-202603.docx`**（执行摘要 / 第 2 章）。

### 2026-05-01（Vouchap：`20260501120000` 移除 storage.objects 上 COMMENT ON POLICY）

**User（提示词/原意）**  
- `db push` 应用 `20260501120000_storage_tax_filing_scoped_policies.sql` 报错：`must be owner of relation objects (42501)`，停在 `COMMENT ON POLICY ... ON storage.objects`。

**Assistant（实现前说明）**  
- 托管 Supabase 上 **`storage.objects`** 属系统侧；迁移所用角色通常不是 owner，**`COMMENT ON POLICY`** 会触发 42501。策略 DDL 本身一般可执行。  
- 拟删除该迁移文件末尾的 **`COMMENT ON POLICY`**，说明改写入文件头注释。

**Assistant（实现后说明 / 本轮结论）**  
- 已编辑 **`20260501120000_storage_tax_filing_scoped_policies.sql`**：去掉对 `storage.objects` 策略的 COMMENT，并加 NOTE。  

**验证建议**  
- 若上次 push **整文件在单事务内回滚**，直接再次 **`supabase db push`**。若曾部分提交（少见），需在 Dashboard SQL 核对 `storage.objects` 上 `tax-filing` 策略后再决定是否手工补跑。

**关联**  
- `vouchap-app/supabase/migrations/20260501120000_storage_tax_filing_scoped_policies.sql`

### 2026-05-01（Vouchap：拆分重复迁移版本 `20250313330000` 以消除 db push 歧义）

**User（提示词/原意）**  
- `db push` 仍要求 `--include-all`，且仅列出 `20250313330000_invitee_clients_single_email_and_clients_space_id.sql`。

**Assistant（实现前说明）**  
- 根因：同一目录下曾存在 **两个** `20250313330000_*.sql`，`schema_migrations.version` 只能对应一行，CLI 无法与两条本地文件对齐。  
- 拟将较小且无顺序依赖的 **`drop_firm_projects_project_todos`** 重命名为 **`20250313330001_...`**（紧接在 invitee 迁移之后）。

**Assistant（实现后说明 / 本轮结论）**  
- 已重命名：`20250313330000_drop_firm_projects_project_todos.sql` → **`20250313330001_drop_firm_projects_project_todos.sql`**（内容未改，仍为 `DROP TABLE IF EXISTS`）。  
- 更新 **`scripts/backfill-remote-migration-history.sh`** 注释。  

**验证建议**  
- 再次 **`supabase db push`**；若远程曾只 repair 过 `20250313330000` 一次，可再对 **`20250313330001`** 执行 **`migration repair --status applied`** 或让 push 执行该条（`IF EXISTS` 安全）。

**关联**  
- `vouchap-app/supabase/migrations/20250313330001_drop_firm_projects_project_todos.sql`

### 2026-05-01（Vouchap：`db push` 提示 include-all — 历史迁移与 remote_schema 时序）

**User（提示词/原意）**  
- 终端：`Found local migration files to be inserted before the last migration on remote database`，要求使用 `--include-all`。

**Assistant（实现前说明）**  
- 含义：远程 **`schema_migrations` 仅登记了较晚的基线**（如 `20260109040027`），本地大量更早版本在远程表中缺失；CLI 拒绝默认 push。**勿**在生产库上对已有对象盲跑 `--include-all`（会重放 DDL，易 `already exists`）。  
- 拟新增脚本：对链接项目批量 **`supabase migration repair --status applied <version>`**（只补历史表、不执行迁移 SQL），并 **跳过** 仍待真实执行的版本（当前为 **`20260501120000`**）。

**Assistant（实现后说明 / 本轮结论）**  
- 新增 **`vouchap-app/scripts/backfill-remote-migration-history.sh`**：默认 dry-run 打印 repair 命令；**`--execute`** 执行。内置跳过 `20260109040027` 与待推送的 `20260501120000`；注释说明 **`20250313330000`** 两文件共版号。  
- 流程建议：先 dry-run → 再 `--execute` → 最后 **`supabase db push`**（应仅剩未登记的新迁移）。  

**关联**  
- `vouchap-app/scripts/backfill-remote-migration-history.sh`

### 2026-05-01（Vouchap：补齐远程 `remote_schema` 迁移记录以修复 db push）

**User（提示词/原意）**  
- 提供 `schema_migrations` 查询结果：`version = 20260109040027`，`statements = null`，`name = remote_schema`。

**Assistant（实现前说明）**  
- 判定为 **`supabase db pull`（或同类基线）**在远程写入的历史行，本地缺少同版本 `.sql` 导致 `db push` 报 “Remote migration versions not found in local migrations directory”。拟在本地新增 **`20260109040027_remote_schema.sql`**，内容为无实际 DDL 的占位（`SELECT 1`），与远程已登记版本对齐。

**Assistant（实现后说明 / 本轮结论）**  
- 已新增 **`vouchap-app/supabase/migrations/20260109040027_remote_schema.sql`**。远程已存在该 version 时 **`db push` 不应重复执行**；若在新库从零应用迁移链，该文件为无害占位。  

**验证建议**  
- 在 `vouchap-app` 下执行 `supabase migration list` / `supabase db push`，确认不再因缺版本失败。  

**残留风险**  
- 若远程库 **`schema_migrations` 与真实 DDL 严重不一致**（仅一条 remote_schema 但库已含大量对象），后续 push 仍可能对「未登记」的旧迁移报错或冲突，需结合 `migration list` 全表排查。

**关联**  
- `vouchap-app/supabase/migrations/20260109040027_remote_schema.sql`

### 2026-05-01（Vouchap：安全整改 — Edge 鉴权、tax-filing 存储、日志与预览 XSS）

**User（提示词/原意）**  
- 「列 todo，逐项立即整改。」（承接前序安全审计：Gemini 代理、邀请邮件、存储公读、敏感日志、表格预览等。）

**Assistant（实现前说明）**  
- 计划：① `gemini-proxy` 网关 `verify_jwt=true`，函数内 `getUser` 二次校验；可选 CORS 白名单环境变量；禁止向客户端返回 Google listModels 原始错误体。② `send-invitation-email` 改为 `verify_jwt=true`，用 service role 校验 `space_invitations` 与 inviter 后再 `inviteUserByEmail`；客户端 body 增加 `invitationId`。③ 新迁移收紧 `tax-filing` 桶 RLS（去掉 `public` SELECT，按路径首段 `client_space_id` + `user_spaces` / `firm.can_access_client`）；上传函数禁止空 `clientSpaceId`。④ `gemini.ts` / `auth/confirm.tsx` 脱敏日志；⑤ `office-inline-preview` 对 SheetJS 输出做脚本/事件剥离。⑥ 更新 README 与溯源。

**Assistant（实现后说明 / 本轮结论）**  
- **`supabase/config.toml`**：`gemini-proxy`、`send-invitation-email` 均 **`verify_jwt = true`**。  
- **`gemini-proxy/index.ts`**：`requireAuthenticatedUser`；`GEMINI_PROXY_ALLOWED_ORIGINS`；错误响应不附带 Google 响应 body；同源校验对带 `Origin` 的跨站请求生效。  
- **`send-invitation-email/index.ts`**：同上 CORS 策略（`INVITE_EMAIL_ALLOWED_ORIGINS`）；校验邀请行与 inviter / email / `pending`；`isExistingUser` 仍短路不发邮件。  
- **`space-invitations.ts`**：`invoke` body 增加 **`invitationId`**。  
- **新迁移 `20260501120000_storage_tax_filing_scoped_policies.sql`**：删除 `tax_filing_public_select`，读写删选均按文件夹与成员/事务所权限收紧。**部署后**建议在 Dashboard 将 **`tax-filing` 桶改为 Private**（迁移注释已说明）。  
- **`supabase.ts`**：`uploadTaxFilingFile` / `uploadTaxFilingFileBytes` 无 `clientSpaceId` 时抛错；税表上传成功日志仅在 dev。  
- **`gemini.ts`**：`geminiDevLog` 包裹原 `console.log`，避免生产打印 URL/解析内容。  
- **`auth/confirm.tsx`**：`authConfirmDevLog`，不再打印含 token 的完整 URL。  
- **`office-inline-preview.ts`**：`sanitizePreviewTableHtml`。  
- 新增 **`supabase/functions/gemini-proxy/README.md`**；更新 **`send-invitation-email/README.md`**。  

**验证建议**  
- 部署两枚 Edge Functions 后：匿名/无效 JWT 应 401；邀请邮件仅合法 inviter 可发。  
- 执行迁移后：匿名应无法 SELECT `tax-filing`；成员与 firm 可读路径需与业务一致；将桶改为 Private 后验证 `getTaxFilingViewUrl` 签名打开。  

**残留风险**  
- 未实现按用户 Gemini **配额/限流**（仍依赖后续产品策略）。  
- `marketplace` 存储仍为 public SELECT（本次未改）。  
- Sheet 预览消毒为规则型，非完整 HTML 消毒器。

**关联**  
- `vouchap-app/supabase/functions/gemini-proxy/index.ts`  
- `vouchap-app/supabase/functions/send-invitation-email/index.ts`  
- `vouchap-app/supabase/config.toml`  
- `vouchap-app/supabase/migrations/20260501120000_storage_tax_filing_scoped_policies.sql`  
- `vouchap-app/src/shared-logic/space-invitations.ts`、`supabase.ts`、`gemini.ts`  
- `vouchap-app/src/mobile-ui/app/auth/confirm.tsx`  
- `vouchap-app/src/shared-logic/office-inline-preview.ts`

### 2026-05-01（aim.link-v2：Web 顶栏通知 icon 与相邻 icon 对齐）

**User（提示词/原意）**  
- icon 的位置没有跟旁边的 icon 对齐。

**Assistant（实现前说明，若有）**  
- 对照 **`AppNavHeader`**：铃铛包在 **`Badge`** 内且 **`fontSize: 18`**，相邻 Help/Settings 为 **16px** 裸图标；**`.ant-badge`** 为 **`inline-block`**，在 **`inline-flex`** 的 **24×24** 按钮内可能产生与直接 **`anticon`** 不同的视觉中心。

**Assistant（实现后说明 / 本轮结论）**  
- **`BellOutlined`** 改为 **16px**；**`.aimlink-header-icon-btn .ant-badge`** 改为 **`inline-flex`** + **`align-items/justify-content: center`**（**不**将 **Badge** 铺满 **24×24**，避免未读角标锚到按钮角而远离铃铛）。已追加 **aim.link-v2** **`PROMPTS-LOG`** / **`PRD`** 变更记录。

**关联**  
- `/Users/macbook/aim.link-v2/apps/web/src/components/app-chrome/AppNavHeader.tsx`  
- `/Users/macbook/aim.link-v2/apps/web/src/styles/aimlink-web-app-shell.scss`

### 2026-05-01（aim.link-v2：Web 顶栏通知 icon 与设置同色）

**User（提示词/原意）**  
- Web 端顶栏的通知 icon，颜色应改为和旁边的设置 icon 一样的浅色。

**Assistant（实现前说明，若有）**  
- 对照 **`AppNavHeader`** 与 **`aimlink-web-app-shell.scss`**：Help / Settings 为裸 **`anticon`**，消息为 **`Badge`** 包 **`BellOutlined`**；怀疑 **`.ant-badge`** 默认字色覆盖顶栏继承色。

**Assistant（实现后说明 / 本轮结论）**  
- 根因：**antd** **`.ant-badge`** 默认 **`color: rgba(0, 0, 0, 0.85)`**。在 **`aimlink-web-app-shell.scss`** 为 **`.aimlink-header-icon-btn .ant-badge`** 与内部 **`.anticon`** 增加 **`color: inherit`**（并 **`font-size` / `line-height: inherit`**），铃铛与相邻设置/帮助一致继承导航浅色。  
- **aim.link-v2** 侧已同步 **`docs/PROMPTS-LOG.md`** 与 **`docs/PRD.md`** 变更记录。验证：登录后 **`/app/*`** 顶栏对比消息与设置图标色。

**关联**  
- `/Users/macbook/aim.link-v2/apps/web/src/styles/aimlink-web-app-shell.scss`  
- `/Users/macbook/aim.link-v2/docs/PROMPTS-LOG.md` · `/Users/macbook/aim.link-v2/docs/PRD.md`

### 2026-05-01（Vouchap：Gemini 调用下沉 Supabase，移除 Expo/Web 对 AI Key 依赖）

**User（提示词/原意）**  
- “按你的设计方案执行修改。expo 上构建 app，cloudflare 上部署 web，最好更换模型时不需重新构建，统一在 supabase 一套调用。”

**Assistant（实现前说明，若有）**  
- 采用最小侵入改造：保留现有 `gemini.ts`/报税识别业务流程与模型重试逻辑，新增与 `GoogleGenerativeAI` 接口兼容的客户端代理层，把真实 Gemini 调用迁移到 Supabase Edge Function。  
- 计划触达文件：`src/shared-logic/gemini*.ts`、`src/shared-logic/tax-filing-*.ts`、`supabase/functions/` 与 `app.config.js`；目标是客户端不再携带真实 AI Key，模型默认值与切换策略可在 Supabase 环境变量调整。

**Assistant（实现后说明 / 本轮结论）**  
- 新增 `supabase/functions/gemini-proxy/index.ts`：服务端统一处理 `generateContent` 与 `listModels`，真实密钥仅从 `GEMINI_API_KEY` 读取；新增 `GEMINI_MODEL_DEFAULT` 与 `GEMINI_ENFORCE_SERVER_MODEL` 以支持服务端模型切换。  
- 新增 `src/shared-logic/gemini-server-sdk.ts`：提供兼容 `GoogleGenerativeAI` 的代理实现，内部通过 `supabase.functions.invoke('gemini-proxy')` 调用，避免重写大量既有业务代码。  
- 已将 `tax-filing-recognition-run.ts`、`tax-filing-task-matcher.ts`、`gemini.ts`、`gemini-helper.ts` 切换为代理调用；`app.config.js` 中 `extra.geminiApiKey` 改为非敏感占位标识 `server-side-gemini-proxy`，不再依赖 `EXPO_PUBLIC_GEMINI_API_KEY`。  
- `ReadLints` 对本次变更文件检查通过（无新增 lint 错误）。部署后仅需在 Supabase Functions 侧更新环境变量与函数版本即可完成 key/模型切换，无需重新构建 Expo App 或 Cloudflare Web 前端。

**关联**  
- `/Users/macbook/Vouchap/vouchap-app/supabase/functions/gemini-proxy/index.ts`  
- `/Users/macbook/Vouchap/vouchap-app/src/shared-logic/gemini-server-sdk.ts`  
- `/Users/macbook/Vouchap/vouchap-app/src/shared-logic/gemini-helper.ts`  
- `/Users/macbook/Vouchap/vouchap-app/src/shared-logic/gemini.ts`  
- `/Users/macbook/Vouchap/vouchap-app/src/shared-logic/tax-filing-recognition-run.ts`  
- `/Users/macbook/Vouchap/vouchap-app/src/shared-logic/tax-filing-task-matcher.ts`  
- `/Users/macbook/Vouchap/vouchap-app/app.config.js`

### 2026-04-30（aim.link：排查 GCP 部署 YAML 配置）

**User（提示词/原意）**  
- “给我找一下aim.link的各个项目中有没有用于GCP部署用的yaml文件”。

**Assistant（实现前说明，若有）**  
- 对 `aim.link`、`aim.link-v2`、`aim-link-website` 及 `Project-map` 进行 YAML 全量检索（`*.yml`/`*.yaml`）并补充按常见 GCP 部署命名（如 `cloudbuild.yaml`、`app.yaml`）二次筛查，确认是否存在可直接用于 GCP 部署的配置文件。

**Assistant（实现后说明 / 本轮结论）**  
- 检索结果：上述项目均未发现任何 `.yml/.yaml` 文件，也未发现 `cloudbuild.yaml`、`app.yaml`、`skaffold.yaml` 或名称含 `gcp` 的 YAML 配置。  
- 结论：当前这些 aim.link 相关项目内，不存在可识别的 GCP 部署 YAML 文件。

**关联**  
- `/Users/macbook/aim.link`  
- `/Users/macbook/aim.link-v2`  
- `/Users/macbook/aim-link-website`  
- `/Users/macbook/Project-map`

### 2026-04-30（aim.link v2：任务表列序/显隐项目级持久化）

**User（提示词/原意）**  
- 列序和显隐需要保存，项目级统一并让项目成员一致。

**Assistant（实现前）**  
- 给 DataTable 增加受控布局输入/回调，在项目页读取与写回 `projects.project_rules`，实现成员共享。

**Assistant（实现后说明）**  
- `DataTable` 已支持 `columnLayout` / `onColumnLayoutChange`。  
- `ProjectDetailPage` 加入 `task_table_layout` 读取与防抖保存（250ms）到 `project_rules`；同项目成员会看到统一配置。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/components/vouchap-web/DataTable.tsx`  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`

### 2026-04-30（aim.link v2：项目任务表默认列序重排）

**User（提示词/原意）**  
- 默认列序中三个计数列放右端，`assignee`/`reviewer` 左移。

**Assistant（实现前）**  
- 调整 `ProjectDetailPage` DataTable 默认列数组顺序，不改列定义含义。

**Assistant（实现后说明）**  
- 已将 `Assignee`、`Reviewer` 提前；`Subtasks`、`Predecessors`、`Discussions` 放到最右侧。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`

### 2026-04-30（aim.link v2：标题缩略裁剪二次修复）

**User（提示词/原意）**  
- 缩略后的 title 仍超列宽，末端被裁剪。

**Assistant（实现前）**  
- 改为基于按钮真实可用宽度与实时字体测量做截断，避免“估算宽度 + CSS ellipsis”叠加造成二次裁剪。

**Assistant（实现后说明）**  
- `ProjectTaskTableTitleLink` 现在观测按钮真实宽度并用 `getComputedStyle` 字体参与 `truncateMiddleByWidth` 测量。  
- 任务表标题链接样式改为 `display:block; width:100%`，并移除 CSS `text-overflow: ellipsis`。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`  
- `aim.link-v2/apps/web/src/styles/aimlink-web-project-port.scss`

### 2026-04-30（aim.link v2：任务表标题缩略末端裁剪修复）

**User（提示词/原意）**  
- 缩略后的 title 仍超列宽，末端被裁剪。

**Assistant（实现前）**  
- 调整标题缩略可用宽度预算并移除链接默认左右 padding，保证计算宽度与实际绘制一致。

**Assistant（实现后说明）**  
- `ProjectTaskTableTitleLink` 可用宽度从 `w-2` 调整为 `w-18`（留出安全余量）。  
- 标题链接补 `px-0`，去除默认横向 padding。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`

### 2026-04-30（aim.link v2：任务表 Title 列约 50 字符上限）

**User（提示词/原意）**  
- title 列控制在 50 字符左右宽度；短标题完整显示，超出改中部缩略。

**Assistant（实现前）**  
- 在 `ProjectDetailPage` 给标题列增加像素上限（约 50 字符视觉宽度），继续沿用按溢出触发的中间缩略。

**Assistant（实现后说明）**  
- `Task title` 列新增 `maxWidth: 420`；短标题保持完整，超长标题仍由 `truncateMiddleByWidth` 做中部缩略。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`

### 2026-04-30（aim.link v2：项目任务表列扩展、标题列宽、内置 Task 工作流修复）

**User（提示词/原意）**  
- 标题列仍未充满；表增加起止、子任务数、前序数、讨论数；去掉 deadline 列。  
- 系统内置 Task 任务流转不生效，可能要刷新旧团队数据。

**Assistant（实现前）**  
- 用 `ResizeObserver` + 表单元格 `width:100%` 解决标题占满列；补查询与列；任务抽屉打开前 `ensureDefaultPdcaWorkflow` 并在种子后迁移 open/done 任务到 PDCA 相位。

**Assistant（实现后说明）**  
- 已实现上述逻辑；`typecheck` 通过。  
- 讨论数仅计 `message_scope` 非 `workflow_outcome` 的线程消息；前序为 `task_precedence_links` 指入当前任务；子任务为同项目内 `parent_task_id` 计数。

**关联**  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`  
- `aim.link-v2/apps/web/src/components/TaskDetailDrawer.tsx`  
- `aim.link-v2/apps/web/src/lib/task-workflow-default-seed.ts`  
- `aim.link-v2/docs/PROMPTS-LOG.md`、`aim.link-v2/docs/PRD.md`

### 2026-04-30（aim.link v2：项目任务表状态标签修复）

**User（提示词/原意）**  
- 自定义任务类型的状态标签在表格中显示不正确，出现 id。

**Assistant（实现前）**  
- 调整项目详情页状态标签加载逻辑：不再仅取默认类型的状态字典，改为根据当前项目任务实际状态 id 集合加载标签映射。

**Assistant（实现后说明）**  
- `ProjectDetailPage` 已改为基于任务实际 `workflow_state_id` 查询 `task_workflow_status.display_label`。  
- 自定义类型状态在任务表中不再回退显示为 id（除非数据库确实无对应状态行）。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`

### 2026-04-30（aim.link v2：任务表标题改为按列宽中间缩略）

**User（提示词/原意）**  
- 标题缩略需按列宽溢出后触发，不用固定 15 汉字上限。

**Assistant（实现前）**  
- 新增基于像素宽度测量的中间缩略函数，并将项目任务表标题列改为按列宽预算动态截断。

**Assistant（实现后说明）**  
- `breadcrumb-label.ts` 增加 `truncateMiddleByWidth`：仅在文本实际宽度超过阈值时执行中间省略。  
- `ProjectDetailPage` 的 `Task title` 列改为调用该函数；列宽与文本预算分离配置，未溢出时不截断。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/lib/breadcrumb-label.ts`  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`

### 2026-04-30（aim.link v2：项目任务表标题列宽与中间省略）

**User（提示词/原意）**  
- 项目内任务 table 的 `Task title` 列限制最大宽度，超长用和面包屑一样的中间缩略。

**Assistant（实现前）**  
- 调整 `ProjectDetailPage` 数据表标题列配置：设置 `maxWidth`，并将标题渲染改为复用 `truncateBreadcrumbSegment`。

**Assistant（实现后说明）**  
- `Task title` 列已增加 `maxWidth: 320`。  
- 列内容已改为中间省略（与面包屑同函数 `truncateBreadcrumbSegment`）；`Tooltip` 保留完整标题。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`

### 2026-04-30（aim.link v2：停用任务类型从新建/切换候选移除）

**User（提示词/原意）**  
- Active 关闭的任务类型，在任务类型切换和新建任务时不可再用；已有任务不受影响。

**Assistant（实现前）**  
- 在任务详情类型下拉与新建任务默认类型解析两处加入 `retired_at` 过滤；保留存量任务当前类型显示，不做强制迁移。

**Assistant（实现后说明）**  
- `TaskDetailDrawer` 已过滤停用类型，仅展示可用类型用于切换；若当前任务类型已停用，仍保留当前值显示，确保历史任务可正常查看。  
- `project-workflow.pickTaskBlueprintOpenState` 已过滤停用类型，避免新建任务选中停用类型。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/components/TaskDetailDrawer.tsx`  
- `aim.link-v2/apps/web/src/lib/project-workflow.ts`

### 2026-04-30（aim.link v2：Task types — System 标签进一步减小）

**User（提示词/原意）**  
- `system` 标进一步减小。

**Assistant（实现前）**  
- 在 `TaskTypesSettingsPage` 缩小 `System` 标签样式（字体、内边距、行高），保持其在名称后弱化展示。

**Assistant（实现后说明）**  
- 已将 `System` 标签进一步缩小（`10px` 字号，收窄 padding，降低行高）。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/pages/settings/TaskTypesSettingsPage.tsx`

### 2026-04-30（aim.link v2：Task types 列表 — 强化 Type name，弱化 System）

**User（提示词/原意）**  
- Task types 列表上强化 `Type name`；`System` 标签弱化，且放在名称列紧跟名称。

**Assistant（实现前）**  
- 调整 `TaskTypesSettingsPage` 表格列：强化 `Type name` 信息密度与可读性；将 `System` 从 `Creator` 列移回 `Type name` 且弱化样式；`Creator` 列恢复纯创建人。

**Assistant（实现后说明）**  
- `Type name` 列已加宽并提升名称字重；`System` 标签改为浅灰低对比样式，紧跟在名称后同列显示。  
- `Creator` 列已移除 `System` 标签，仅显示创建人。  
- `apps/web` 执行 `npm run typecheck` 通过。

**关联**  
- `aim.link-v2/apps/web/src/pages/settings/TaskTypesSettingsPage.tsx`

### 2026-04-30（aim.link v2：Task types 详情去 internal_code + 默认类型码 task）

**User（提示词/原意）**  
- 任务类型详情页去掉 `internal_code`；默认 Task 类型的 `internal_code` 改为 `task`。

**Assistant（实现前）**  
- 前端移除详情页 `internal_code` 可见项，并调整新建逻辑不再暴露 code 输入；新增 DB 迁移将系统默认类型码从 `general` 调整为 `task`，同时保留对历史数据兼容；同步项目默认蓝本选择逻辑。

**Assistant（实现后说明）**  
- `TaskTypesSettingsPage`：详情头部已移除 `internal_code` 标签；创建弹窗去除 `Internal code` 输入，创建时由标题自动生成内部 code。  
- 新增迁移 `20260430214000_task_blueprint_default_internal_code_task.sql`：将系统默认类型码切到 `task`（无冲突 workspace 自动迁移），并更新 workspace 默认种子函数优先写入 `task`，兼容历史 `general`。  
- `apps/web/src/lib/project-workflow.ts`：默认蓝本查找优先 `task`，回退 `general`。  
- 已同步 `aim.link-v2/docs/PROMPTS-LOG.md`、`aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/DATABASE-SCHEMA.md`。

**关联**  
- `aim.link-v2/apps/web/src/pages/settings/TaskTypesSettingsPage.tsx`  
- `aim.link-v2/apps/web/src/lib/project-workflow.ts`  
- `aim.link-v2/supabase/migrations/20260430214000_task_blueprint_default_internal_code_task.sql`

### 2026-04-30（aim.link v2：Task types — Linked tasks 列左对齐）

**User（提示词/原意）**  
- `linked tasks` 一列也靠左。

**Assistant（实现前）**  
- 修改 `TaskTypesSettingsPage` 表格列配置，移除 `Linked tasks` 的右对齐参数；随后执行类型检查。

**Assistant（实现后说明）**  
- `Linked tasks` 列已改为左对齐显示。  
- `apps/web` 执行 `npm run typecheck` 通过。  
- 已同步 `aim.link-v2/docs/PROMPTS-LOG.md`、`aim.link-v2/docs/PRD.md` 以及本溯源日志。

**关联**  
- `aim.link-v2/apps/web/src/pages/settings/TaskTypesSettingsPage.tsx`

### 2026-04-30（aim.link v2：Task types — System 标识移到 Creator 列）

**User（提示词/原意）**  
- `system` 标识放在 `creator` 一列。

**Assistant（实现前）**  
- 调整 `TaskTypesSettingsPage` 表格列渲染：从 `Type name` 列移除 `System` 标签，改到 `Creator` 列；完成后跑 `typecheck` 校验。

**Assistant（实现后说明）**  
- 已将 `System` 标签移动至 `Creator` 列，与创建人同列显示；`Type name` 列仅保留类型名。  
- `apps/web` 执行 `npm run typecheck` 通过。  
- 已同步 `aim.link-v2/docs/PROMPTS-LOG.md` 与 `aim.link-v2/docs/PRD.md` 记录。

**关联**  
- `aim.link-v2/apps/web/src/pages/settings/TaskTypesSettingsPage.tsx`

### 2026-04-30（aim.link v2：Task types — Type name 第二行移除）

**User（提示词/原意）**  
- `type name` 的第二行是什么，去掉。

**Assistant（实现前）**  
- 定位 `Task types` 表格 `Type name` 列渲染，移除第二行 `internal_code`，保留主标题与系统标识标签；随后跑 `typecheck` 确认无回归。

**Assistant（实现后说明）**  
- 已在 `TaskTypesSettingsPage` 删除 `Type name` 列内的 `row.internal_code` 第二行文案，仅保留类型名。  
- `apps/web` 执行 `npm run typecheck` 通过。  
- 已同步 `aim.link-v2/docs/PROMPTS-LOG.md` 与 `aim.link-v2/docs/PRD.md` 变更记录。

**关联**  
- `aim.link-v2/apps/web/src/pages/settings/TaskTypesSettingsPage.tsx`

### 2026-04-30（aim.link v2：Task types 设置页 — 列表布局与文档同步）

**User（提示词/原意）**  
- **Task types** 整页：去除 **Create task type** 模块、**Create new** 放右上、去掉 **Existing task types** 外层、标题下直接表格；列含类型名、创建人、创建/更新时间、关联任务数、活跃开关、编辑等。

**Assistant（实现前）**  
- 无新增实现；续作：确认 **`apps/web` `typecheck` 通过**；补 **`aim.link-v2`** 的 **`docs/DATABASE-SCHEMA.md` / `PROMPTS-LOG.md` / `PRD.md` 变更记录**（与 Task types 页及 **`task_blueprints.created_by_user_id`** 迁移一致）。

**Assistant（实现后说明）**  
- **`npm run typecheck`**（`@aimlink/web`）**通过**。  
- 已更新 **`aim.link-v2/docs/DATABASE-SCHEMA.md`**（`task_blueprints` 行含 **`created_by_user_id`**、**`retired_at`**）；**`PROMPTS-LOG.md`** 与 **`PRD.md` 变更记录** 已追加 2026-04-30 条。  
- 部署须执行 Supabase 迁移（含 **`20260430193000_task_blueprints_created_by_user.sql`**），否则新列查询/写入会失败。

**关联**  
- `aim.link-v2/apps/web/src/pages/settings/TaskTypesSettingsPage.tsx`、`aim.link-v2/supabase/migrations/20260430193000_task_blueprints_created_by_user.sql`

### 2026-04-29（aim.link v2：工作流画布 — 右侧未到边即限位）

**User（提示词/原意）**  
- 画布右侧拖动**未到边缘**就被限制。

**Assistant（实现后说明）**  
- **`nodeExtent`** 的 **`maxNX`** 改为 **`w - 148`**（与 **`.aimlink-wf-node` min-width** 一致），不再用 **`WF_NODE_W` 176**。

**关联**  
- `aim.link-v2/apps/web/src/components/settings/TaskWorkflowVisualEditor.tsx`

### 2026-04-29（aim.link v2：工作流画布 — 节点不可拖出画布）

**User（提示词/原意）**  
- 左右仍无滚动条；改为**限制不要拖出画布**。

**Assistant（实现后说明）**  
- **`TaskWorkflowVisualEditor`**：**`ResizeObserver`** + **`nodeExtent`/`translateExtent`**；**`clampWorkflowNodePosition`**；**`autoLayout`** 与初始节点写入前钳制；样式内层 **100%** 宽。

**关联**  
- `aim.link-v2/apps/web/src/components/settings/TaskWorkflowVisualEditor.tsx`、`aim.link-v2/apps/web/src/styles/aimlink-web-task-workflow-visual.scss`

### 2026-04-29（aim.link v2：工作流画布滚轮不滚动 / 无横向条）

**User（提示词/原意）**  
- 有上下滚动条但滚不动；拖动滚动条可动画布；左右不完整且无横向滚动条。

**Assistant（实现后说明）**  
- **`TaskWorkflowVisualEditor`**：**`preventScrolling={false}`**，避免 React Flow **`preventDefault`** 吞掉滚轮。样式：**`width: max(100%,960px)`**、**`overflow-x/y: auto`**、**`scrollbar-gutter: stable`**。

**关联**  
- `aim.link-v2/apps/web/src/components/settings/TaskWorkflowVisualEditor.tsx`、`aim.link-v2/apps/web/src/styles/aimlink-web-task-workflow-visual.scss`

### 2026-04-29（aim.link v2：工作流画布溢出 / 滚动）

**User（提示词/原意）**  
- 画布需**限制不能溢出**，或**支持滚动**。

**Assistant（实现后说明）**  
- **`aim.link-v2`**：**`aimlink-web-task-workflow-visual.scss`** — 根 **`overflow:hidden` + max-width**；画布列 **`overflow:hidden`**；滚动区 **`flex:1 1 0`**、**`min-height/min-width:0`**、**`overflow:auto`**，移除与 **`min-height:0`** 冲突的 **`min-height:440px`**；**`overscroll-behavior:contain`**。工具栏文案补充在灰色面板内滚动、不溢出页面。

**关联**  
- `aim.link-v2/apps/web/src/styles/aimlink-web-task-workflow-visual.scss`、`aim.link-v2/apps/web/src/components/settings/TaskWorkflowVisualEditor.tsx`

### 2026-04-29（aim.link v2：工作流画布区与屏显左右错位）

**User（提示词/原意）**  
- 画布区与屏显区域**左右错位**：画布**左侧溢出**，**右侧**不到显示边缘，**右侧内容被裁剪**。

**Assistant（实现后说明）**  
- 在 **`aim.link-v2`** 调整 **`aimlink-web-task-workflow-visual.scss`**：画布列 **`flex: 1 1 0`**、侧栏 **`flex: 0 0 min(440px,42%)`** 并去掉重复 **`width:42%`**；内层由固定 **960×440** 改为 **`width:100%` + min 尺寸 + `height:100%`**，**`TaskWorkflowVisualEditor`** 去掉对应行内样式。**`npm run typecheck`**（`apps/web`）通过。

**关联**  
- `aim.link-v2/apps/web/src/styles/aimlink-web-task-workflow-visual.scss`、`aim.link-v2/apps/web/src/components/settings/TaskWorkflowVisualEditor.tsx`

### 2026-04-29（aim.link v2 / 多根 Workspace：工作流画布 — 拖动连线端点改锚点）

**User（提示词/原意）**  
- 允许用户自行**拖动连线的起终点**，选择节点上的**其他锚点**（与自动贪心锚点分配配合）。

**Assistant（实现前说明）**  
- 在 **`aim.link-v2`** 的 **`TaskWorkflowVisualEditor`** 启用 React Flow **`onReconnect`**，用 **`reconnectEdge(..., { shouldReplaceId: false })`** 保持边 id 与 **`task_workflow_rules.id`** 一致；持久化 **`from_state_id` / `to_state_id`** 与 **`conditions.source_handle` / `target_handle`**；与 **`transitionExists`** 业务校验冲突则提示并拒收。为使 DB 锚点生效，在贪心结果上叠加 **`parsePersistedHandleOverride`**。同步 **`aim.link-v2` 的 `docs/PRD.md` / `PROMPTS-LOG.md`**，不修改 Vouchap 产品 PRD 正文。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`/Users/macbook/aim.link-v2/apps/web/src/components/settings/TaskWorkflowVisualEditor.tsx`**；**`npm run typecheck`**（`apps/web`）通过。  
- **验证建议**：在 Task types → 流程可视化中拖动某条 transition 的端点改接四向锚点或另一状态对，保存后刷新应仍按持久化锚点绘制；尝试与已有「同路径同角色」冲突时应报错并回滚为服务端数据（**`onReload`**）。

**关联**  
- `aim.link-v2/apps/web/src/components/settings/TaskWorkflowVisualEditor.tsx`；`aim.link-v2/docs/PRD.md`；`aim.link-v2/docs/PROMPTS-LOG.md`

### 2026-04-26（Vouchap：Engagement 详情 / Todos — 手机浏览器与 App 对齐）

**User（提示词/原意）**  
- vouchap 手机浏览器端，engagement 详情页 / todo 页仍与 App 不一致，需优化对齐。

**Assistant（实现前说明）**  
- 根因：`ProjectDetailView` 用 `isMobile = !isWeb`，凡 `Platform.OS === 'web'`（含手机浏览器）都走桌面顶栏单行标题、顶栏右侧操作、内联 Todo 筛选；`TaxFilingTodosView` 亦凡 Web 即桌面表格/拖放/悬停布局。  
- 计划：接入已有 `useWebViewportKind()` / `isMobileWebWidth`，使 **移动 Web** 与原生共用「紧凑顶栏 + 底部主操作 + 筛选浮层」；Todo 树通过 **Context** 在窄屏 Web 上走与 App 相同的行布局（`Pressable` 行、移动进度/状态列、无桌面拖放与 Depends 列等）。

**Assistant（实现后说明 / 本轮结论）**  
- **`ProjectDetailView`**：`useMobileEngagementChrome = !isWeb || isMobileWeb`；桌面 Web 仍用顶栏操作与内联筛选；移动 Web 用底部操作条与筛选 Modal。`ProjectDetailHeaderTitle` 在移动 Web 使用与 App 相同的两行紧凑顶栏。`onPersistTodoTitle` 仅 `isDesktopWeb` 时下发（与既有父级 `persistTodoTitle` 门控一致）。  
- **`TaxFilingTodosView`**：新增 `TaxFilingTodoDesktopWebLayoutContext`，`isDesktopWebTodoLayout = web && !isMobileWebWidth(width)`；`TodoTree` 通过 Context 分支替代多处 `Platform.OS === 'web'` 的布局逻辑；拖放、`createPortal` 幽灵层、「Add a phase」、行内重命名附件悬停等仅桌面 Web。  
- **验证建议**：手机浏览器打开 firm/client engagement 详情与 client project todos，对比原生 App：顶栏两行、Todos/Info、底部 Terminate/Complete/Accept、筛选入口与列表行布局应一致；桌面宽窗 Web 行为应保持不变。  
- **残留**：`StyleSheet.create` 内部分样式仍以 `Platform.OS === 'web'` 静态分支，窄屏下个别间距可能与原生略有差异；若需像素级一致可后续改为按 `isDesktopWebTodoLayout` 的动态样式。

**关联**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`  
- `vouchap-app/src/mobile-ui/components/TaxFilingTodosView.tsx`

### 2026-04-26（Vouchap：手机浏览器优先采用 App 页面，启动第 1 批落地）

**User（提示词/原意）**  
- 用户询问「网页端适配手机浏览器并采用 App 页面，改造幅度大不大」；随后要求「列出可直接改代码的 TODO，并立即开始」。
- 用户补充更正：**移动浏览器首页不采用 App 版 index，应继续使用 Dashboard**；并要求将该点纳入修订后的列表后继续第二批。

**Assistant（实现前说明，若有）**  
- 先做第 1 批高收益改造：建立统一的 Web 视口判定（区分 desktop web / mobile web），并将根布局与首页、收支列表从“`Platform.OS === 'web'` 全量走桌面分支”改为“仅桌面 Web 走桌面分支”，使手机浏览器回落到移动端单栏与 App 风格交互。
- 同批次继续覆盖同类列表页（`inbound` / `outbound` / `receipt-items`），避免手机浏览器仍落入桌面 DataTable 分支。
- 计划触及文件：`vouchap-app/src/mobile-ui/lib/web-viewport.ts`、`vouchap-app/src/mobile-ui/app/_layout.tsx`、`vouchap-app/src/mobile-ui/app/index.tsx`、`vouchap-app/src/mobile-ui/app/receipts.tsx`、`vouchap-app/src/mobile-ui/app/invoices.tsx`、`vouchap-app/src/mobile-ui/app/inbound.tsx`、`vouchap-app/src/mobile-ui/app/outbound.tsx`、`vouchap-app/src/mobile-ui/app/receipt-items.tsx`。

**Assistant（实现后说明 / 本轮结论）**  
- 新增 `web-viewport` 工具，提供 `MOBILE_WEB_MAX_WIDTH`、`isMobileWebWidth()` 与 `useWebViewportKind()`，用于统一判定移动 Web。
- `_layout` 已改为仅桌面 Web 显示 `WebSidebar`、固定 `WebChatPanel` 与桌面 chat FAB；移动 Web 不再走桌面双栏结构。
- `index` 页改为仅桌面 Web 使用 `WebDashboardView/CrmDashboardView`；移动 Web 走原移动页路径。space 切换后的“刷新页面”弹窗仅桌面 Web 显示。
- `receipts` / `invoices` 已接入视口判定：`DataTable`、Web 浮窗、Web 专属 FAB 仅桌面 Web 启用；移动 Web 回落到移动列表与交互分支。
- `inbound` / `outbound` / `receipt-items` 已同步接入视口判定：Web 浮窗和桌面表格仅桌面 Web 启用，手机浏览器回落到移动列表交互。
- 按用户更正已回调首页策略：`index` 在移动浏览器仍走 Dashboard（与桌面 Web 一致），不再落回 App 首页布局。
- 第二批已推进：`firm/clients`、`firm/engagements`、`firm/client/[clientSpaceId]` 的 DataTable/浮窗/Realtime 路径改为仅桌面 Web 启用；移动浏览器回落移动端列表/卡片交互。`tax-filing/index` 仅桌面 Web 走 `TaxFilingWebScreen`，移动浏览器改走 `TaxFilingMobileScreen`；`tax-filing/order/[orderId]` 与 `tax-filing/project/[projectId]` 的 Web 专属提示/交互（alert/confirm、树缩进判定、Tina FAB 开关）改为仅桌面 Web 触发。
- 本轮已检查改动文件的 lint，未发现新增错误。

**关联**  
- `vouchap-app/src/mobile-ui/lib/web-viewport.ts`  
- `vouchap-app/src/mobile-ui/app/_layout.tsx`  
- `vouchap-app/src/mobile-ui/app/index.tsx`  
- `vouchap-app/src/mobile-ui/app/receipts.tsx`  
- `vouchap-app/src/mobile-ui/app/invoices.tsx`  
- `vouchap-app/src/mobile-ui/app/inbound.tsx`  
- `vouchap-app/src/mobile-ui/app/outbound.tsx`  
- `vouchap-app/src/mobile-ui/app/receipt-items.tsx`  
- `vouchap-app/src/mobile-ui/app/firm/clients.tsx`  
- `vouchap-app/src/mobile-ui/app/firm/engagements.tsx`  
- `vouchap-app/src/mobile-ui/app/firm/client/[clientSpaceId].tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/index.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/index.tsx`

### 2026-04-26（Vouchap：手机浏览器 Web 分流 — 第 3 批：Management / Chat / 详情与目录）

**User（提示词/原意）**  
- 「继续第三批」：在已有 `useWebViewportKind` / `isMobileWebWidth` 策略下，补齐 management、chat、设置/实体、服务目录及若干详情页的「仅桌面 Web」与「移动 Web 走 App 交互」分流。

**Assistant（实现前说明，若有）**  
- 将仍按 `Platform.OS === 'web'` 一律走桌面分支的屏，改为 `isDesktopWeb` 或 `isDesktopCatalog`（服务目录：宽屏 Web + `!isMobileWebWidth(width)`），使移动浏览器与原生一致或可订阅 Realtime；桌面 Web 保留整页刷新提示、侧栏 Chat、Web 专用控件与浮层。

**Assistant（实现后说明 / 本轮结论）**  
- **`management`**：Space 切换成功后，仅 **桌面 Web** 弹出「Refresh page」；**移动 Web** 与原生一样就地 `loadData()` 更新。  
- **`chat-to-log`**：`drawer` 模式、桌面式输入区、文件 input / 文件夹选择仅 **桌面 Web**；移动 Web 使用与 App 一致的底部输入与 `ImagePicker` 选图。  
- **`firm/engagement/[id]`**：自动打开 `WebChatPanel`、`window.confirm` 拒单、Tina FAB 显示条件、`persistTodoTree*` 仅 **桌面 Web**；移动 Web 可走 Tina FAB + 全屏 chat 路由。  
- **`receipt-details/[id]`**：`input type="date"`、行内 Web 下拉（category/attribution）仅 **桌面 Web**；移动 Web 用日期触控与 Modal 选择器。  
- **`entities-manage`**：`entities` Realtime 在 **桌面 Web** 禁用，**移动 Web** 启用；原 `StyleSheet` 内针对 Web 的 `supplierCard` 溢出样式改为仅 `isDesktopWeb` 时叠加。  
- **`tax-filing/order/[orderId]/info`**：拒单确认 **桌面 Web** 用 `window.confirm`，否则 `Alert`（含移动 Web）。  
- **`tax-filing/service-catalog`**、**`firm/service-catalog`**：默认视图、列宽/网格、Filter 浮层（portal）与横向 padding 仅 **桌面目录宽**；移动 Web 用双列卡片宽与内联 Filter 下拉。  
- 已对上述改动文件跑过 IDE lint，无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/app/management.tsx`  
- `vouchap-app/src/mobile-ui/app/chat-to-log.tsx`  
- `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`  
- `vouchap-app/src/mobile-ui/app/receipt-details/[id].tsx`  
- `vouchap-app/src/mobile-ui/app/entities-manage.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/info.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/service-catalog.tsx`  
- `vouchap-app/src/mobile-ui/app/firm/service-catalog.tsx`

### 2026-04-26（Vouchap：窄窗 Web — Expenses/Income 列表 + 直达 Chat）

**User（提示词/原意）**  
- 浏览器窄窗模式下，expenses / income 列表页右下角 + 按钮不要二次选择，去掉激活相机的二层选项，直接打开 chat。

**Assistant（实现前说明，若有）**  
- 列表页 FAB：`isDesktopWeb` 仍用 `WebChatFab`；**原生** 仍保留「+ 展开聊天/相机」；**窄窗 Web**（`Platform.OS === 'web' && !isDesktopWeb`）单独分支，主按钮一次性 `router.push` 到 `chat-to-log`（invoice 带 `type=invoice`）。

**Assistant（实现后说明 / 本轮结论）**  
- **`receipts.tsx`**、**`invoices.tsx`**：在桌面 Web 与原生之间增加 **仅 Web 且非桌面** 的单按钮 FAB，点击即进入 Chat to log；原生逻辑未改。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipts.tsx`  
- `vouchap-app/src/mobile-ui/app/invoices.tsx`

### 2026-04-26（Vouchap：窄窗 Web 首页对齐 App — Dashboard 单列图表 + 顶栏底栏）

**User（提示词/原意）**  
- 浏览器窄窗模式：1）Dashboard 不要压扁 chart 宽高比，单列排列；2）底部与 App 相同路由按钮；3）顶部与 App 相同：通知、Space 切换、设置。概括：窄窗与 App 差异仅在 index 主区由 slogan + 两圆钮改为 4 个 chart，其余布局一致。

**Assistant（实现前说明，若有）**  
- 沿用 `useWebViewportKind`：仅 **桌面 Web** 首页仍只渲染 Dashboard（配合侧栏）；**移动 Web** 走与原生相同的 `index` 壳层（顶栏、ScrollView、底栏）。  
- `WebDashboardView` / `CrmDashboardView` 在窄 Web 上改为与原生一致的 **单列** 与 **按宽度定图表高度**（避免 2×2 按视口高度切半导致压扁）。  
- `WebDashboardView` 嵌入首页时去掉重复「Dashboard」标题行（`homeCompact`）。

**Assistant（实现后说明 / 本轮结论）**  
- **`index.tsx`**：`Platform.OS === 'web' && isDesktopWeb` 才整页只放 Dashboard；**移动 Web** 落入原原生 `ScrollView + topBar + bottomNav + modals` 路径；client 空间在 **移动 Web** 用 `<WebDashboardView homeCompact />` 替代 slogan 与双圆按钮；Space 切换后「刷新页」弹窗仅 **桌面 Web**（与 management 策略一致）。  
- **`WebDashboardView.tsx`**：`!isMobileWebWidth(width)` 为桌面 2×2；否则单列，`chartHeight` 由 `chartWidth` 比例与上下限约束；`homeCompact` 时仅输出图表栅格供首页嵌入。  
- **`CrmDashboardView.tsx`**：将原「凡 `Platform.OS === 'web'` 即 2×2」改为 **仅宽屏桌面 Web** 2×2；窄 Web 与原生同为单列；「Insights」顶栏仅桌面宽屏；饼图/条形/折线 padding 在移动 Web 上与原生一致（`isMobileWebWidth`）。  
- 已对相关文件跑 IDE lint，无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/app/index.tsx`  
- `vouchap-app/src/mobile-ui/components/WebDashboardView.tsx`  
- `vouchap-app/src/mobile-ui/components/CrmDashboardView.tsx`

### 2026-04-26（Vouchap：测试服务器 Web 白屏修复）

**User（提示词/原意）**  
- 「测试服务器浏览器白屏」。

**Assistant（实现前说明，若有）**  
- 先读取正在运行的 Expo 终端日志，定位是打包失败还是运行时错误；若为模块解析失败，直接修正导入路径并让 Metro 增量重编译。

**Assistant（实现后说明 / 本轮结论）**  
- 白屏根因是 **Web Bundling failed**：`src/mobile-ui/app/receipt-details/[id].tsx` 无法解析 `../lib/web-viewport`。  
- 已将该文件 import 改为 `../../lib/web-viewport`（当前目录为 `app/receipt-details/`，需回退两级到 `mobile-ui/lib`）。  
- 本地 lint 对该文件无新增报错。若浏览器仍显示旧白屏，请强制刷新一次（`Cmd+Shift+R`）或在 Expo 终端按 `r` 触发 reload。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipt-details/[id].tsx`

### 2026-04-26（Vouchap：Web 列表分组/筛选 — 窄屏走 Modal、桌面仍走 Portal）

**User（提示词/原意）**  
- Web 端宽屏、窄屏模式下列表上的分组、筛选功能都不可用（改坏）。

**Assistant（实现前说明，若有）**  
- 根因：分组/筛选底部 **Modal** 仍用 `Platform.OS !== 'web'` 包裹；窄屏 Web 已不走桌面 **Portal**（`isDesktopWeb === false`），但也不渲染 Modal，点击仅切 state、无菜单。  
- 将两处 Modal 外层条件改为 **`!isDesktopWeb`**：桌面 Web 继续仅用 Portal + `nativeID` 量位；窄屏 Web 与原生用底部 Modal。同步改 **receipts / invoices / inbound / outbound** 四处同类写法。

**Assistant（实现后说明 / 本轮结论）**  
- 上述四文件中 **`{Platform.OS !== 'web' && (`** 已替换为 **`{!isDesktopWeb && (`**（各 2 处：Group、Filter）。原生 `isDesktopWeb` 恒为 false，行为与原先一致。  
- 已对改动文件跑 IDE lint，无新增报错。验证：桌面宽 Web 点 Group/Filter 仍为浮层；浏览器宽度 ≤920 或移动 Web 点同一按钮应出现底部 Sheet。

**关联**  
- `vouchap-app/src/mobile-ui/app/receipts.tsx`  
- `vouchap-app/src/mobile-ui/app/invoices.tsx`  
- `vouchap-app/src/mobile-ui/app/inbound.tsx`  
- `vouchap-app/src/mobile-ui/app/outbound.tsx`

### 2026-04-22（aim.link-v2：Timeline 左栏宽度对齐左轨）

**User**  
- 左侧栏应按规范统一的宽度。

**Assistant（实现后）**  
- **`aim.link-v2`**：**`aimlink-timeline-filters`** 与 **`aimlink-drawer-static`** 同用 **`220px × --aimlink-ui-scale`**（**`--menu-width`**）。

**关联**  
- `aim.link-v2/apps/web/src/styles/aimlink-web-dynamic-port.scss`

### 2026-04-22（aim.link-v2：Timeline 主区纵向错位修复）

**User**  
- 主显示区被放在页面下部了，布局不对。

**Assistant（实现后）**  
- **`aim.link-v2`**：**`aimlink-web-dynamic-port.scss`** 去掉 **`aimlink-web-app-shell-main > .aimlink-timeline-page`** 上的 **`flex-direction: column`** 与 **`aimlink-dynamic-tab-main`** 的共用规则，避免覆盖 Timeline 横向布局。

**关联**  
- `aim.link-v2/apps/web/src/styles/aimlink-web-dynamic-port.scss`

### 2026-04-22（跨仓：aim.link-v2 Timeline 独立与 work map 流水）

**User（提示词/原意）**  
- Timeline 不应嵌 Work Map 模块；左栏筛选；主区按日分组；project/task/work map 可跳转；参考 legacy timeline。

**Assistant（实现后说明 / 本轮结论）**  
- 已在 **`aim.link-v2`** 落地 **`ActivityPage`** 重构与 **`workmap.mind_maps`** → **`activity_timeline_events`** 迁移草案；并更新 **`aim.link-v2/docs/PRD.md`** / **`DATABASE-SCHEMA.md`**。

**关联**  
- `aim.link-v2/apps/web/src/pages/ActivityPage.tsx`、`aim.link-v2/supabase/migrations/20260422100000_timeline_workmap_mind_map_events.sql`

### 2026-04-23（aim.link-v2：全仓 ant4 迁移 + Work Map 左栏修复）

**User（提示词/原意）**  
- Work Map 左侧栏被改坏需核查修复；并要求整个 aim.link-v2 完整替换 `ant4` 等代号。

**Assistant（实现后说明 / 本轮结论）**  
- 已修复 Work Map 左栏；并在 `aim.link-v2/apps/web/src` 全量将 `ant4-` 迁移为 `aimlink-`（含页面与样式）。类型检查与 lints 通过。

**关联**  
- `aim.link-v2/apps/web/src/pages/WorkMapPage.tsx`、`aim.link-v2/apps/web/src/styles/aimlink-web-app-shell.scss`、`aim.link-v2/apps/web/src/styles/aimlink-web-work-map-port.scss`

### 2026-04-23（aim.link-v2：Work Map ant4 前缀替换）

**User（提示词/原意）**  
- 代码中还有大量 `ant4`，应全面替换成 `aimlink`。

**Assistant（实现后说明 / 本轮结论）**  
- 已先在 **Work Map 模块**落地：`WorkMapPage.tsx` 与 `aimlink-web-work-map-port.scss` 的 `ant4-*` 替换为 `aimlink-*`，模块内残留清零；其余模块仍有历史前缀，待继续分批迁移。验证：`npx tsc --noEmit`（`apps/web`）。

**关联**  
- `aim.link-v2/apps/web/src/pages/WorkMapPage.tsx`、`aim.link-v2/apps/web/src/styles/aimlink-web-work-map-port.scss`

### 2026-04-22（aim.link-v2：Work Map WBS 提示词 @ / # 与深度）

**User（提示词/原意）**  
- AI 输出未按设计格式（**@** 指派人、**#** 截止时间）；深化提示词：WBS 更深更具体，合理起止时间。

**Assistant（实现后说明 / 本轮结论）**  
- **`aim.link-v2/apps/web`**：**`gemini-work-map-wbs.ts`** 强化系统提示（叶子 **@/#**、双日期、行数/深度、锚日）；**`WorkMapPage`** 传入 **`getWorkspaceMembersForMindMap`** 无空格姓名列表；PRD/PROMPTS 已更新。验证：**`npx tsc --noEmit`**（**`apps/web`**）。

**关联**  
- `aim.link-v2/apps/web/src/lib/gemini-work-map-wbs.ts`、`aim.link-v2/apps/web/src/pages/WorkMapPage.tsx`  
- `aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/PROMPTS-LOG.md`

### 2026-04-22（aim.link-v2：Work Map WBS 模型级联对齐 Vouchap）

**User（提示词/原意）**  
- 参考 Vouchap 代码配置，选择合适用来拆解工作计划的优先模型。

**Assistant（实现后说明 / 本轮结论）**  
- **`aim.link-v2/apps/web/src/lib/gemini-work-map-wbs.ts`**：模型尝试顺序与 **`Vouchap/vouchap-app/src/shared-logic/gemini-helper.ts`**（**`buildGeminiModelOrder` / `inferComplexGeminiContent`**）对齐，并增加失败自动换模；**`VITE_GEMINI_MODEL`** 为单模覆盖。已更新 **`aim.link-v2`** 的 PRD / PROMPTS / README 等。验证：**`npx tsc --noEmit`**（**`apps/web`**）。

**关联**  
- `aim.link-v2/apps/web/src/lib/gemini-work-map-wbs.ts`、`Vouchap/vouchap-app/src/shared-logic/gemini-helper.ts`  
- `aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/PROMPTS-LOG.md`

### 2026-04-22（aim.link-v2：Gemini 默认模型 2.5 Flash）

**User（提示词/原意）**  
- Google 提示 **`gemini-2.0-flash`** 对新用户不可用，要求代码改用更新模型。

**Assistant（实现后说明 / 本轮结论）**  
- **`aim.link-v2/apps/web/src/lib/gemini-work-map-wbs.ts`**：默认模型改为 **`gemini-2.5-flash`**；**`aim.link-v2`** 内 README / PRD / PROMPTS 已同步。验证：**`npx tsc --noEmit`**（**`apps/web`**）。

**关联**  
- `aim.link-v2/apps/web/src/lib/gemini-work-map-wbs.ts`、`aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/PROMPTS-LOG.md`

### 2026-04-22（aim.link-v2：Work Map Chat — Gemini WBS → mind_map_document）

**User（提示词/原意）**  
- 开发 AI：env 已加 Gemini key；用户在 chat 页输入项目目标与规范需求，大模型拆 WBS，JSON 写入 **`mind_maps.mind_map_document`**，并拟定 **`name`**。

**Assistant（实现前说明）**  
- 在 **`aim.link-v2/apps/web`** 落地：Gemini JSON → **`documentFromOutlineAndTitle`** → **`createMindMap`**；Vite 合并 Gemini 相关 env；更新 **`aim.link-v2`** 的 **PRD / PROMPTS** 与 **`apps/web`** 文档示例；本条目记入 Vouchap 溯源（跨仓工程交付）。

**Assistant（实现后说明 / 本轮结论）**  
- 代码与文档位于 **`aim.link-v2`** 路径见上；密钥走浏览器直连存在暴露与 CORS 风险，PRD **REQ-WEB-AI-001** 已注明后续可迁 Edge。验证：**`npx tsc --noEmit`**（**`aim.link-v2/apps/web`**）。

**关联**  
- `aim.link-v2/apps/web/src/lib/gemini-work-map-wbs.ts`、`aim.link-v2/apps/web/src/pages/WorkMapPage.tsx`、`aim.link-v2/apps/web/vite.config.ts`  
- `aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/PROMPTS-LOG.md`

### 2026-04-22（aim.link-v2：Todo 与 Task 模块合并为单一 Todo）

**User（提示词/原意）**  
- Todo 模块整合到 Task 模块（现 todo 模块移除，Task 模块更名为 Todo）；My todo 替代 My tasks；三个 pending 作为 My Todo 的子集。

**Assistant（实现前说明）**  
- 以 **`TasksPage`** 为唯一实现；路由 **`/app/todo`**，**`/app/tasks`** 重定向；顶栏 **`effectiveTodoNavEnabled`**；左栏嵌套三项 **Pending** 与 **`work_tasks`** 过滤对齐旧 **`TodoPage`**；删除 **`TodoPage.tsx`**、**`TodoLeftRail.tsx`** 与 **`aimlink-web-todo-port.scss`**；更新 **`aim.link-v2/docs/PRD.md`**、**`PROMPTS-LOG.md`** 与 **`FeaturePermissions`** 中 **`tasks`** 与 **`todo`** 同步写入。

**Assistant（实现后说明 / 本轮结论）**  
- 改动位于 **`aim.link-v2/apps/web`** 上述路径；**`npx tsc --noEmit`**（**`apps/web`**）通过。

**关联**  
- `aim.link-v2/apps/web/src/App.tsx`、`TasksPage.tsx`、`TasksLeftRail.tsx`、`AppNavHeader.tsx`、`AppLayout.tsx`  
- `aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/PROMPTS-LOG.md`

### 2026-04-22（aim.link-v2：Task 侧栏 CTA 文案 New Todo → New Task）

**User（提示词/原意）**  
- 「+ New Todo 还是规范为 + New Task」。

**Assistant（实现前说明）**  
- 对齐域模型与产品英文：**Task** 模块左栏 **`aimlink-sidebar-hero-cta`** 与无障碍/悬停文案由 **New Todo** 改为 **New Task**；同步 **`apps/web` README**、**`aim.link-v2/docs/PRD.md`**（REQ-WEB-UI-002、变更表）、**`aim.link-v2/docs/PROMPTS-LOG.md`**；**`TaskCreateCenterModal`** 已为 **New Task** 则不改逻辑。

**Assistant（实现后说明 / 本轮结论）**  
- 已改 **`TasksLeftRail.tsx`**、**`app-chrome/README.md`**、上述 PRD/PROMPTS；**`npx tsc --noEmit`**（`aim.link-v2/apps/web`）通过。

**关联**  
- `aim.link-v2/apps/web/src/components/app-chrome/TasksLeftRail.tsx`  
- `aim.link-v2/apps/web/src/components/app-chrome/README.md`  
- `aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/PROMPTS-LOG.md`

### 2026-04-20（aim.link-v2：修复 project-map SCSS 未定义 `$aimlink-web-text`）

**User（提示词/原意）**  
- Vite/Sass：`Undefined variable` `$aimlink-web-text`（`aimlink-web-project-map-port.scss`）。

**Assistant（实现后说明 / 本轮结论）**  
- 在该文件顶部定义与 **`aimlink-web-shell-layout.scss`** 一致的 **`$aimlink-web-*`** 变量（该样式由 **`root.tsx`** 独立引入，不继承 shell 文件中的变量作用域）。**`npm run build -w @aimlink/web`** 通过。

**关联**  
- `aim.link-v2/apps/web/src/styles/aimlink-web-project-map-port.scss`

---

### 2026-04-20（aim.link-v2：Project map 按业务逻辑实现编辑—保存闭环）

**User（提示词/原意）**  
- 不要只「抄样子」；先按业务逻辑理解原项目；先实现**可编辑保存**闭环；按业务逻辑对齐复用。

**Assistant（实现前说明，若有）**  
- 区分数据模型：独立 **Project-map** 用 **`workmap`** 元数据 + 编辑器内存树（导出 JSON，未见写回 `mind_map` 文档表）；v2 用 **`workspace_project_maps.mind_map_document`**。  
- 定 **`mind_map_document` v1** 契约并实现 **`mind-map-document.ts`**；首版编辑用与 **Project-map Text 模式**相同的大纲缩进算法；新增草稿编辑路由与 **Save**（带 `workspace_id` + `published_project_id IS NULL`）、**Discard**、干净状态下 **Publish**。

**Assistant（实现后说明 / 本轮结论）**  
- 代码与文档均在 **`aim.link-v2`** / **`Vouchap/docs`** 已列路径；**`npm run typecheck -w @aimlink/web`** 通过。

**关联**  
- `aim.link-v2/apps/web/src/lib/mind-map-document.ts`  
- `aim.link-v2/apps/web/src/pages/ProjectMapDraftEditorPage.tsx`  
- `aim.link-v2/apps/web/src/pages/ProjectMapPage.tsx`  
- `aim.link-v2/apps/web/src/App.tsx`  
- `aim.link-v2/docs/DATABASE-SCHEMA.md`、`docs/PRD.md`、`docs/PROMPTS-LOG.md`、`docs/COMPONENT-LIBRARY.md`、`apps/web/README.md`

---

### 2026-04-20（aim.link-v2：Project map 续作 — root 样式引入、Create 空标题、文档）

**User（提示词/原意）**  
- 对话续作（摘要）：核对 **`root.tsx`** 是否引入 **`aimlink-web-project-map-port.scss`**、类型检查、PRD/组件库/README；**Create** 允许空标题；页头标题样式类名与 **`h2`** 一致。

**Assistant（实现前说明，若有）**  
- 在 **`aim.link-v2`** 仓库：`root.tsx` 增加 project-map 端口样式 import；**`ProjectMapPage`** 去掉 Create 对空名的禁用；SCSS 页头选择器对齐 **`aimlink-project-map__header-title`**；跑 **`npm run typecheck -w @aimlink/web`**；更新 **`docs/PRD.md`**、**`docs/PROMPTS-LOG.md`**、**`docs/COMPONENT-LIBRARY.md`**、**`apps/web/README.md`**。

**Assistant（实现后说明 / 本轮结论）**  
- 已按上项完成；类型检查通过。改动均在 **`aim.link-v2`**，**Vouchap** 代码无变更。

**关联**  
- `aim.link-v2/apps/web/src/root.tsx`  
- `aim.link-v2/apps/web/src/pages/ProjectMapPage.tsx`  
- `aim.link-v2/apps/web/src/styles/aimlink-web-project-map-port.scss`  
- `aim.link-v2/docs/PRD.md`、`PROMPTS-LOG.md`、`COMPONENT-LIBRARY.md`  
- `aim.link-v2/apps/web/README.md`

---

### 2026-04-20（aim.link-v2：重启测试服务器，仅保留一个实例）

**User（提示词/原意）**  
- 启动 `aim.link-v2` 项目的测试服务器；随后要求“关掉全部，重新启动一个”。

**Assistant（实现前说明，若有）**  
- 先检查当前终端中是否已有 `aim.link-v2` dev server 在运行，避免重复拉起；再停止相关 `npm run dev` / `vite` 进程，仅重启一个实例。

**Assistant（实现后说明 / 本轮结论）**  
- 已停止现有 `aim.link-v2` 开发进程，并在 `aim.link-v2` 根目录重新启动单一 dev server（`npm run dev`）。  
- 当前可访问地址：`http://localhost:5173/`。

**关联**  
- `aim.link-v2`（本轮为运行命令，无代码文件变更）

---

### 2026-04-20（Vouchap：receipt 分类提示词再增强——引入 entity 与票面上下文）

**User（提示词/原意）**  
- 提示词需进一步优化：准确判断 `category` 与 `attribution` 还需结合 receipt 的 `entity` 等票面其他可用信息。

**Assistant（实现前说明，若有）**  
- 继续在 `gemini.ts` 的 receipt 提示词层面增强判定约束，除 `name + itemAlias` 外，加入 receipt-level 语义信号（entity/merchant profile、税区线索、票面抬头关键词、支付账户线索、同单据 basket pattern）作为分类与归属决策依据。

**Assistant（实现后说明 / 本轮结论）**  
- 已更新 `buildReceiptExtractionRules` 的分类规则：明确 `categoryName/attributionName` 需同时参考行级信息与票据级上下文，避免与商家/实体画像冲突；遇到单行歧义时，先结合同票据其他行与购物篮模式再判断。  
- 已更新 `recognizeReceiptFromText` 的文字识别 prompt，同步加入 entity 与票面上下文联合判定要求，保证图片/文档/文字路径规则一致。  
- 说明：当前 `gemini.ts` 存在两条历史类型断言 lint（`GeminiReceiptResult` 到 `Record<string, unknown>`），与本次提示词文本修改无直接关系，本轮未改动该逻辑。

**关联**  
- `vouchap-app/src/shared-logic/gemini.ts`

---

### 2026-04-20（Vouchap：Web 生产 receipt 识别失败 + category/attribution 错分优化）

**User（提示词/原意）**  
- 连续在 Web 生产环境通过 chat 提交 receipt 图片识别失败；dev 环境可识别但 `category` 与 `attribution` 识别明显错误，要求优化提示词：在客户备选选项中结合 `item_alias` 一起判断。

**Assistant（实现前说明，若有）**  
- 排查 chat 上传链路后，优先处理两点：  
  1) Gemini Key 在生产注入占位符（如 `${EXPO_PUBLIC_...}`）时，现有判定可能误认为“有值”，导致请求失败；  
  2) receipt 提示词虽有候选列表，但对 `name` 与 `itemAlias` 联合判定约束不够强，导致错分。  
- 计划修改 `gemini.ts` 与 `tax-filing-recognition-run.ts` 的 key 安全校验，并增强 receipt extraction prompt 的分类/归属选择规则。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/shared-logic/gemini.ts`：新增 `getCurrentGeminiApiKey()`，统一过滤无效 key（空值、`placeholder-key`、`undefined`、包含 `${` 的占位符）；并在 receipt 相关入口（图片、文档、文本、supplier info）改为使用该安全函数，降低 Web 生产环境因占位符注入导致的识别失败。  
- `vouchap-app/src/shared-logic/tax-filing-recognition-run.ts`：同样补充无效 key 判定（含 `${`/`undefined`），避免 tax-filing 识别链路出现同类生产失败。  
- `vouchap-app/src/shared-logic/gemini.ts`：强化 receipt 提示词，明确 `categoryName` / `attributionName` 必须结合每行 `name + itemAlias` 联合判断；当 `name` 为 code-like 时优先参考 `itemAlias` 语义；优先命中客户备选项，仅在无合理匹配时新增值。  
- 已对改动文件执行 lints 检查，无新增 lint 错误。

**关联**  
- `vouchap-app/src/shared-logic/gemini.ts`  
- `vouchap-app/src/shared-logic/tax-filing-recognition-run.ts`

---

### 2026-04-18（Vouchap：改币种保存失败且 items 被清空）

**User（提示词/原意）**  
- receipt 详情改币种时保存失败，随后 items 消失。

**Assistant（实现前说明，若有）**  
- 排查 `updateReceipt`：当 `receipt.items` 传入时先 `delete receipt_items`，再做插入与校验；若后续抛错会导致旧 items 已被删，出现“保存失败 + items 没了”。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/shared-logic/database.ts`：将 items 流程改为 **先校验并构造 payload，再删除旧行**；删除前先抓取 snapshot。若插入失败，执行 **best-effort 回滚**（把 snapshot 重插）并继续抛错，避免明细永久丢失。  
- 该修复不改变币种字段逻辑，仅修正失败路径的数据安全。

**关联**  
- `vouchap-app/src/shared-logic/database.ts`

---

### 2026-04-16（aim.link-v2：第二批20项连续执行（ProjectDetail/ProjectList/Task/Messages收口））

**User（提示词/原意）**  
- 要求继续并新增 20 项待办；强调“列 todo 是为了让助手连续工作”，并要求持续推进。

**Assistant（实现前说明，若有）**  
- 新建第二批 20 项复刻任务（replica2-01 ~ replica2-20），优先顺序：  
  1) Project Detail 二级导航/工具条/TaskList结构；  
  2) Project List list/card 细节；  
  3) Task list 头部与行内信息；  
  4) Messages 未读样式与时间布局；  
  5) 全局 icon/圆角/gap 收口与构建验证。  

**Assistant（实现后说明 / 本轮结论）**  
- 已完整执行并完成第二批 20 项，核心结果：  
  - `ProjectDetailPage`：新增旧版风格二级 subnav（WBS/Gantt/Process/Table/Kanban/TaskList/Overview/Files）；TaskList 增加列头与元信息图标（执行/审核/截止），行尾加入更多+进入动作；Table/Kanban/Files/MindMap/Overview 均加紧凑样式类并统一密度。  
  - `ProjectListPage`：list 模式加入列头条；每行增加左侧缩略占位块；右侧指标区尺寸/字段间距/进度条宽度精修；card 模式列宽、卡片高度与文字层级进一步贴近旧版。  
  - `TasksPage`：标题列改为“主标题 + 次级 chip（state/due）”双层信息，表格行高继续压缩。  
  - `MessagesPage`：未读行加 `news-box-item--unread`，标题字重与时间对齐更突出；dot 偏移位置调整。  
  - 全局：导航菜单与 operator item 圆角统一收口为 2px。  
- 质量：`npm run build -w @aimlink/web` 多次验证通过；lints 无新增报错。  

**关联**  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`  
- `aim.link-v2/apps/web/src/pages/ProjectListPage.tsx`  
- `aim.link-v2/apps/web/src/pages/TasksPage.tsx`  
- `aim.link-v2/apps/web/src/pages/MessagesPage.tsx`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-project-port.scss`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-task-port.scss`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-news-port.scss`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-app-shell.scss`

---

### 2026-04-16（aim.link-v2：20项复刻清单执行（导航/Todo/Task/Project/Timeline/Map））

**User（提示词/原意）**  
- 要求不要停下来，先按代码复刻实现；并要求助手自己列出 20 项待办后逐项完成。

**Assistant（实现前说明，若有）**  
- 建立 20 项执行清单并按模块推进：  
  1) 顶部导航与右侧工具区；  
  2) 左侧菜单统一密度；  
  3) Todo/Task/Project 的工具栏与列表结构；  
  4) Messages/Search/Timeline/Project map 页面骨架与信息流密度；  
  5) 最后进行 lint 与构建验证。  
- 计划触及：`components/pc40/*`、`pages/*`、`styles/saas-pc4-*.scss`、`styles/pc40-app.scss`。

**Assistant（实现后说明 / 本轮结论）**  
- 已执行并完成该 20 项清单，核心落地如下：  
  - 顶部导航补齐独立 `Timeline` 入口；`More` 菜单去重；右侧加入 `Help` / `Settings` 快捷图标并统一 icon/search 密度。  
  - Todo：左侧文案改为 `My To-Do / Pending execute / Pending review / Pending assign / Pending approve`；标题区、搜索/排序控件和列表行高进一步压缩到旧版密度。  
  - Task：工具栏收敛为 `Earliest End time / No Grouping / View / Save View / Search / Filter / Refresh / More` 的同层结构，列表行字体与内边距进一步紧凑。  
  - Activity（Timeline）：改为紧凑工具栏 + 自定义信息流列表（非 antd List 默认密度）。  
  - Project map：页面头部、Collapse、list card/tree 区统一紧凑布局与字号。  
- 质量验证：已执行 `npm run build -w @aimlink/web`，构建通过；lints 无新增报错。  

**关联**  
- `aim.link-v2/apps/web/src/components/pc40/Pc40NavHeader.tsx`  
- `aim.link-v2/apps/web/src/components/pc40/TodoLeftRail.tsx`  
- `aim.link-v2/apps/web/src/components/pc40/TaskOperateBlock.tsx`  
- `aim.link-v2/apps/web/src/pages/TodoPage.tsx`  
- `aim.link-v2/apps/web/src/pages/ActivityPage.tsx`  
- `aim.link-v2/apps/web/src/pages/ProjectMapPage.tsx`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-app-shell.scss`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-todo-port.scss`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-task-port.scss`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-dynamic-port.scss`  
- `aim.link-v2/apps/web/src/styles/pc40-app.scss`

---

### 2026-04-16（aim.link-v2：Timeline 主导航 + Activity 紧凑流 + Todo 侧栏文案）

**User（提示词/原意）**  
- 要求直接继续推进对齐。

**Assistant（实现前说明，若有）**  
- 对照旧版主导航结构：增加独立 **Timeline** 入口；**Activity** 页首 tab 改为 Timeline 并改为紧凑信息流；**Todo** 左侧与主区标题文案对齐截图中的英文菜单命名。

**Assistant（实现后说明 / 本轮结论）**  
- `Pc40NavHeader`：在 `Project` 与 `More` 之间增加 `Timeline`（`/app/activity`，`LineChartOutlined`），并从 `More` 菜单移除重复的 Activity 项。  
- `ActivityPage`：首 tab 文案改为 `Timeline`，内容区改为 `ant4-activity-workspace` 工具栏 + 自定义 `ant4-activity-feed` 列表行（hover、字号、边线）；样式追加在 `saas-pc4-dynamic-port.scss`。  
- `TodoLeftRail` / `TodoPage`：侧栏与 `NAV_TITLE` 更新为 `My To-Do`、`Pending execute/review/assign/approve`、`Work report`；占位提示文案同步。  
- `npm run build -w @aimlink/web` 已通过。

**关联**  
- `aim.link-v2/apps/web/src/components/pc40/Pc40NavHeader.tsx`  
- `aim.link-v2/apps/web/src/pages/ActivityPage.tsx`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-dynamic-port.scss`  
- `aim.link-v2/apps/web/src/components/pc40/TodoLeftRail.tsx`  
- `aim.link-v2/apps/web/src/pages/TodoPage.tsx`

---

### 2026-04-16（aim.link-v2：Messages / Search 页结构继续对齐 pc4.0）

**User（提示词/原意）**  
- 要求直接继续推进逐页对齐，不停顿。

**Assistant（实现前说明，若有）**  
- 在已完成 Projects 卡片收敛基础上，继续处理 `/app/messages` 与 `/app/search`：消息页增加紧凑变体类并收紧标题栏与列表行；搜索页从居中 Card+List 改为全宽双栏工作台布局与自定义结果行。

**Assistant（实现后说明 / 本轮结论）**  
- `MessagesPage` 根节点增加 `news-content--pc40-tight`，在 `saas-pc4-news-port.scss` 中覆盖标题栏高度、边距、字号及列表行内边距与详情字号。  
- `SearchPage` 移除 Ant `Card`/`List`，改为 `ant4-search-workspace` 双栏面板 + 结果列表行（hover、边框、链接样式）；样式写入 `pc40-app.scss`。  
- 已执行 `npm run build -w @aimlink/web`，构建通过。

**关联**  
- `aim.link-v2/apps/web/src/pages/MessagesPage.tsx`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-news-port.scss`  
- `aim.link-v2/apps/web/src/pages/SearchPage.tsx`  
- `aim.link-v2/apps/web/src/styles/pc40-app.scss`

---

### 2026-04-16（aim.link-v2：Projects 卡片视图按对照图收敛）

**User（提示词/原意）**  
- 继续具体对比当前与目标截图，指出差距依然很大，要求继续推进细化对齐。

**Assistant（实现前说明，若有）**  
- 重点收敛 `/app/projects` 的 card 模式结构差异：从“图文卡片墙”调整为目标图中的“紧凑纯文本项目卡”，并同步顶部操作栏文案细节（`Save View`）。  
- 修改 `ProjectListPage` 卡片 DOM 与 `saas-pc4-project-port.scss` 卡片样式体系。

**Assistant（实现后说明 / 本轮结论）**  
- 已将 project card 视图改为小尺寸纯文本卡：标题、摘要占位、时间、右上角设置按钮；收紧边框、阴影、字号与间距，去除原先大图感的视觉风格。  
- 已在项目操作栏左侧补 `Save View` 占位项，接近目标图工具条信息结构。  
- 本地构建验证通过（`npm run build -w @aimlink/web`），无新增 lint 报错。  

**关联**  
- `aim.link-v2/apps/web/src/pages/ProjectListPage.tsx`  
- `aim.link-v2/apps/web/src/components/pc40/ProjectOperatorBlock.tsx`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-project-port.scss`

---

### 2026-04-16（aim.link-v2：修复 Cloudflare 构建失败）

**User（提示词/原意）**  
- 提供 Cloudflare Pages 构建日志，报错为 `src/pages/ProjectDetailPage.tsx` 从 `antd` 导入了 `CaretRightOutlined`，导致打包失败，要求继续推进并修复。

**Assistant（实现前说明，若有）**  
- 先定位 `ProjectDetailPage` 导入源，将图标改为从 `@ant-design/icons` 导入，再执行 `npm run build -w @aimlink/web` 复现验证。

**Assistant（实现后说明 / 本轮结论）**  
- 已修复导入错误：`CaretRightOutlined` 从 `antd` 移除，改为 `@ant-design/icons` 正确来源。  
- 本地已验证 `@aimlink/web` 构建通过（Vite build 成功，产物输出完成）；当前仅剩 Sass legacy-js-api 的 deprecation warning，不影响发布。  

**关联**  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`

---

### 2026-04-16（aim.link-v2：Web 端 pc4.0 逐页对齐持续改造）

**User（提示词/原意）**  
- 继续把 UI 往 pc4.0 靠紧，默认先细抠 `/app/tasks`、`/app/projects`、`/app/messages`、`/app/search`；并明确反馈“菜单结构、文案、页面结构差距巨大”，要求助手不要停，自己逐页检查推进。  
- 用户提供多张对照截图（Task 主列表、Project 列表、Project 详情 TaskList）作为目标样式基准。

**Assistant（实现前说明，若有）**  
- 计划分两层推进：  
  1) 全局壳层（顶部导航、左侧菜单、操作栏密度）先做结构和文案收敛；  
  2) 逐页补列表行结构、信息层级和 hover/间距细节，优先 Project 列表与 Project 详情 TaskList。  
- 触及模块：`apps/web/src/components/pc40/*`、`pages/*` 与 `styles/saas-pc4-*.scss`。

**Assistant（实现后说明 / 本轮结论）**  
- 已完成并持续推进以下改造（本轮）：  
  - 顶部导航与左栏菜单结构重排（`Todo/Task/Project/More` + Task/Project 左栏分组文案收敛）。  
  - `ProjectDetailPage` 增加更接近截图的紧凑 TaskList 行：序号、标题、状态标签、逾期标签、执行人信息与右侧进入按钮。  
  - `ProjectDetailPage` 操作栏补齐 Search/Filter/More 入口占位，压缩间距与字号。  
  - `ProjectListPage` 列表行新增右侧指标区：Overdue、Completed/All 与进度条，向旧版项目行结构靠拢。  
  - 样式层新增 `ant4-project-detail` 与任务行密度规则，统一小字号、紧凑行高与 hover。  
- 已运行 lints，当前无新增 lint 报错。  
- 后续继续：按同样方式完成 `messages/search` 结构对齐，并继续做项目页细节收口（图标、间距、字段顺序、次级文字样式）。

**关联**  
- `aim.link-v2/apps/web/src/components/pc40/Pc40NavHeader.tsx`  
- `aim.link-v2/apps/web/src/components/pc40/TasksLeftRail.tsx`  
- `aim.link-v2/apps/web/src/components/pc40/ProjectLeftRail.tsx`  
- `aim.link-v2/apps/web/src/components/pc40/TaskOperateBlock.tsx`  
- `aim.link-v2/apps/web/src/components/pc40/ProjectOperatorBlock.tsx`  
- `aim.link-v2/apps/web/src/pages/TasksPage.tsx`  
- `aim.link-v2/apps/web/src/pages/ProjectListPage.tsx`  
- `aim.link-v2/apps/web/src/pages/ProjectDetailPage.tsx`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-app-shell.scss`  
- `aim.link-v2/apps/web/src/styles/saas-pc4-project-port.scss`

---

### 2026-04-14（Web：Todos 操作行 Hide 0-file / Hide Canceled 平铺居中）

**User（提示词/原意）**  
- Web 端的两个 hide，不需跟移动端一样收起到浮层，仍应平铺在操作行居中位置。

**Assistant（实现前说明，若有）**  
- `ProjectDetailView` 中 Todos 筛选当前为统一「筛选图标 + Modal」；Web 改为在 `todoFilterCenterSlot` 内联两个 checkbox行，移动端保持图标与浮层。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`：Web 且展示筛选时在中栏渲染 Hide 0-file / Hide Canceled；筛选图标与 `Modal` 仅 `isMobile`；Web 文案字号 12。  
- **验证**：Web 详情 Todos 操作行中间可见两项勾选；移动端仍为漏斗浮层。

**关联**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`

### 2026-04-14（Engagement Info 改税季后顶栏税季不刷新）

**User（提示词/原意）**  
- 在 engagement 详情 Info 页修改税季标签后，页面顶部标签未实时更新。

**Assistant（实现前说明，若有）**  
- Info 内 `ProjectInfoTab` 保存后会 `load()` 仅刷新卡片内状态；顶栏 `detailHeader` 依赖父组件的 `header` / `order` / `clientHeaderForDetail`，与 Realtime 无关时不会立刻重算。拟增加 `onSaved` 回调，在保存成功后由父级轻量拉取 `getOrderById` + `getOrderHeaderForClient` 更新顶栏。

**Assistant（实现后说明 / 本轮结论）**  
- `ProjectInfoTab` 增加可选 `onSaved`；保存 Hero / Classification / SaveAll及封面更新成功后 `await load()` 再 `onSaved`。  
- `ProjectDetailView` 增加 `onProjectInfoSaved` 并传入 `ProjectInfoTab`。  
- `tax-filing/project/[projectId]/index` 与 `firm/engagement/[id]` 实现 `refreshEngagementChrome` 并传入。  
- **验证**：Info 保存税季后无需整页刷新，顶栏税季 pill 应立即一致。

**关联**  
- `vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/info.tsx`  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/index.tsx`  
- `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`

### 2026-04-14（Realtime：除 Web DataTable 列表外尽量全覆盖）

**User（提示词/原意）**  
- 应用内各处，除了 web 端表格视图外，各处内容应都实现 realtime；核查各处并优化到位。

**Assistant（实现前说明，若有）**  
- 盘点已有 `postgres_changes`（收据/发票/库存、事务所 engagements 订单、TaxFilingTodosView 等）。缺口主要在：客户端报税首页列表、项目/订单详情顶栏与 Info、统一 engagement 路由、Line items 列表；并明确 Web 端 `DataTable` 列表不订阅（与费用等页一致），事务所 Engagements/Clients 列表在 Web 上关闭原始终端订阅。抽取共用订阅逻辑到 `engagement-realtime.ts` 减少重复。

**Assistant（实现后说明 / 本轮结论）**  
- 新增 `vouchap-app/src/mobile-ui/lib/engagement-realtime.ts`：`subscribeFirmOrderAndLinkedProject`、`useEngagementOrderProjectRealtime`、`subscribeClientSpaceTaxFilingOrders`、`useClientSpaceTaxFilingListRealtime`。  
- 报税客户端首页（移动 + Web网格/列表）：订阅 `firm.orders`（`client_space_id`）与 `public.projects`（`client_space_id`），防抖刷新列表。  
- `tax-filing/project/[projectId]/index`、`tax-filing/order/[orderId]/index`、`firm/engagement/[id]`：订单 + 关联 project 变更时防抖 `load`/`loadData`；`project/.../info`（ProjectInfoTab）额外订阅以便 Info 卡片与协作同步。  
- `firm/client/[clientSpaceId]`：仅 **非 Web** 且存在 `resolvedClientSpaceId` 时订阅该 client 的 `firm.orders`。  
- `firm/engagements`、`firm/clients`：Realtime 改为 **仅非 Web**（Web DataTable 不订阅）。  
- `receipt-items`：非 Web 下按空间订阅 `receipts` + `receipt_items` 防抖 `load`。  
- 费用/收入/库存列表注释统一为「Web DataTable 不启用」。  
- **验证**：两终端打开同一报税项目，一方改税季/状态，另一方列表与详情应约 300ms 内刷新；Web 事务所 Engagements/Clients 表格不因他人改单自动重排。  
- **残留**：`space-orders`（CRM RPC）、`chat-to-log`、Service Catalog SKU 库等未接 Realtime；若需可再按表加订阅。

**关联**  
- `vouchap-app/src/mobile-ui/lib/engagement-realtime.ts`  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/index.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/index.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/info.tsx`  
- `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`  
- `vouchap-app/src/mobile-ui/app/firm/client/[clientSpaceId].tsx`  
- `vouchap-app/src/mobile-ui/app/firm/engagements.tsx`  
- `vouchap-app/src/mobile-ui/app/firm/clients.tsx`  
- `vouchap-app/src/mobile-ui/app/receipt-items.tsx`  
- `vouchap-app/src/mobile-ui/app/receipts.tsx`（注释）  
- `vouchap-app/src/mobile-ui/app/invoices.tsx`、`inbound.tsx`、`outbound.tsx`（注释）

### 2026-04-14（客户端改税季保存无效：projects UPDATE RLS）

**User（提示词/原意）**  
- 已启动的项目，client 侧手动改税季标签，保存提示 Saved，刷新后标签未改。

**Assistant（实现前说明，若有）**  
- 核对保存链路与读回一致后，定位为 `public.projects` 的 `UPDATE` 策略仅允许 `firm.can_access_order(..., true)`，与已存在的 client 确认插入策略不对称；纯客户成员更新时 PostgREST 常表现为0 行更新且无 error，应用仍 toast Saved。拟补充 RLS 中与 `public_projects_insert` 客户端分支对称的 UPDATE 条件，并在 `updateProject` 用 `select` 校验影响行数。

**Assistant（实现后说明 / 本轮结论）**  
- 新增迁移 `vouchap-app/supabase/migrations/20260414173000_public_projects_update_client_space.sql`：扩展 `public_projects_update` 的 USING / WITH CHECK，允许「所属 client_space 成员 +订单与该 space 一致」的更新（与 insert 客户端路径一致）。  
- `vouchap-app/src/shared-logic/firm.ts` 中 `updateProject`：`.update(...).select('id')`，若返回空数组则返回明确错误，避免静默失败。  
- **验证**：对 processing 订单在客户端 Info 修改 Tax season 年份后刷新应持久；若未跑迁移则应看到权限类错误提示而非假 Saved。  
- **风险**：客户侧现可更新其项目行上凡策略允许的列（与 insert 范围一致）；若需列级收紧可后续拆策略或改用 RPC。

**关联**  
- `vouchap-app/supabase/migrations/20260414173000_public_projects_update_client_space.sql`  
- `vouchap-app/src/shared-logic/firm.ts`

### 2026-04-14（税季默认归属修正：5/1~次年4/30 归前一年）

**User（提示词/原意）**  
- 税季标签默认计算有误：`2025-05-01` 到 `2026-04-30` 启动的，应归属 `2025` 税季。

**Assistant（实现前说明，若有）**  
- 增加统一税季推导函数，替换各页面用 `new Date(...).getFullYear()` 的默认兜底，确保移动端列表、详情页以及创建项目的默认税季写入一致。

**Assistant（实现后说明 / 本轮结论）**  
- 新增统一规则函数：`deriveTaxSeasonYear()`（`vouchap-app/src/shared-logic/tax-season-colors.ts`）：  
  - `5/1 ~ 12/31 => 当年税季`  
  - `1/1 ~ 4/30 => 上一年税季`  
  - 示例：`2026-04-30 => 2025`，`2026-05-01 => 2026`。  
- 已替换默认税季兜底计算位置：  
  - `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`（mobile + web 列表）  
  - `vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/index.tsx`  
  - `vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/index.tsx`  
  - `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`  
  - `vouchap-app/src/shared-logic/firm.ts`（`getOrderYear` 与创建 project 时 `tax_season_year` 兜底）。  
- 已执行 lint 检查，相关文件无新增报错。

**关联**  
- `vouchap-app/src/shared-logic/tax-season-colors.ts`  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/index.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/index.tsx`  
- `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`  
- `vouchap-app/src/shared-logic/firm.ts`

### 2026-04-14（移动端详情顶行再微调：名称跟随税季标签）

**User（提示词/原意）**  
- 详情页顶行，engagement 名称跟随税季标签，不必与 firm 名称对齐。

**Assistant（实现前说明，若有）**  
- 调整 `ProjectDetailHeaderTitle` 的移动端布局，从“左右两列对齐”改为“按行跟随”：第一行税季+名称，第二行状态+firm 名称。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`：  
  - 移动端 `wrapMobile` 改为纵向两行结构；  
  - 第1行：`taxSeason` pill + `engagement title`；  
  - 第2行：`status` pill + `firm subtitle`；  
  - 因此 engagement 名称与税季标签同一行跟随显示，不再与 firm 名称做列对齐。  
- 已执行 lint 检查，无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`

### 2026-04-14（移动端列表标签规格统一：税季与状态同高同字号）

**User（提示词/原意）**  
- 税季标签和状态标签保持一样的高度和字号。

**Assistant（实现前说明，若有）**  
- 调整移动端 engagement 列表的 `taxSeasonPill` 规格，使其与 `statusBadge` 的高度/字号体系一致（同 `paddingVertical` 与相近圆角/内边距）。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`：  
  - `taxSeasonPill` 从 `paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999` 调整为  
    `paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12`；  
  - `taxSeasonText` 原本已为 `fontSize: 12, fontWeight: 600`，与状态标签文字规格一致，保持不变。  
- 已执行 lint 检查，无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`

### 2026-04-14（移动端列表二行对齐：firm 名称紧随状态标签）

**User（提示词/原意）**  
- 列表上的 firm 名称也左端对齐，跟随状态标签。

**Assistant（实现前说明，若有）**  
- 检查 `tax-filing/index.tsx` 的 mobile 列表第二行样式，移除使 `footerText` 右对齐的样式，改为自然跟随 `statusBadge` 左对齐排列。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`：`footerText` 去掉 `marginLeft: 'auto'`，并保留 `flexShrink: 1`，使 `by {firmName}` 紧随状态标签显示且可在窄屏时收缩。  
- 已执行 lint 检查，无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`

### 2026-04-14（移动端列表留白修正：Awaiting 标签仅替换进度条位）

**User（提示词/原意）**  
- 仍有额外高度，`Awaiting firm confirmation` 下方留空较大；应保持卡片高度一致，且标签替换 processing 状态进度条。

**Assistant（实现前说明，若有）**  
- 检查 mobile 列表渲染分支，定位 `awaitingFirmConfirmation` 情况下是否还渲染空的 `actionRow` 占位；改为该状态下不渲染 action 行，仅保留 progress 行中的 awaiting pill。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`：  
  - onboarding 操作区渲染条件调整为 `!awaitingFirmConfirmation`，避免 `actionRow` 空容器造成额外留白；  
  - `Awaiting firm confirmation` 仅占据 progress 区域（即原 processing 进度条位置）。  
- 已执行 lint 检查，无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`

### 2026-04-14（移动端 engagement 列表：Awaiting firm confirmation 进度位 pill 化）

**User（提示词/原意）**  
- 移动端 engagement 列表页，`Awaiting firm confirmation` 也需灰色 pill 样式，居中占据进度条位置。

**Assistant（实现前说明，若有）**  
- 在 `tax-filing/index.tsx` 的 mobile `renderItem` 分支中，将 `awaitingFirmConfirmation` 的纯文本替换为灰色 pill，并保持占位在 progress 行区域且居中。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`：  
  - `awaitingFirmConfirmation` 分支由文本改为 `progressLabelPill` + `progressLabelPillText`；  
  - 进度行增加 `progressRowCentered`，使该 pill 在原进度条位置居中显示。  
- 视觉与 Web 卡片中的灰色 pill 语义一致（灰底、圆角、居中）。  
- 已执行 lint 检查，无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`

### 2026-04-14（移动端详情顶栏二次微调：双列两行严格对齐）

**User（提示词/原意）**  
- 税季标签与状态标签左端对齐成两行，其右分别是 engagement 名称和 firm 名称。

**Assistant（实现前说明，若有）**  
- 继续在 `ProjectDetailHeaderTitle`（移动端分支）调整为明确网格：左列固定两枚标签（税季/状态）上下排列并左对齐；右列固定两行文本（名称/firm）上下对应。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`：  
  - 移动端标题区新增 `wrapMobile + mobileLeftCol + mobileRightCol` 结构；  
  - 左列：第一行税季标签、第二行状态标签（左端严格对齐）；  
  - 右列：第一行 engagement 名称、第二行 firm 名称（与左列两行一一对应）；  
  - 缺省场景加入占位高度，避免两行错位抖动。  
- Web 顶栏结构保持原样。  
- 已执行 lint 检查，无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`

### 2026-04-14（移动端 Engagement 详情：顶栏状态位置与 Todo 筛选浮窗）

**User（提示词/原意）**  
- 移动端 engagement 详情页：  
  1）engagement 状态标签放在顶行 firm 名称左端，与缩小的税季标签成两行（与列表页卡片布局一致）；  
  2）两个 hide 改为一个筛选 icon，点击后浮窗显示两个复选框。

**Assistant（实现前说明，若有）**  
- 仅改 `ProjectDetailView`：  
  - 调整 `ProjectDetailHeaderTitle` 的移动端结构与样式；  
  - 将操作栏中内联的两个 hide 复选项合并为 filter 图标入口；  
  - 新增轻量 modal 承载两个复选框，复用原筛选状态逻辑。

**Assistant（实现后说明 / 本轮结论）**  
- 顶栏（移动端）调整：  
  - 状态标签从 Todos/Info 行移除，放入导航标题第二行；  
  - 第二行布局为「状态标签 + firm 名称」，状态位于名称左端；  
  - 税季标签缩小为 compact 尺寸，与两行标题结构协调。  
- 筛选交互调整：  
  - 原 `Hide 0-file` / `Hide Canceled` 内联显示改为单一 `filter` 图标按钮；  
  - 点击后弹出 `Todo filters` 浮窗，内含两个复选框（状态与原逻辑一致）。  
- 代码文件：`vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`。  
- 已执行 lint 检查，无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`

### 2026-04-14（Engagement 详情二次优化：先渲染后补数 + 减少重复查询）

**User（提示词/原意）**  
- 感知优化有必要按你的思路实现，数据加载本身还需进一步找办法优化。

**Assistant（实现前说明，若有）**  
- 在 `firm/engagement/[id]` 落地两阶段加载：首屏仅依赖最小数据（order）先渲染，次要数据（header/todos/sku）后台补齐；并增加并发与去重，避免重复 `getOrderById`。  
- 同步把 client 侧详情路径中 `getOrderHeaderForClient` 的重复订单查询去掉，并把 onboarding SKU 请求并发化。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`：  
  - 新增两阶段加载（`loading` + `secondaryLoading`）；拿到 `order` 后立即渲染页面，后续数据异步补齐；  
  - 新增加载序列防抖（`loadSeqRef`）防止快速切换时旧请求回写；  
  - 非关键数据失败不再整页阻塞，改 toast 提示；  
  - 增加轻量角标 `Syncing details...` 反馈后台补数状态。  
- `vouchap-app/src/shared-logic/firm.ts`：  
  - `getOrderHeaderForClient(orderId, options)` 支持 `preloadedOrder`，避免重复订单读取。  
- `vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/index.tsx`：  
  - `getOrderHeaderForClient` 复用已加载 order；  
  - onboarding 下 `getSkuItems` 与 `getSkuById` 改并发。  
- `vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/index.tsx`：  
  - `getOrderHeaderForClient` 复用已加载 order。  
- 已完成 lint 检查，以上文件无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/index.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/index.tsx`  
- `vouchap-app/src/shared-logic/firm.ts`

### 2026-04-14（Engagement 详情页加载提速：并发与去重）

**User（提示词/原意）**  
- 打开 engagement 详情页加载速度很慢，需优化避免等待。

**Assistant（实现前说明，若有）**  
- 先定位阻塞点：`firm/engagement/[id].tsx` 的 `loadData` 存在串行请求与重复查询（client 路径下 `getOrderById` 被间接重复调用）。  
- 计划将可独立请求并发化，并让 `getOrderHeaderForClient` 支持复用已加载订单，减少一次重查询。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`：  
  - `getCurrentSpace` 与 `getOrderById` 改为并发请求；  
  - client 角色下调用 `getOrderHeaderForClient(orderId, { preloadedOrder: ord })`，避免重复读取同一订单；  
  - 非 onboarding 场景将 `getProjectDetail` 与 `getProjectTodosTree` 改为并发。  
- `vouchap-app/src/shared-logic/firm.ts`：  
  - `getOrderHeaderForClient` 新增可选参数 `options.preloadedOrder`，优先复用已获取的 `FirmOrderById`。  
- 已完成 lint 检查，修改文件无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`  
- `vouchap-app/src/shared-logic/firm.ts`

### 2026-04-14（Terminate engagement 二次确认改为统一浮窗）

**User（提示词/原意）**  
- terminate engagement 的二次确认，应采用我们设计的浮窗组件，不用系统的 alert。

**Assistant（实现前说明，若有）**  
- 仅替换「Terminate engagement」确认链路，不改 Reject 等其他确认流程；将 `window.confirm` / `Alert.alert` 分支统一为 `showConfirmDestructiveDialog`，确保 Web 与移动端一致走 `ConfirmModalHost`。

**Assistant（实现后说明 / 本轮结论）**  
- 已在以下页面将 terminate 二次确认切换为统一浮窗：  
  - `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`  
  - `vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/index.tsx`  
  - `vouchap-app/src/mobile-ui/app/tax-filing/project/[projectId]/index.tsx`  
- 交互文案保持不变（`Terminate this engagement? You can't undo this.`），确认按钮为 destructive 样式且标签为 `Terminate`。  
- 已完成目标文件 lint 检查，无新增报错。

**关联**  
- `vouchap-app/src/shared-logic/confirmDialog.ts`  
- `vouchap-app/src/mobile-ui/components/ConfirmModalHost.tsx`

### 2026-04-14（Recycle bin 图标与标题垂直对齐微调）

**User（提示词/原意）**  
- icon 需与 Recycle bin 名称垂直对齐。

**Assistant（实现前说明，若有）**  
- 在 `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx` 的 mobile/web 回收站标题行中，检查文字外边距与 icon 样式；通过去除标题底部外边距并给 chevron 做轻量位移，保证视觉垂直居中。

**Assistant（实现后说明 / 本轮结论）**  
- mobile 与 web 的回收站 chevron 都增加 `recycleBinChevron` 样式（`marginTop: 1`），用于修正字体与图标字形基线差异。  
- web 端 `hiddenSectionTitle` 去掉 `marginBottom: 12`，避免标题文本外边距干扰同一行的垂直对齐。  
- 已做 lint 检查，目标文件无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`

### 2026-04-14（Recycle bin 折叠图标位置：跟随标题）

**User（提示词/原意）**  
- engagement 回收站展开/收起 icon 需跟随在 `Recycle bin` 名称之后，不要单独靠右。

**Assistant（实现前说明，若有）**  
- 调整 mobile 与 web 的 recycle bin header 行布局：从两端对齐改为左侧紧凑排列（title + chevron），保持可点击区域不变。

**Assistant（实现后说明 / 本轮结论）**  
- `tax-filing/index.tsx`：  
- mobile：`renderSectionHeader` 内回收站头部从 inline `space-between` 改为 `styles.recycleBinHeaderRow` 左对齐 + 间距；  
- web：`stylesWeb.recycleBinHeaderRow` 同步改为左侧紧凑布局。  
- 现在 icon 紧跟在 `Recycle bin` 文案后显示。

**关联**  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`

---

### 2026-04-14（Awaiting firm confirmation 视觉：灰底 pill + 居中）

**User（提示词/原意）**  
- `Awaiting firm confirmation` 需加与进度条灰色一致底色，显示为 pill，并在卡片上居中。

**Assistant（实现前说明，若有）**  
- 在复用进度位渲染的基础上，将纯文本改为灰底 pill；样式颜色与进度轨道 `#E9ECEF` 对齐，并在 card/list 进度容器中居中布局。

**Assistant（实现后说明 / 本轮结论）**  
- `ProjectListCardAndRow.tsx`：  
- 新增 `progressLabelPill` / `progressLabelPillText` 样式（灰底 `#E9ECEF`）；  
- card 端新增 `cardRowProgressCentered`，在进度区水平居中显示 pill；  
- list 端新增 `listProgressBlockCentered`，同样在右侧进度位居中显示 pill。  
- 数值进度条样式与行为不受影响，仅 `progressLabel` 场景显示 pill。

**关联**  
- `vouchap-app/src/mobile-ui/components/ProjectListCardAndRow.tsx`

---

### 2026-04-14（Awaiting firm confirmation 展示位微调：不覆盖 firm 名称、保持卡片高度）

**User（提示词/原意）**  
- `Awaiting firm confirmation` 需替换进度条位置，不替换原 firm 名称，且卡片高度保持不变。

**Assistant（实现前说明，若有）**  
- Web 共用组件 `ProjectListCardAndRow` 原本只有数值进度条，不支持“纯文案进度位”；临时放到 footer 会覆盖 `By firm`。  
- 计划新增 `progressLabel` 字段，复用原进度容器（cardRowProgress / listProgressBlock）渲染文案，以维持相同布局高度。

**Assistant（实现后说明 / 本轮结论）**  
- `ProjectListCardAndRow.tsx`：新增 `progressLabel`，在“无 action 且无数值进度”时，用原进度区容器显示该文案；列表右侧 `hasRightContent` 也纳入该字段。  
- `tax-filing/index.tsx`（web 映射）：`footerText` 恢复为 `By {firmName}`；将 `Awaiting firm confirmation` 通过 `progressLabel` 输出到进度区。  
- 结果：firm 名称保留，等待文案在原进度条位置显示，卡片/列表高度由原容器维持不变。

**关联**  
- `vouchap-app/src/mobile-ui/components/ProjectListCardAndRow.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`

---

### 2026-04-14（二次修复：详情页 onboarding 动作区与列表区展示位对齐）

**User（提示词/原意）**  
- 新创建单已有部分效果，但仍有问题：  
- 1）详情页内原双按钮位置应显示 `Terminate`；  
- 2）卡片/列表页原双按钮位置（processing 进度条区域）应显示标签 `Awaiting firm confirmation`。

**Assistant（实现前说明，若有）**  
- 定位到 `ProjectDetailView` 的通用动作渲染只支持 onboarding 双按钮或 processing terminate，缺少 onboarding-only-terminate 分支。  
- 列表页 `tax-filing/index.tsx` 里 marketplace onboarding 仍在 action 行渲染按钮，需要改为仅文字标签并放在进度区位置。

**Assistant（实现后说明 / 本轮结论）**  
- `ProjectDetailView.tsx` 新增 `showOnboardingTerminateOnly` 分支：在 onboarding 且无 `onAcceptAndStart` 但有 `onAbort` 时，web 顶栏与 mobile 底部都显示 `Terminate`。  
- `tax-filing/index.tsx`：  
- marketplace onboarding（`requestOrigin=client_marketplace`）不再渲染 action 按钮区；  
- 在原进度区位置显示 `Awaiting firm confirmation`；  
- web 卡片/列表映射同步改为 `action: null` 且 `footerText` 显示该文案。  
- 同时清理了中间引入的无用 `handleTerminateOrder` 分支，避免后续维护混淆。

**关联**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`  
- `vouchap-app/src/shared-logic/firm.ts`

---

### 2026-04-14（修复：详情页 Engagement not found + 列表仍双按钮）

**User（提示词/原意）**  
- 改出问题：卡片/列表仍双按钮；详情页进不去提示 Engagement not found。  
- 卡片/列表进度条区域需显示 `Awaiting firm confirmation`。

**Assistant（实现前说明，若有）**  
- 判断为两类问题：  
- 1）详情页读取 `firm.orders` 新字段时，若 DB 尚未迁移会因列不存在返回空，导致 `Engagement not found`；  
- 2）列表页（mobile/web）尚未按 `requestOrigin=client_marketplace + onboarding` 分支渲染按钮与进度区文案。

**Assistant（实现后说明 / 本轮结论）**  
- `getOrderById` 增加向后兼容 fallback：若新列不存在，自动回退 legacy select，确保详情页可打开。  
- `tax-filing/index.tsx`（mobile/web）新增 `isAwaitingFirmConfirmation(order)`：  
- 该类单在 onboarding 时改为 **单按钮 Terminate**；  
- 原 `Reject + Accept and Start` 仅保留给非该类 onboarding；  
- 进度条区域（无 task 进度时）显示 `Awaiting firm confirmation`。  
- Web 列表映射 `orderToItemWeb` 同步了上述分支。

**关联**  
- `vouchap-app/src/shared-logic/firm.ts`  
- `vouchap-app/src/mobile-ui/app/tax-filing/index.tsx`

---

### 2026-04-14（client 侧 marketplace onboarding 操作按钮改为仅 Terminate）

**User（提示词/原意）**  
- 这类 onboarding 在 client 侧不应再显示 reject / accept and start，应类同 processing 状态显示 terminate。

**Assistant（实现前说明，若有）**  
- 目标仅针对 `request_origin=client_marketplace` 的 onboarding 单；保留其它 onboarding（例如非 marketplace 场景）现有行为。  
- 详情页涉及两处：`/firm/engagement/[id]` 与 `tax-filing/order/[orderId]` 的头部动作区。需补齐 `getOrderById` / client 列表模型中的 `request_origin` 映射。

**Assistant（实现后说明 / 本轮结论）**  
- `firm.ts`：`FirmOrderById`、`getOrderById`、`getClientOrdersForClientSpace` 增加 `requestOrigin/clientConfirmedAt/firmConfirmedAt` 映射。  
- `firm/engagement/[id].tsx`：若 `viewerRole=client && status=onboarding && requestOrigin=client_marketplace`，隐藏 `Reject` / `Accept and Start`，显示 `Terminate`（复用 `onAbort`）。  
- `tax-filing/order/[orderId]/index.tsx`：同条件下，header 右侧从 `Reject + Accept` 改为单个 `Terminate`。  
- **验证**：client 打开 marketplace 创建的 onboarding 单时仅见 `Terminate`；processing 仍为 `Terminate`；其余 onboarding 场景不受影响。

**关联**  
- `vouchap-app/src/shared-logic/firm.ts`  
- `vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`  
- `vouchap-app/src/mobile-ui/app/tax-filing/order/[orderId]/index.tsx`

---

### 2026-04-14（Marketplace 客户自助创建 engagement 需 firm 二次确认）

**User（提示词/原意）**  
- client 端通过 service marketplace 自行创建的 engagement，需要 firm 侧确认后才能进入 processing；client 侧流程不变（浏览 marketplace → 选择并确认 → 同意协议）。

**Assistant（实现前说明，若有）**  
- 新增 `firm.orders` 来源字段区分 `client_marketplace` 与 `firm_manual`；客户端同意后只做 client-confirm 标记，不直接切到 processing。  
- 加 DB 触发器兜底：`client_marketplace` 订单从 onboarding 到 processing 必须由 firm 空间成员执行；并重写 `firm.client_create_onboarding_order_from_published_sku` 写入来源字段。  
- App 侧 `confirmOrderAndCreateProjectTodos` 保持现有入口与调用路径不变，仅改状态推进规则。

**Assistant（实现后说明 / 本轮结论）**  
- 新增迁移：`vouchap-app/supabase/migrations/20260414171000_client_marketplace_requires_firm_confirmation.sql`：  
- `firm.orders` 增加 `request_origin`、`client_confirmed_at`、`firm_confirmed_at`；  
- marketplace RPC 插入订单时写 `request_origin='client_marketplace'`；  
- 新触发器 `firm.enforce_marketplace_order_firm_confirmation`：拦截 client 将 marketplace 单直接改为 processing。  
- App 逻辑：`confirmOrderAndCreateProjectTodos` 在 `client_marketplace + client身份` 场景仅写入 `client_confirmed_at`（保持 onboarding）；firm 再次点击 Start 才推进 processing，并写 `firm_confirmed_at`。  
- UI 文案微调：client 成功后 toast 由 `Engagement accepted` 改为 `Request submitted`。

**关联**  
- `vouchap-app/supabase/migrations/20260414171000_client_marketplace_requires_firm_confirmation.sql`  
- `vouchap-app/src/shared-logic/firm.ts`、`vouchap-app/src/shared-logic/types/index.ts`、`vouchap-app/src/mobile-ui/app/firm/engagement/[id].tsx`

---

### 2026-04-14（更正 itemAlias 语义：保留原始 name，别称独立入库）

**User（提示词/原意）**  
- 指出「item 可读别称」需求应为：原始 item 名称保留识别结果，另拟别称并保存入库，不应替换原始名称。

**Assistant（实现前说明，若有）**  
- 调整方向：把 `itemAlias` 从“可能覆盖 name”改为“独立字段”；补 DB 字段与读写链路（receipt + invoice），确保 name 原样保留。

**Assistant（实现后说明 / 本轮结论）**  
- 语义修正：`resolveReadableItemName` 改为始终保留原始 `name`，仅在识别到可读别称时附带 `itemAlias`。  
- 数据库迁移：新增 `receipt_items.item_alias`、`invoice_items.item_alias`（`20260414170000_add_item_alias_to_receipt_invoice_items.sql`）。  
- 写入链路：`database.ts`（receipt）与 `invoices.ts`（invoice）保存 `item_alias`。  
- 读取链路：`database.ts` 与 `invoices.ts` 返回 `itemAlias` 到前端模型。  
- 转换层：`receipt-helpers.ts` 保留原始 item `name`，并传递 `itemAlias`。  
- 验证：相关改动文件 lint 通过，无新增报错。

**关联**  
- `vouchap-app/supabase/migrations/20260414170000_add_item_alias_to_receipt_invoice_items.sql`  
- `vouchap-app/src/shared-logic/gemini.ts`  
- `vouchap-app/src/shared-logic/receipt-helpers.ts`  
- `vouchap-app/src/shared-logic/database.ts`  
- `vouchap-app/src/shared-logic/invoices.ts`

---

### 2026-04-14（专项优化：Receipt/Invoice 选项匹配、明细别称、Tax Filing 识别完整度）

**User（提示词/原意）**  
- 要求专项优化大模型 prompt，并按结果效果提出三点：  
  1) receipt/invoice 的 items.category 与 attribution 更准确匹配候选列表，降低“按频次排序”造成的偏置；  
  2) 对可读性弱的 receipt item（SKU/缩写）增加可读别称输出；  
  3) tax filing 识别更完整，提升 doc_type 关键词质量与 task 匹配度。  
- 要求分析后直接改代码，并兼顾模型效率与稳定性。

**Assistant（实现前说明，若有）**  
- 方案：优先做“低成本高稳定”改动，不引入额外模型调用轮次。  
- 实施路径：  
  - 在 `gemini.ts` 强化 prompt 指令与输出 schema，并增加轻量后处理（排序去偏、可读名称兜底）；  
  - 在 `types/index.ts` 扩展 `itemAlias` 字段类型；  
  - 在 `receipt-helpers.ts` 兼容 `itemAlias`，在名称疑似编码时优先采用别称；  
  - 在 `tax-filing-recognition-prompt.ts` 与 `tax-filing-recognition-run.ts` 提升 doc_type 识别颗粒度与关键字结构化输出。

**Assistant（实现后说明 / 本轮结论）**  
- 已完成三项优化并落地代码：  
  1. **category/attribution 匹配优化**：  
     - Prompt 增加“语义优先、列表顺序非优先、频次仅弱 tie-breaker”规则；  
     - 候选列表改为去重+字母序（`toUnrankedOptionList`），降低 usage 频次排序诱导。  
  2. **item 可读别称**：  
     - 增加 `itemAlias` 输出约束（receipt/invoice）；  
     - 新增 `resolveReadableItemName` / `looksCrypticItemName`，对编码化 item 名称自动采用可读别称；  
     - `receipt-helpers.ts` 保存前做兼容兜底。  
  3. **tax filing 完整性增强**：  
     - Prompt 强化 doc_type 分层识别规则（辖区+精确表单+变体）；  
     - 输出 schema 增加 `doc_type_keywords`，并要求 `extracted_data` 包含 `document_identity/parties/period/raw_identification_tokens`；  
     - 运行层将 `doc_type_keywords` 归一并回填到 `extracted_data`（若缺失）。  
- 稳定性/效率：未新增模型轮次，仅调整单次提示词与本地轻量后处理，延迟增量可控。  
- 已检查改动文件 lint：无新增报错。

**关联**  
- `vouchap-app/src/shared-logic/gemini.ts`  
- `vouchap-app/src/shared-logic/receipt-helpers.ts`  
- `vouchap-app/src/shared-logic/tax-filing-recognition-prompt.ts`  
- `vouchap-app/src/shared-logic/tax-filing-recognition-run.ts`  
- `vouchap-app/src/shared-logic/types/index.ts`

---

### 2026-04-14（识别类 Prompt 种类盘点：receipt / tax filing 及其他）

**User（提示词/原意）**  
- 追问「我问的是有多少种提示词，比如 receipt 识别和 tax filing 文件识别是分别的，还有否其他的。」

**Assistant（实现前说明，若有）**  
- 无代码变更；在 `vouchap-app/src/shared-logic` 检索所有实际构造 AI prompt 的入口，区分「独立模板」与「同模板多入口（图/文/音/文档）」。

**Assistant（实现后说明 / 本轮结论）**  
- 识别/抽取相关 prompt 可归纳为 9 类：Receipt 主识别、SupplierInfo 补充识别、Invoice 主识别、TaxFiling 结构化识别、Tax task matcher（任务归类）、Inbound 主识别、Outbound 主识别、Inbound/Outbound 文档引导、语音转写（供入/出库语音前置）。  
- 其中存在明显组合关系：如 Receipt=Intro+Rules（图片/文档共用规则）、TaxFiling=Base+Scenario+Context/TaskList/UserInstructions、Inbound/Outbound 文档=DocumentIntro+Rules+Example；语音场景部分是独立 prompt，部分走“先转写后复用文字 prompt”。

**关联**  
- `vouchap-app/src/shared-logic/gemini.ts`  
- `vouchap-app/src/shared-logic/tax-filing-recognition-prompt.ts`  
- `vouchap-app/src/shared-logic/tax-filing-recognition-run.ts`  
- `vouchap-app/src/shared-logic/tax-filing-task-matcher.ts`

---

### 2026-04-14（系统内 Prompt 结构与组合关系分析）

**User（提示词/原意）**  
- 「给我分析一下现在系统内prompt的结构，分多少处提示词，相互之间有否组合？」

**Assistant（实现前说明，若有）**  
- 无代码变更；基于本轮会话注入上下文，按层级梳理提示词来源、优先级与组合执行方式。

**Assistant（实现后说明 / 本轮结论）**  
- 结论：当前会话内可识别为约 7 类提示来源（系统层、开发者工具层、开发者执行规范层、工作区常驻规则层、用户规则层、运行时上下文层、用户当前请求层）。  
- 组合方式并非字符串拼接，而是「分层约束叠加 + 优先级裁决」：高优先级（系统/开发者）约束执行边界，中低层（工作区规则/用户规则）约束风格与项目习惯，运行时上下文动态补充事实，最终由本轮用户请求触发具体任务。
- 已向用户输出结构化说明（含各层作用、冲突时处理顺序、当前会话实例）。

**关联**  
- `docs/PRD-SOURCE-LOG.md`

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

### 2026-04-11（发布应用版本 2.5.7 Build 45）

**User（提示词/原意）**  
- app 版本号更新为 2.5.7。

**Assistant（实现后说明 / 本轮结论）**  
- 按仓库版本同步准则：`package.json` / `package-lock.json` 版本 2.5.7；`app.config.js` 与 Android `versionCode`、iOS `CFBundleVersion` / `CURRENT_PROJECT_VERSION` 统一为 Build **45**；`versionName` / `CFBundleShortVersionString` / `MARKETING_VERSION` 为 **2.5.7**；已更新 `ios/Vouchap.xcodeproj/project.pbxproj`。  
- 提交信息：`发布版本号 2.5.7 (Build 45)`。

**关联**  
- `vouchap-app/package.json`、`app.config.js`、`android/app/build.gradle`、`ios/Vouchap/Info.plist`、`ios/Vouchap.xcodeproj/project.pbxproj`

---

### 2026-04-10（全平台 production 构建：Web 导出 + EAS iOS/Android）

**User（提示词/原意）**  
- 全平台构建 production。

**Assistant（实现前说明，若有）**  
- 无代码变更。在 `vouchap-app` 执行：`NODE_ENV=production npx expo export -p web`；`npx eas build -p all --profile production --non-interactive --no-wait`（提交云端队列，不阻塞等待完成）。

**Assistant（实现后说明 / 本轮结论）**  
- **Web**：`expo export -p web` 成功，产物目录 `vouchap-app/dist/`。  
- **EAS（production）**：Android、iOS 均已上传并排队构建；CLI 显示远程 **autoIncrement**：Android `versionCode` 46→**47**，iOS `buildNumber` 28→**29**（与本地曾提交的 2.5.7 / Build 45 可能不一致，以 EAS/商店侧为准）。  
- **构建日志**：Android https://expo.dev/accounts/aimlink/projects/vouchap/builds/f239a8f6-6bab-4f0f-a3f0-fc4e97dd5d84 ；iOS https://expo.dev/accounts/aimlink/projects/vouchap/builds/ebba0ae5-49e4-44aa-a30f-0d6e523015b9 。  
- **验证**：Web 检查 `dist/`；移动端在 Expo 控制台等待绿勾后下载 artifact。归档体积约 334 MB，后续可考虑 `.easignore` 减小上传。

**关联**  
- `vouchap-app/dist/`、EAS profile `production`

---

### 2026-04-11（Web Expenses：Eric 气泡位置与 Line items 双气泡）

**User（提示词/原意）**  
- Web 端 expenses：关闭聊天右栏后 Eric 头像气泡偏下，触摸出现输入区时头像跳动；进入 line items 列表后两个头像气泡重叠。

**Assistant（实现前说明，若有）**  
- 根因 1：`receipt-items` 页内嵌 `WebChatFab embedded`，但 `_layout` 仅排除 `/receipts`，未排除 `/receipt-items`，全局绝对定位 FAB 仍渲染 → 双气泡。  
- 根因 2：嵌入式 `fabContainerWeb` 为 80×80、bottom/right 40，而 `WebChatFab` 实际为 100×100 且展开态头像锚点为 bottom 52 → 折叠态视觉更靠下，悬停展开时头像上移跳动。  
- 计划：`_layout` 增加 `receipt-items` 排除；导出 `WEB_CHAT_FAB_*` 常量，`receipts` / `receipt-items` / `invoices` 的 `fabContainerWeb` 与组件内边距一致。

**Assistant（实现后说明 / 本轮结论）**  
- 已改：`_layout.tsx` 条件增加 `!pathname?.startsWith('/receipt-items')`；`WebChatFab.tsx` 导出 `WEB_CHAT_FAB_SIZE` / `WEB_CHAT_FAB_BOTTOM` / `WEB_CHAT_FAB_RIGHT`；三处列表页 `fabContainerWeb` 使用该常量。  
- **验证**：Web 在 `/receipts` 关右栏 → 悬停 FAB，头像与展开态对齐无跳变；进入 `/receipt-items` 仅单气泡。

**关联**  
- `vouchap-app/src/mobile-ui/app/_layout.tsx`、`WebChatFab.tsx`、`receipts.tsx`、`receipt-items.tsx`、`invoices.tsx`

---

### 2026-04-11（核实 App Store 图标：app.config 的 logo2 vs 裸工程原生资源）

**User（提示词/原意）**  
- 新 production 构建在 App Store 发布仍显示旧 logo；核实是否已正确替换为 logo2 用于 build。

**Assistant（实现前说明，若有）**  
- `app.config.js` 的 `icon` / `android.adaptiveIcon.foregroundImage` 已指向 `./assets/logo2.png`，但存在裸 `ios/`、`android/` 时 EAS/Xcode 实际打包 **Images.xcassets AppIcon** 与 **mipmap**，与 `expo.icon` 可脱节。  
- 核对：`App-Icon-1024x1024@1x.png` 与 `assets/icon.png` 哈希一致，均**非** logo2（旧图）。

**Assistant（实现后说明 / 本轮结论）**  
- 已从 `assets/logo2.png` 用 ImageMagick 生成 1024×1024 RGB PNG，覆盖 `ios/…/AppIcon.appiconset/App-Icon-1024x1024@1x.png`，并同步 `assets/icon.png`、`src/mobile-ui/assets/icon.png`。  
- 已按各 density 从 logo2 重生成 Android `ic_launcher_foreground.webp`、`ic_launcher.webp`、`ic_launcher_round.webp`（mipmap-mdpi 至 xxxhdpi）。  
- `app.config.js` 增加简短注释说明裸工程以原生资源为准。  
- **验证**：重新 EAS `production` iOS 构建并提审；App Store Connect 图标更新可能有缓存延迟。若 logo2 需透明底而非白底，需改 magick 参数后重做 iOS 1024。

**关联**  
- `vouchap-app/app.config.js`、`assets/logo2.png`、`assets/icon.png`、`ios/Vouchap/Images.xcassets/AppIcon.appiconset/`、`android/app/src/main/res/mipmap-*`

---

### 2026-04-13（Firm/Client 订阅与识别配额：实现方案分析，待确认后开发）

**User（提示词/原意）**  
- 开发版本控制与订阅定价：Firm $99/年含 50 engagements，分档增购单价；Client 月 10 次识别，超出 $0.1/credit；与 firm 有关联 engagement 且 processing 的 client 月上限 100 次；控制需在 CRM 可通过订单配置。要求先分析实现方案，讨论确定再动手。

**Assistant（实现前说明，若有）**  
- 无代码变更；对照 `vouchap-crm/sql/crm-schema.sql`（`sku_edition`、`sku_addon`、`space_orders`）、`crm-sku-seed.sql`、`SpaceOrders.tsx` 评估与目标定价的缺口。

**Assistant（实现后说明 / 本轮结论）**  
- 交付：中文方案分析（数据模型、CRM 配置方式、运行时 enforcement、与 Stripe 分期、待澄清业务规则）。待用户确认歧义后再实现。

**关联**  
- `vouchap-crm/sql/crm-schema.sql`、`crm-sku-seed.sql`、`src/pages/SpaceOrders.tsx`

---

### 2026-04-13（Firm/Client 订阅与识别配额：歧义确认后落地实现）

**User（提示词/原意）**  
- 整包定价；processing 关联时每月 100 次封顶（含 included与 credit）；失败不计入、重试成功计入；processing 按现有系统逻辑；space 单角色。按先前5 步计划直接改代码。

**Assistant（实现前说明，若有）**  
- DB：`crm` 扩展 `sku_edition.price_yearly`、`space_orders.metadata`；新表 `client_recognition_monthly_usage`、`space_billing_state`；RPC `get_client_recognition_quota`、`record_client_recognition_success`、`assert_firm_can_create_engagement`、`user_may_act_for_client_space`；触发器按 `metadata.recognition_credits_added` 加 credit；`firm.client_create_onboarding_order_from_published_sku` 内调用 firm 容量断言。种子 `FIRM_ANNUAL`/`CLIENT_SUB` 与整包 addon。  
- CRM：`SpaceOrders` 新建订单可选 metadata 字段；`Skus` 展示年价；`crm-schema`/`crm-sku-seed` 同步。  
- App：`client-recognition-quota.ts`；`createFirmOrder` 前 assert；报税附件/聊天/语音/收据与入出库处理链路在成功识别后 `record`，关键路径预检 `assert`；`getProjectTodoAttachmentWithContext` 增加 `clientSpaceId`。

**Assistant（实现后说明 / 本轮结论）**  
- 已提交上述迁移（`vouchap-app/supabase/migrations/20260413140000_*`、`20260413141000_*`）、CRM 与 `vouchap-app` 联动改动。Client 侧仅当存在有效 `CLIENT_SUB` 的 `space_orders` 时 enforcement；否则与旧空间行为一致。Firm 侧仅当存在 `FIRM_ANNUAL` 时限制新建 `firm.orders`（非 cancelled、非 completed 计数 + metadata 增购槽位）。  
- **验证**：Supabase 执行迁移与种子；CRM 为客户空间建 `CLIENT_SUB`、为 firm 空间建 `FIRM_ANNUAL` 并设 metadata；客户端走 chat-to-log / 报税附件识别，观察 `client_recognition_monthly_usage` 与 `space_billing_state`；超额与无 credit 应返回英文提示（部分 UI 为 `Limit: …`）。新建 engagement 超限时 `createFirmOrder` / client catalog RPC 应失败。  
- **残留**：Stripe 自助下单未接；`record` 与 AI 成功之间极端竞态下偶发「已识别成功但 record 失败」未做回滚；CRM 订单列表未展示 metadata 列。

**关联**  
- `vouchap-app/supabase/migrations/20260413140000_crm_subscription_quotas_client_firm.sql`、`20260413141000_crm_seed_firm_client_subscription_skus.sql`  
- `vouchap-app/src/shared-logic/client-recognition-quota.ts`、`firm.ts`、`tax-filing-attachment-followup.ts`、`receipt-processor.ts`、`inbound-processor.ts`、`outbound-processor.ts`、`chat-to-log.tsx`、`TaxFilingTodosView.tsx`  
- `vouchap-crm/sql/crm-schema.sql`、`crm-sku-seed.sql`、`src/pages/SpaceOrders.tsx`、`Skus.tsx`

---

### 2026-04-13（Space information：订单管理入口与页面）

**User（提示词/原意）**  
- space information 中需要增加订单管理的入口和页面。

**Assistant（实现前说明，若有）**  
- `crm.space_orders` 对 App 用户无 SELECT（RLS 仅 ops），需新增 `SECURITY DEFINER` RPC：校验 `public.user_spaces` 成员后返回该 space 的订单列表（含 SKU code/name、状态、起止与创建时间、source、metadata）。  
- App：`@/lib/space-orders.ts` 调用 RPC；新路由 `space-orders`；在 `management`的 Space Information 区块下增加与菜单一致的入口行；`space-manage` 增加跳转卡片；`_layout` 注册屏幕并将 `space-orders` 纳入 Web 侧「设置页」chat 气泡隐藏列表。

**Assistant（实现后说明 / 本轮结论）**  
- 迁移：`vouchap-app/supabase/migrations/20260413142000_crm_list_space_orders_for_member.sql`（`crm.list_space_orders_for_space_member`、`GRANT EXECUTE` 给 `authenticated`）。  
- 页面：`src/mobile-ui/app/space-orders.tsx`（英文文案，列表展示订单与 metadata 摘要，支持下拉刷新）。  
- 入口：`management.tsx`、`space-manage.tsx`；`_layout.tsx` 标题「Order management」。  
- **验证**：部署迁移后，以空间成员账号打开 Management → Order management，应能看到该 space 的 `crm.space_orders` 列表；非成员或非当前 space 的 id 调用 RPC 应返回空集。  
- **残留**：仅列表只读；支付/续费仍走 CRM 或后续自助流程。

**关联**  
- `vouchap-app/supabase/migrations/20260413142000_crm_list_space_orders_for_member.sql`  
- `vouchap-app/src/shared-logic/space-orders.ts`、`src/mobile-ui/app/space-orders.tsx`、`management.tsx`、`space-manage.tsx`、`src/mobile-ui/app/_layout.tsx`

---

### 2026-04-13（CRM 既有 SKU 查询与计费模式整合说明）

**User（提示词/原意）**  
- 查询 CRM 中此前设计的 SKU，整合计费模式。

**Assistant（实现前说明，若有）**  
- 无代码变更；阅读 `vouchap-crm/sql/crm-schema.sql`、`crm-order-design.md`、`crm-sku-seed.sql` 及 `vouchap-app/supabase/migrations/20260413141000_crm_seed_firm_client_subscription_skus.sql`，归纳订单生效规则、通用 VCH 档位、增购包与 Firm/Client 订阅层。

**Assistant（实现后说明 / 本轮结论）**  
- 见对用户回复正文：**统一计费骨架**（`space_orders` → `sku_edition` + 可选 `metadata` / `sku_addon`）+ **两套并行产品线**（①通用客户档位 VCH_* 以凭证/月与模块为主；② Firm/Client 以年费 engagement与 AI 识别配额/credit 为主）。并注明 `CLIENT_SUB` 标价在种子中为 NULL、由 CRM/运营配置；Firm 增购槽位与 Client credit 依赖 `space_orders.metadata`。

**关联**  
- `vouchap-crm/sql/crm-order-design.md`、`crm-sku-seed.sql`、`crm-schema.sql`

---

### 2026-04-13（计费收敛：仅 Firm 年费+engagement credit / Client 免费+credit 增购 / 签约赠送 credit）

**User（提示词/原意）**  
- 去掉之前的计价，只保留：1）firm 年费 + engagement credit；2）client 基础 credit（免费）+ 增购 credit；3）firm 签约 client 的增量 credit。

**Assistant（实现前说明，若有）**  
- 移除 VCH 档位与旧 addon 目录依赖；`CLIENT_SUB` 不再作为识别 enforcement 开关。  
- DB：迁移重写 `assert_firm_can_create_engagement`（`engagement_credits_included` + `metadata.engagement_credits_added`，兼容旧 `engagements_included` / `engagement_addon_slots`）、`get_client_recognition_quota` / `record_client_recognition_success`（client 一律 enforcement，included 来自 `CLIENT_RECOGNITION_BASE`）；新增 `firm.orders` 触发器按 `FIRM_CLIENT_SIGNING_BONUS` 在首单时给 client 加 recognition credits；`on_space_created` 去掉 VCH_TRIAL 订单。  
- 种子：`crm-sku-seed.sql`、`crm-schema.sql` 区块 8、`crm-app-integration.sql`；CRM `SpaceOrders` 写 `engagement_credits_added` 并隐藏目录-only SKU；文档 `crm-order-design.md`、`crm-space-orders-trial-bulk.sql` 标注废弃。

**Assistant（实现后说明 / 本轮结论）**  
- 迁移：`vouchap-app/supabase/migrations/20260413143000_crm_billing_model_firm_client_credits.sql`（含 catalog 清理/重建，删除未引用的 VCH/CLIENT_SUB 等 edition 行；addon 改为 ENGAGEMENT_CREDITS_REF / CLIENT_RECOGNITION_CREDITS_REF参考包，标价 0）。  
- **行为变化**：所有 client 空间均走识别配额；新注册空间不再自动插入试用 `space_orders`。  
- **验证**：应用迁移后检查 `sku_edition` 仅含新模型相关 code；建 `FIRM_ANNUAL` 订单后 engagement 上限；client 识别超 included 需 credit；首条 `firm.orders`（某 firm+client）应增加 `space_billing_state`。  
- **残留**：主应用若仍有基于 VCH 的凭证/月模块 gating，需另行下线或改读新目录（本任务未全库搜索）。

**关联**  
- `vouchap-app/supabase/migrations/20260413143000_crm_billing_model_firm_client_credits.sql`  
- `vouchap-crm/sql/crm-sku-seed.sql`、`crm-schema.sql`、`crm-app-integration.sql`、`crm-order-design.md`、`src/pages/SpaceOrders.tsx`  
- `vouchap-app/src/shared-logic/client-recognition-quota.ts`

---

### 2026-04-13（VCH_TRIAL 仍存原因说明 + 清理迁移与 CRM 标价展示）

**User（提示词/原意）**  
- VCH_TRIAL 还在，是什么逻辑；其他 SKU 定价都显示免费是否有问题。

**Assistant（实现前说明，若有）**  
- 143000 删除 VCH_* 的条件是 **无 space_orders 引用**；历史注册试用订单仍指向 VCH_TRIAL 时会阻止删除。CRM「月价」列对 `NULL` 显示「免费」会把 **仅年付**（FIRM_ANNUAL）与 **目录策略行**（无标价）误导成免费。

**Assistant（实现后说明 / 本轮结论）**  
- 新增迁移 `20260413144000_crm_drop_legacy_vch_orders_then_skus.sql`：先删指向 VCH_* / CLIENT_SUB 的 `space_orders`，再删对应 `sku_edition`（会丢掉旧订单历史行，计费已不再依赖）。  
- `Skus.tsx`：月价无值改显示「—」；年价列统一「—」；addon 价0 显示为 reference/quote。  
- **验证**：跑迁移后 `sku_edition` 无 VCH_TRIAL；FIRM_ANNUAL 年价列仍为 USD 99。

**关联**  
- `vouchap-app/supabase/migrations/20260413144000_crm_drop_legacy_vch_orders_then_skus.sql`、`vouchap-crm/src/pages/Skus.tsx`

---

### 2026-04-14（Todo 筛选：锚定图标展开，点击空白关闭）

**User（提示词/原意）**  
- 筛选浮窗不要居中 alert；在 icon 位置直接展开；不要 Done 按钮和标题；点击页面其他位置即关闭。

**Assistant（实现前说明，若有）**  
- 在 `ProjectDetailView` 用 `measureInWindow` 记录筛选按钮屏幕坐标，将菜单 `absolute` 定位在图标下方（右缘与图标对齐并做屏幕边界夹紧）；全屏半透明 `Pressable` 仅负责点击关闭。

**Assistant（实现后说明 / 本轮结论）**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`：移除居中卡片、标题与 Done；新增 `todoFilterPopover` 锚点布局；筛选按钮外包 `View ref + collapsable={false}` 保证测量稳定；再次点击图标可关闭。  
- 已执行 lint，无新增报错。

**关联**  
- `vouchap-app/src/mobile-ui/components/ProjectDetailView.tsx`

---

### 2026-04-17（aim.link-v2：本地启动 Web 开发/测试服务）

**User（提示词/原意）**  
- aim.link-v2 测试服务器跑起来。

**Assistant（实现前说明，若有）**  
- 无 Vouchap 代码变更。在 **`/Users/macbook/aim.link-v2`** 根目录执行 **`npm run dev`**（workspace → **`apps/web`** 的 **Vite**），后台进程便于本机浏览器访问。

**Assistant（实现后说明 / 本轮结论）**  
- 服务已就绪：**`http://localhost:5173/`**；终端可能出现 **Sass legacy-js-api** 弃用警告，不影响当前开发访问。若需局域网访问可加 **`--host`**。  
- **验证**：本机浏览器打开上述地址。

**关联**  
- `aim.link-v2/package.json`、`aim.link-v2/apps/web/package.json`

---

### 2026-04-17（aim.link-v2：/signin 密码标签与校验提示对齐、底栏 Sign up 顺序）

**User（提示词/原意）**  
- password tag 应始终跟输入框垂直对齐，即使有错误提示时。  
- 这个页面的 Sign up 要放 don’t 问句之后。

**Assistant（实现前说明，若有）**  
- 无 Vouchap 代码变更。拟在 **`aim.link-v2`**：**`login-panel.scss`** 调整 **`aimlink-login-panel-user-field`** / **`user-label`**；**`AuthLoginPanel`** 底栏结构 + **`tips-signup`** 样式，抵消 **`header-tips-resend`** 的 **`float: left`**。

**Assistant（实现后说明 / 本轮结论）**  
- **`user-field`**：**`align-items: flex-start`**；**`user-label`**：**`padding-top`** 与输入行对齐。  
- 底栏：**`tips-signup`** + **`tips-signup-lead`**，问句在 **`Sign up`** 前且问句不为链接蓝。  
- **`docs/PRD.md`**、**`docs/PROMPTS-LOG.md`**（**aim.link-v2**）已同步。  
- **验证**：**`npm run typecheck`**（**aim.link-v2**）；浏览器 **/signin** 人工看布局与底栏顺序。

**关联**  
- `aim.link-v2/apps/web/src/styles/login-panel.scss`  
- `aim.link-v2/apps/web/src/pages/AuthLoginPanel.tsx`  
- `aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/PROMPTS-LOG.md`

---

### 2026-04-17（aim.link-v2：/signin 占位符刷新与失焦不闪动）

**User（提示词/原意）**  
- 用户名和密码输入框内的预填文字，在刷新页面和点击页面空白时，会变化大小和闪动。

**Assistant（实现前说明，若有）**  
- 无 Vouchap 代码变更。拟在 **`aim.link-v2`** 的 **`login-form-native.scss`** 覆盖 Ant Design 默认 **`transition: all`**，统一 **`.ant-input-affix-wrapper`** 与内层字号，并处理 **autofill** 字阶。

**Assistant（实现后说明 / 本轮结论）**  
- 已收窄登录表单 **`Input` / `Input.Password`** 相关 **`transition`**，为 **affix wrapper** 设置与内层一致的 **`font-size` / `line-height`**，占位符 **`transition: none`**，**`-webkit-autofill`** 锁定字阶。  
- **`aim.link-v2`** 的 **`docs/PRD.md`**、**`docs/PROMPTS-LOG.md`** 已同步。  
- **验证**：**`npm run typecheck`**；浏览器 **/signin** 刷新与失焦目测。

**关联**  
- `aim.link-v2/apps/web/src/styles/login-form-native.scss`  
- `aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/PROMPTS-LOG.md`

---

### 2026-04-17（aim.link-v2：/signin 对齐与居中贴近原设计稿）

**User（提示词/原意）**  
- 原设计的对齐和居中方式更美观一点（附图）。

**Assistant（实现前说明，若有）**  
- 无 Vouchap 代码变更。拟在 **`aim.link-v2`**：登录行改 **栅格**（标签列 + 主输入列）、**Forgot** 与输入左对齐、**divider** 与主列同宽、**`AuthLoginPanel`** 登录态 **user** 宽度 **400px**。

**Assistant（实现后说明 / 本轮结论）**  
- **`AuthLoginPanel`**：**`user-labelCell` / `user-control` / `user-forgotRow`**；**Forgot** 去 **float**。  
- **`login-panel.scss`**：**Grid**、**CSS 变量**、**`user > divider` 100%**；**`&-user` 宽 400**。  
- **`docs/PRD.md`**、**`PROMPTS-LOG.md`** 已同步。  
- **验证**：**`npm run typecheck`**；**/signin** 目视。

**关联**  
- `aim.link-v2/apps/web/src/pages/AuthLoginPanel.tsx`  
- `aim.link-v2/apps/web/src/styles/login-panel.scss`  
- `aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/PROMPTS-LOG.md`

---

### 2026-04-17（aim.link-v2：/signin 对照说明 + 修复 Form explain 被 height:0 压没）

**User（提示词/原意）**  
- 截图给了仍不到位；问刚三个问题都改成什么了。

**Assistant（实现前说明，若有）**  
- 无 Vouchap 业务代码变更。复查 **`aim.link-v2`** **`login-panel.scss`** 中 **`.ant-form-item-explain`** 层叠。

**Assistant（实现后说明 / 本轮结论）**  
- 移除 **`height:0 !important`** 相关规则，**`.aimlink-login-panel-user .ant-form-item-explain`** 改为 **`auto`**；**`PROMPTS-LOG`** 追加用户对照说明条。  
- **验证**：**/signin** 密码校验文案应正常显示。

**关联**  
- `aim.link-v2/apps/web/src/styles/login-panel.scss`、`aim.link-v2/docs/PROMPTS-LOG.md`

---

### 2026-04-17（aim.link-v2：/signin 与用户 1:2 图对位 — Forgot、输入、标题、底栏）

**User（提示词/原意）**  
- 1 图为当前效果，2 图为希望的原版效果，问能否对比出来。

**Assistant（实现前说明，若有）**  
- 无 Vouchap 代码变更。对比后拟修 **`tips-forgot`** BEM 选择器、输入垂直居中、标题与页签 **`Log In`**、底栏无 **`?` 与 Sign up 之间空隙**。

**Assistant（实现后说明 / 本轮结论）**  
- **`aim.link-v2`**：**`login-panel.scss`**、**`login-form-native.scss`**、**`AuthLoginPanel.tsx`**、**`document-meta.ts`**、**`index.html`**、**`SignInPage.tsx`**、**`docs/PRD.md`**、**`PROMPTS-LOG.md`**、**`README.md`**。  
- **验证**：**`npm run typecheck`**。

**关联**  
- `aim.link-v2/apps/web/src/styles/login-panel.scss`  
- `aim.link-v2/apps/web/src/styles/login-form-native.scss`  
- `aim.link-v2/apps/web/src/pages/AuthLoginPanel.tsx`  
- `aim.link-v2/apps/web/src/lib/document-meta.ts`、`apps/web/index.html`  
- `aim.link-v2/docs/PRD.md`、`aim.link-v2/docs/PROMPTS-LOG.md`、`aim.link-v2/apps/web/README.md`

---

### 2026-04-18（Vouchap：小票 item_alias 识别与写库 — 兼容模型 snake_case）

**User（提示词/原意）**  
- 识别小票的 `item_alias` 字段并没有识别和写库。

**Assistant（实现前说明，若有）**  
- 排查链路：**Gemini 解析** `resolveReadableItemName` 与 **`convertGeminiResultToReceipt`** 仅读取 **`itemAlias`（camelCase）**；若模型返回 **`item_alias`** 等 snake_case，别名在解析阶段丢失，**`database.ts` 插入的 `item_alias` 恒为 null**。拟在 **`gemini.ts`** 集中规范化别名来源，并在 **`receipt-helpers.ts`**（receipt/invoice 转换）做相同兜底。

**Assistant（实现后说明 / 本轮结论）**  
- **`gemini.ts`**：新增 **`normalizedItemAliasFromModel`**，在 **`resolveReadableItemName`** 中合并 **`item_alias` / `display_name` / `readable_name`** 等与税字段一致的命名兼容。  
- **`receipt-helpers.ts`**：新增 **`pickItemAliasFromModelItem`**，**`convertGeminiResultToReceipt`** 与 **`convertGeminiResultToInvoice`** 写入行项时统一取别名。  
- **验证建议**：走一遍拍照识别，在 Supabase **`receipt_items.item_alias`** 或 App 明细中确认非空；若远端未跑迁移 **`20260414170000_add_item_alias_to_receipt_invoice_items.sql`**，插入仍可能报错或列不存在，需单独部署 DB。  
- **残留风险**：若模型把可读名称只写在其它未约定字段，仍可能不落别名。

**关联**  
- `vouchap-app/src/shared-logic/gemini.ts`  
- `vouchap-app/src/shared-logic/receipt-helpers.ts`  
- `vouchap-app/supabase/migrations/20260414170000_add_item_alias_to_receipt_invoice_items.sql`

---

### 2026-04-18（Vouchap：小票 item_alias 覆盖率与可读性 — 解析启发式 + 提示词）

**User（提示词/原意）**  
- 部分有写入了，但正确性和可读性明显还是不足；有部分仍然为空。

**Assistant（实现前说明，若有）**  
- 空值：模型未产出或产出在非约定字段；**仅 camelCase `itemAlias`** 时部分场景已修，但仍会漏 **`description` / `lineDescription` 等作可读说明** 与 **`productName` / `label`** 等键。  
- 可读性：**提示词**对 `itemAlias` 仍偏「可选」，示例行不像真实 SKU。  
- 拟新增 **`receipt-item-alias.ts`** 统一 **`pickReceiptLineItemAlias`**（多键 + 当 **`name` 像代码** 时用 **`description` 类字段** 作别名）与 **`aliasDistinctFromLineName`**（去重、**过滤像金额的字符串**）；**`gemini.ts`** / **`receipt-helpers.ts`** 共用；收紧 **`RECEIPT_JSON_ITEMS_RULE`** 与示例。

**Assistant（实现后说明 / 本轮结论）**  
- 新模块 **`vouchap-app/src/shared-logic/receipt-item-alias.ts`**：**显式别名键**扩展；**代码行名**时从 **description / details / memo / notes** 等提升为别名；**与行名相同**或**疑似纯金额**的别名丢弃。  
- **`gemini.ts`**：`resolveReadableItemName` 改为调用上述逻辑；**`RECEIPT_JSON_ITEMS_RULE`**、**规则 8 子条**、**`RECEIPT_JSON_ITEMS_EXAMPLE`**、**文字识别 Output JSON** 说明已加强。  
- **`receipt-helpers.ts`**：小票/发票行项 **`itemAlias`** 与 **`itemName`** 对齐去重。  
- **验证**：`npx tsc --noEmit`；实机多类小票（纯数字行、SKU、双语小票）看 **`item_alias`** 是否仍大量为空。  
- **残留**：模型完全不返回可读语义且行上无第二描述时，**无法凭空编造**别名；若需更高覆盖只能接受 **二次 LLM 精炼** 或 **人工规则库**（未做）。

**关联**  
- `vouchap-app/src/shared-logic/receipt-item-alias.ts`  
- `vouchap-app/src/shared-logic/gemini.ts`  
- `vouchap-app/src/shared-logic/receipt-helpers.ts`

---

### 2026-04-18（Vouchap：移除小票行 `tax_class_code` 及行级拆税依赖）

**User（提示词/原意）**  
- 清理 **`tax_class_code`** 相关代码与数据库各表字段；原行级拆税方案有问题。（续作：补全 **`receipt-item-tax.ts`** 等残留。）

**Assistant（实现前说明，若有）**  
- 此前已新增迁移 **`20260418140000_drop_receipt_items_tax_class_code.sql`** 及 **`database.ts` / `types` / `receipt-helpers` / `gemini`** 侧去掉行字段与模型字段。  
- 本轮：**`receipt-item-tax.ts`** 去掉对 **`receipt_items.tax_class_code`** 的 select、行覆盖逻辑、POS 命中与 **receipt.tax fit** 后的回写；**`getApplicableTaxRules`** 去掉 **`lineTaxClassOverride`**，仅 **POS 规则解析类 + 默认 `STANDARD_TAXABLE`**；**`LineMeta`** 去掉 **`fromLineOverride` / `lineTaxClassFromModel`**；实体 POS 学习条件收紧为 **fit 后或非默认可税类**；**`gemini.ts`** 文字识别 Output JSON 行说明补 **`posTaxCode optional`**。

**Assistant（实现后说明 / 本轮结论）**  
- 行税计算与对账不再读写 **`public.receipt_items.tax_class_code`**；CRM 维度的 **`tax_class_code` / `maps_to_tax_class_code`**（税率表、POS 规则）保留。  
- **验证**：部署迁移后跑一笔识别 → **`applyReceiptItemTaxesAndReconcile`** 无列不存在错误；`grep vouchap-app` 无 **`receipt_items`** 侧 **`tax_class_code`** 写入。全仓 **`npx tsc --noEmit`** 仍有大量历史无关错误，**`receipt-item-tax.ts`** 本轮无新增报错。  
- **残留**：未改 **vouchap-crm** 等独立仓库中的税类目录命名。

**关联**  
- `vouchap-app/supabase/migrations/20260418140000_drop_receipt_items_tax_class_code.sql`  
- `vouchap-app/src/shared-logic/receipt-item-tax.ts`  
- `vouchap-app/src/shared-logic/gemini.ts`

---

### 2026-04-18（Vouchap：删列后旧构建「认不出 item」— 原因与是否需发版）

**User（提示词/原意）**  
- 移除该字段后此前构建的 app 识别不出 item，问原因；是否需要马上更新构建。

**Assistant（实现前说明，若有）**  
- 无代码变更。对照当前 **`database.ts`** 插入字段与 **Supabase/PostgREST** 对未知列的行为说明。

**Assistant（实现后说明 / 本轮结论）**  
- **原因**：若远端已执行 **`DROP COLUMN receipt_items.tax_class_code`**，**旧版 bundle** 仍可能在 **`receipt_items` insert/update** 中带 **`tax_class_code`**，API 会报错，**行项写库失败**，表现像「识别不出」实为 **持久化失败**；**`select receipt_items(*)`** 不因缺列而失败。  
- **是否马上更新**：远端已删列则 **需要尽快发版/OTA** 到已去掉该字段payload 的构建；或临时 **加回可空列** 作过渡（不推荐长期）。建议在 Supabase 日志或客户端 **`Receipt items insert error`** 中确认是否为 **unknown column**。  
- **若未跑删列迁移**：旧构建应仍能写列，需另查 **`item_alias`** 等其它迁移与 RLS。

**关联**  
- `vouchap-app/supabase/migrations/20260418140000_drop_receipt_items_tax_class_code.sql`  
- `vouchap-app/src/shared-logic/database.ts`（`receipt_items` insert 已不再含 `tax_class_code`）

---

### 2026-04-18（Vouchap：拆税与写库解耦 — 队列入队 + 后台 worker）

**User（提示词/原意）**  
- 拆税流程与数据库希望不影响已有前端功能与前端所需数据的写库；解耦成纯后端独立流程。

**Assistant（实现前说明，若有）**  
- 原状：**`database.ts`** 在保存小票后 **`queueMicrotask`** 内联调用 **`applyReceiptItemTaxesAndReconcile`**（虽 try/catch 不阻塞保存，仍在用户设备上跑 CRM/行税写库，与「纯后端」不符）。  
- 拟：**保存路径**仅 **`rpc('enqueue_receipt_tax_reconcile')`**；新增表 **`receipt_tax_recalc_queue`**；**`scripts/receipt-tax-queue-worker.ts`**（**service role**）轮询队列并调用既有 **`applyReceiptItemTaxesAndReconcile` + `scheduleReceiptTaxRecalcIfNeeded`**。

**Assistant（实现后说明 / 本轮结论）**  
- 迁移 **`20260418150000_receipt_tax_recalc_queue.sql`**：**`receipt_tax_recalc_queue`** + **`enqueue_receipt_tax_reconcile`**（校验 **`auth.uid()`** 与 **`user_spaces`**）。  
- **`receipt-tax-queue-client.ts`**、**`database.ts`**：保存/更新小票后只 **入队**，不再在客户端执行拆税。  
- **`package.json`**：`receipt-tax-worker` / `receipt-tax-worker:once`。  
- **运维注意**：必须部署该迁移并在服务端配置 **`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`** 定时跑 **`npm run receipt-tax-worker`**（或等价调度），否则行税与对账列可能长期不更新；前端 **`receipts` / `receipt_items` 主数据写库**不受影响。  
- **验证**：跑迁移 → 保存小票 → 队列有行 → worker 跑后 **`receipt_item_taxes` / `tax_reconciliation_*`** 更新。

**关联**  
- `vouchap-app/supabase/migrations/20260418150000_receipt_tax_recalc_queue.sql`  
- `vouchap-app/src/shared-logic/receipt-tax-queue-client.ts`  
- `vouchap-app/src/shared-logic/database.ts`  
- `vouchap-app/scripts/receipt-tax-queue-worker.ts`  
- `vouchap-app/package.json`  
- **接续说明（通俗运维 + 演进备忘）**：`docs/RECEIPT-TAX-ASYNC-PIPELINE.md`

---

### 2026-04-18（Vouchap：拆税异步流水线 — 补文档便于接续）

**User（提示词/原意）**  
- 没听懂先前「运维注意点」；要求自己记好文档，后续进一步设计开发拆税时能接续得上。

**Assistant（实现前说明，若有）**  
- 无业务逻辑变更。新增结构化说明文档，用表格/简图把 **App 只入队、worker 才算税** 与 **不跑 worker 的后果** 写清楚。

**Assistant（实现后说明 / 本轮结论）**  
- 新增 **`docs/RECEIPT-TAX-ASYNC-PIPELINE.md`**：以前 vs 现在、数据流、涉及文件表、运维清单、排障、后续 Edge/Cron 演进备忘；并在 **`PRD-SOURCE-LOG`** 上条「拆税解耦」**关联** 回填该路径。

**关联**  
- `docs/RECEIPT-TAX-ASYNC-PIPELINE.md`

---

### 2026-04-18（Vouchap：`enqueue_receipt_tax_reconcile` 迁移报错 relation sid）

**User（提示词/原意）**  
- **`20260418150000`** 迁移报错：`relation "sid" does not exist`。

**Assistant（实现前说明，若有）**  
- 怀疑 **`$$` 定界**或 **`sid` 标识符**在部分执行环境下被误解析，导致 PL/pgSQL 变量被当成关系名。

**Assistant（实现后说明 / 本轮结论）**  
- **`20260418150000_receipt_tax_recalc_queue.sql`**：`DECLARE sid` 改为 **`v_space_id`**；函数体定界 **`$$` → `$function$`**。若表已建、仅函数失败，可重跑该迁移或单独 **`CREATE OR REPLACE FUNCTION`** 该段。

**关联**  
- `vouchap-app/supabase/migrations/20260418150000_receipt_tax_recalc_queue.sql`

---

### 2026-04-18（Vouchap：迁移仍报 relation v_space_id）

**User（提示词/原意）**  
- 执行迁移仍报错 **`relation "v_space_id" does not exist`**。

**Assistant（实现前说明，若有）**  
- 判定为 **按分号拆分 SQL** 时 **`$function$` 块未整体保留**，PL/pgSQL 片段被当普通 SQL 执行，变量名被当成关系名。

**Assistant（实现后说明 / 本轮结论）**  
- **`enqueue_receipt_tax_reconcile`** 改为 **`AS ' ... '`** 单引号包裹整段函数体；**`RAISE`** 文案中单引号 **`''`** 转义。整段 **`CREATE FUNCTION`** 对外仅末尾一个分号，避免拆分器误切。

**关联**  
- `vouchap-app/supabase/migrations/20260418150000_receipt_tax_recalc_queue.sql`

---

### 2026-04-18（Vouchap：`enqueue` 迁移仍 42P01 — 改为 LANGUAGE sql）

**User（提示词/原意）**  
- 单引号 plpgsql 后仍报 **`relation "v_space_id" does not exist`**。

**Assistant（实现前说明，若有）**  
- 执行环境仍会拆开函数体；去掉 plpgsql 与一切局部变量。

**Assistant（实现后说明 / 本轮结论）**  
- **`20260418150000`**：新增 **`receipt_tax_recalc_queue_pending_receipt_uniq`**；**`enqueue_receipt_tax_reconcile`** 改为 **`LANGUAGE sql`** 单条 **`WITH checks … INSERT … ON CONFLICT`**；校验失败 **`CASE` 短路 + `1/0`**。**`RECEIPT-TAX-ASYNC-PIPELINE.md`** 补说明。若已有多条 **同 receipt 未处理** 行，建唯一索引前需清理重复。

**关联**  
- `vouchap-app/supabase/migrations/20260418150000_receipt_tax_recalc_queue.sql`  
- `docs/RECEIPT-TAX-ASYNC-PIPELINE.md`

---

### 2026-04-18（Vouchap：发布版本号 2.5.8 Build 46）

**User（提示词/原意）**  
- 版本号更新 **2.5.8**。

**Assistant（实现前说明，若有）**  
- 按 **`.cursorrules`** 同步 **`package.json` / `package-lock.json` / `app.config.js` / `android/app/build.gradle` / `ios/Vouchap/Info.plist`**；构建号 **45→46**；仓库无 **`app.json`** 故未改。

**Assistant（实现后说明 / 本轮结论）**  
- 版本 **2.5.8**，**iOS CFBundleVersion / Android versionCode** 均为 **46**；**`git commit` + `git push`**，提交信息 **`发布版本号 2.5.8 (Build 46)`**。

**关联**  
- `vouchap-app/package.json`、`package-lock.json`、`app.config.js`、`android/app/build.gradle`、`ios/Vouchap/Info.plist`

---

### 2026-04-20（独立站点：antbim-website 重设计 + Vercel）

**User（提示词/原意）**  
- 在 workspace 新建项目 **`antbim-website`**，参考 **`https://www.antbim.com/`** 重新设计网站；已有内容需全面用上；UI 风格可按素材重新构思；同样发布在 Vercel 上。

**Assistant（实现前说明，若有）**  
- 在 **`/Users/macbook/antbim-website`** 新建 **Next.js 14 + App Router + Tailwind** 营销落地页；将官网公开信息结构化为 **`lib/site-content.ts`**；首页分段覆盖产品八大模块、五大能力块、ERP、解决方案、案例、资源中心/资讯、信任数据与 CTA；提供 **`vercel.json`** 与 **README** 部署说明。因本机 **`~/.npm` 权限问题**，使用 **`npm install --cache /tmp/npm-cache-antbim`**。未代用户执行 **`vercel --prod`**（需账号/仓库绑定）。

**Assistant（实现后说明 / 本轮结论）**  
- 项目已创建且 **`npm run build`** 通过；页脚注明为重设计演示站点以免与官方混淆，可按需删改。Vercel：将目录推送到 Git 后在 Dashboard 设 Root Directory **`antbim-website`**，或在该目录执行 **`npx vercel --prod`**。

**关联**  
- `/Users/macbook/antbim-website/`（`app/page.tsx`、`components/*`、`lib/site-content.ts`、`README.md`、`vercel.json`）

---

### 2026-04-20（antbim-website：配置 GitHub remote，推送需本机登录/建库）

**User（提示词/原意）**  
- **git 到 github**。

**Assistant（实现前说明，若有）**  
- 根据 sibling 仓库推断 **`origin`** 为 **`https://github.com/jameszjgao/antbim-website.git`**；尝试 **`git push`** 因远端仓库尚未创建而失败；本机 **`gh` 未登录**、**SSH 无可用公钥**，无法在无交互环境下代建仓库或推送。

**Assistant（实现后说明 / 本轮结论）**  
- 已 **`brew install gh`**（此前环境无 `gh`）；**`origin`** 已指向上述 URL；**`README.md`** 增补 GitHub 推送步骤（网页建空库或 **`gh repo create`**）；提交 **`docs: add GitHub push instructions`**。用户需在 GitHub 创建 **`jameszjgao/antbim-website`**（或改掉 remote）后执行 **`git push -u origin main`**，或 **`gh auth login`** 后按 README 方式 B 操作。

**关联**  
- `/Users/macbook/antbim-website/README.md`、`.git/config`（`origin`）

---

### 2026-04-20（antbim-website：请求发布 Vercel — 本机无凭据）

**User（提示词/原意）**  
- **发布到 vercel**。

**Assistant（实现前说明，若有）**  
- 在 **`/Users/macbook/antbim-website`** 执行 **`npx vercel deploy --prod --yes`**；环境变量 **`VERCEL_TOKEN`** 未设置。

**Assistant（实现后说明 / 本轮结论）**  
- CLI 报错：**`No existing credentials found`**（需 **`vercel login`** 或 **`--token`**），无法在助手侧代完成浏览器授权。已扩充 **`README.md`**「发布到 Vercel」：**GitHub Import**、**CLI 登录 + prod**、**Token 非交互部署** 三种路径。用户任选其一后即可上线。

**关联**  
- `/Users/macbook/antbim-website/README.md`

---

### 2026-04-20（antbim-website：从 GitHub 发布到 Vercel — 文档细化）

**User（提示词/原意）**  
- **从 github 发布到 vercel**。

**Assistant（实现前说明，若有）**  
- 无代码逻辑变更；在 **`antbim-website/README.md`** 将「GitHub → Vercel」流程写为可执行分步（GitHub App 授权、Import、Root Directory、Production Branch、Preview）。

**Assistant（实现后说明 / 本轮结论）**  
- 已更新 README **方式 A**；推送 **`main`** 即触发 Vercel 生产部署，PR 预览依赖项目 Git 设置。仍需用户在 Dashboard 完成 Import（助手无法代登录）。

**关联**  
- `/Users/macbook/antbim-website/README.md`

---

### 2026-04-20（antbim-website：默认浅色 + 明暗切换）

**User（提示词/原意）**  
- **只有深色模式，需默认浅色，并可切换**。

**Assistant（实现前说明，若有）**  
- 引入 **`next-themes`**（`class` 策略）、**`ThemeProvider`** 默认 **`light`**、**`enableSystem={false}`**；**`ThemeToggle`** 置于顶栏；**Tailwind** **`darkMode: 'class'`**；全局与各区块补 **`dark:`** 与浅色基准；浅色栅格 **`grid-fade-light`**。

**Assistant（实现后说明 / 本轮结论）**  
- **`npm run build`** 通过；主题会持久化。改动见 **`antbim-website`**：`app/providers.tsx`、`components/ThemeToggle.tsx`、`tailwind.config.ts`、`app/globals.css`、`app/layout.tsx`、`SiteHeader` / `SiteFooter`、`app/page.tsx`、`package.json`。

**关联**  
- `/Users/macbook/antbim-website/`

---

### 2026-04-20（antbim-website：镜像官网图片与 Logo 并接入页面）

**User（提示词/原意）**  
- **原网站上的素材需更全面用上，尤其是图片和 logo**。

**Assistant（实现前说明，若有）**  
- 拉取 **`https://www.antbim.com/`** HTML（**`--compressed`**），提取 CDN 路径；下载至 **`public/assets/antbim/`** 并语义化重命名；新增 **`lib/antbim-assets.ts`**；**`HeroBanner`** 客户端轮播 4 张官网横幅；**`SiteHeader` / `SiteFooter`** 使用 **`logo-header.jpg`** 与 **`icon-phone.png`**；能力块、ERP、案例卡片配图；**`README`** 与页脚注明镜像来源与商用替换提示。

**Assistant（实现后说明 / 本轮结论）**  
- **`npm run build`** 通过；仓库增大约 **7MB+** 静态资源。若 CDN 防盗链变化需重新抓取。

**关联**  
- `/Users/macbook/antbim-website/public/assets/antbim/`、`lib/antbim-assets.ts`、`components/HeroBanner.tsx`、`app/page.tsx`、`components/SiteHeader.tsx`、`components/SiteFooter.tsx`、`README.md`

---

### 2026-04-20（antbim-website：首屏与 Logo 对齐参考 — 去轮播、统一字标）

**User（提示词/原意）**  
- 附图参考：**图片应用很凌乱，logo 没有用上**。

**Assistant（实现前说明，若有）**  
- 新增 **`BrandLogo`**：橙底「蚂」字标 + 字标两行，**顶栏 / 页脚**统一使用，**移动端始终显示字标**（此前易只见小图）。首屏去掉 **`HeroBanner`** 轮播与底点，改为浅灰底 + 低对比水印「数字化经营」+ 右侧柔光；**单张白卡片**承载 **`brand-hero-illustration`**，**CTA 置于主图之下**；能力纵深去掉每块大图，改为标题区 + 要点列表；ERP 区去掉与首屏重复的大图；导航「资源中心」改为「**资讯中心**」对齐参考；删除未再使用的 **banner webp** 与 **`HeroBanner.tsx`**；**`antbim-assets`** 去掉 **`banners`** 导出。

**Assistant（实现后说明 / 本轮结论）**  
- **`npm run build`** 通过；**`README`** 已更新说明。

**关联**  
- `/Users/macbook/antbim-website/components/BrandLogo.tsx`、`SiteHeader.tsx`、`SiteFooter.tsx`、`app/page.tsx`、`lib/antbim-assets.ts`、`lib/site-content.ts`、`README.md`

---

### 2026-04-20（antbim-website：运营方授权 — 学全站内容并重设计为替换官网的营销站）

**User（提示词/原意）**  
- 需把**原网站上的所有内容学习理解了**，然后**重新设计**，以**最有利于蚂蚁分工的营销推广**为目的；用户即**蚂蚁分工运营方**，**原网站素材直接授权可用**；**后续设计的网站需直接替换原站**。

**Assistant（实现前说明，若有）**  
- 抓取 **`antbim.com`** 首页 HTML（**meta 长描述**、模块文案）及 **`/Solution/`**（行业/场景标签与案例标题节选）；重写 **`lib/site-content.ts`**：品牌长文、转化路径、**`whyAntbim`**、**`industryTags` / `scenarioTags` / `solutionCopy`**、能力块 **`marketingOutcome`**、**`midFunnelCta`**、**`faqItems`**、**`resourceHubItems`**、案例 **`outcome`**、资讯补三条场景实践标题；**`app/page.tsx`** 增「为什么选择」、中段 CTA、解决方案双栏标签云、FAQ **`details`**、资源结构化列表；**`SiteFooter`** 去「演示」表述改**运营授权**；**`README`** 改为**替换原站**清单与营销目标说明；**`siteMeta.title/description`** 对齐 SEO。

**Assistant（实现后说明 / 本轮结论）**  
- **`npm run build`** 通过。原站若还有子栏目独占长文，上线前可再拆独立路由或外链；**#cta** 按钮仍为占位，需接表单与真实资讯 URL。

**关联**  
- `/Users/macbook/antbim-website/lib/site-content.ts`、`app/page.tsx`、`components/SiteFooter.tsx`、`README.md`

---

### 2026-04-20（antbim-website：替换原站 1:1 栏目与 URL — 全量保留）

**User（提示词/原意）**  
- 替换原站时要 **1:1 栏目与 URL 迁移**，**全部保留**，**不合并和省略**。

**Assistant（实现前说明，若有）**  
- 以 **`sitemap.xml`** 为权威路径全集生成 **`lib/migration/legacy-paths.ts`**；首页 **`/`** 仍由 Next 营销页承接（与「新首页替换」目标一致），其余 path 在迁移期由 **Edge middleware** 按环境变量 **rewrite** 到 **`LEGACY_UPSTREAM_ORIGIN`**；文档强调 **DNS 已切到本站时 upstream 不可同源** 以免死循环。顶栏与页内主要外链改为 **`legacyPublicPaths`**（与旧站 path 一致，含 **`/Solution/`** 大小写）。提供 **`npm run sync-legacy-paths`** 与 **`.env.example`**。

**Assistant（实现后说明 / 本轮结论）**  
- 已生成 **668** 条（不含 `/`）+ 脚本补 **`/wxGetOpenId.jsp`**；**`npm run build`** 通过。未在 sitemap 出现的入口需维护 **`EXTRA_PATHNAMES`** 后重跑同步。演示/下载类按钮暂统一指向旧站 **`/h-msgBoard.html`**（若后续对照原站 HTML 有更细 URL，可在 **`conversion`** 中拆分）。

**关联**  
- `/Users/macbook/antbim-website/middleware.ts`、`lib/migration/legacy-paths.ts`、`scripts/sync-legacy-paths.mjs`、`lib/site-content.ts`、`app/page.tsx`、`components/SiteHeader.tsx`、`README.md`、`.env.example`、`package.json`

---

### 2026-04-20（antbim-website：顶栏使用原站横版带名称 Logo）

**User（提示词/原意）**  
- 原网站**带名称的 logo** 需用上（用户附图：橙标 +「蚂蚁分工」横版字标）。

**Assistant（实现前说明，若有）**  
- 将用户提供的 PNG 落入 **`public/assets/antbim/logo-wordmark.png`**；**`antbim-assets.ts`** 增加 **`logoWordmark`**；**`BrandLogo`** 改为 **`next/image`** 展示该资源，顶栏 **`priority`** 以利 LCP；组件标 **`"use client"`** 以便继续被 **`SiteHeader`**（客户端组件）引用。

**Assistant（实现后说明 / 本轮结论）**  
- 已替换原先「蚂」字占位格 + 双行字标；**`npm run build`** 通过。若暗色顶栏对比不足，可再提供反白字标版本并做 **`dark:`** 切换。

**关联**  
- `/Users/macbook/antbim-website/public/assets/antbim/logo-wordmark.png`、`lib/antbim-assets.ts`、`components/BrandLogo.tsx`、`components/SiteHeader.tsx`

---

### 2026-04-20（antbim-website：Favicon 使用原站 favicon.ico）

**User（提示词/原意）**  
- **favicon** 也需要用**原站的图片**。

**Assistant（实现前说明，若有）**  
- 从 **`https://www.antbim.com/favicon.ico`** 拉取；响应对 body 为 **gzip**，需 **`gunzip -c`** 得到真实 **MS Windows icon**（多尺寸）后写入 **`app/favicon.ico`**，由 Next App Router 自动作为 **`/favicon.ico`** 提供，无需改 **`metadata.icons`**。

**Assistant（实现后说明 / 本轮结论）**  
- 已落盘 **`antbim-website/app/favicon.ico`**（约 108KB，含多分辨率）；**`npm run build`** 通过。

**关联**  
- `/Users/macbook/antbim-website/app/favicon.ico`

---

### 2026-04-20（antbim-website：注册/登录指向 login.antbim.cn）

**User（提示词/原意）**  
- **注册/登录**按钮指向 **`https://login.antbim.cn/login`**。

**Assistant（实现前说明，若有）**  
- 在 **`lib/site-content.ts`** 增加 **`authAppLoginUrl`**，**`conversion.login.href`** 改为该绝对地址；**`legacyPublicPaths.login`** 更名为 **`legacyMarketingLogin`**（仅注释旧站 **`/h-login.html`**，避免与正式登录域混淆）。**`SiteHeader`** 顶栏与移动端抽屉改为 **`<a rel="noopener noreferrer">`**，去掉仅用于该外链的 **`next/link`**。

**Assistant（实现后说明 / 本轮结论）**  
- **`npm run build`** 通过。

**关联**  
- `/Users/macbook/antbim-website/lib/site-content.ts`、`components/SiteHeader.tsx`

---

### 2026-04-20（antbim-website：顶栏各 path 默认回源，避免 404）

**User（提示词/原意）**  
- **各页签都 404**，应把页面**补全**（意指栏目页应能打开）。

**Assistant（实现前说明，若有）**  
- 根因多为未配置 **`LEGACY_PROXY_ENABLED` / `LEGACY_UPSTREAM_ORIGIN`** 时中间件直接放行，Next 又无对应路由。调整 **`middleware.ts`**：默认上游 **`https://www.antbim.com`**；**`LEGACY_PROXY_ENABLED`** 仅 **`0`/`false`** 时关闭，否则在**请求 Host 与上游 Host 不同**时默认回源（本地、**`*.vercel.app`** 预览免配）；**请求 Host 与上游 Host 相同**时跳过回源以防 DNS 已指本站时的死循环，并文档说明生产须独立 **`LEGACY_UPSTREAM_ORIGIN`** 或慎用 **`LEGACY_FORCE_SAME_HOST_PROXY`**。同步 **`.env.example`**、**`README.md`**。

**Assistant（实现后说明 / 本轮结论）**  
- **`npm run build`** 通过。生产同域仍 404 时属预期保护，需按 README 配置镜像 origin。

**关联**  
- `/Users/macbook/antbim-website/middleware.ts`、`.env.example`、`README.md`

---

### 2026-04-27（Vouchap：版本号更新至 2.5.9）

**User（提示词/原意）**  
- “Vouchap项目，app版本号更新2.5.9”。

**Assistant（实现前说明，若有）**  
- 按仓库版本管理规则，同步更新 `vouchap-app` 的版本号与原生构建号：`package.json`、`package-lock.json`、`app.json`、`app.config.js`、`android/app/build.gradle`、`ios/Vouchap/Info.plist`；将版本升级到 `2.5.9`，Build 从 `46` 递增到 `47`。

**Assistant（实现后说明 / 本轮结论）**  
- 已完成版本同步：`version = 2.5.9`，`iOS CFBundleVersion = 47`，`Android versionCode = 47`，并补充最小 `app.json` 以满足发布规则链路完整性。  
- 已按规范提交并推送，提交信息：`发布版本号 2.5.9 (Build 47)`。

**关联**  
- `/Users/macbook/Vouchap/vouchap-app/package.json`、`package-lock.json`、`app.json`、`app.config.js`、`android/app/build.gradle`、`ios/Vouchap/Info.plist`

---

### 2026-04-27（Vouchap：对齐 Expo 已构建号并改为后续自动递增）

**User（提示词/原意）**  
- “现在expo上已经构建的构建号ios是32，android是49。保持一致，后续本地不用动，有Expo在每次构建时自动更新。”

**Assistant（实现前说明，若有）**  
- 将本地版本配置中的构建号对齐到 Expo 当前状态：iOS 使用 `32`，Android 使用 `49`；不修改语义版本 `2.5.9`，仅修正构建号基线。

**Assistant（实现后说明 / 本轮结论）**  
- 已更新构建号：`app.config.js`、`app.json`、`android/app/build.gradle`、`ios/Vouchap/Info.plist`。  
- 当前本地与 Expo 已构建号一致，可按你的要求后续由 Expo 构建自动递增，不再手动同步本地构建号。

**关联**  
- `/Users/macbook/Vouchap/vouchap-app/app.config.js`、`app.json`、`android/app/build.gradle`、`ios/Vouchap/Info.plist`

---

### 2026-04-27（Vouchap：触发全平台 Production 构建）

**User（提示词/原意）**  
- “全平台构建production”。

**Assistant（实现前说明，若有）**  
- 在 `vouchap-app` 使用 EAS `production` profile 触发 `--platform all` 构建；遵循 `eas.json` 中 `appVersionSource: remote` 与 `autoIncrement: true` 配置。

**Assistant（实现后说明 / 本轮结论）**  
- 已成功发起 Android + iOS 的 production 构建任务。  
- 本次自动递增结果：Android `versionCode 49 -> 50`，iOS `buildNumber 32 -> 33`（由 Expo 远端版本源递增）。  
- 当前状态：iOS `new`、Android `in queue`，构建仍在云端执行中，可通过日志链接实时查看。

**关联**  
- `/Users/macbook/Vouchap/vouchap-app/eas.json`

---

### 2026-04-28（Vouchap：Receipt 详情编辑态避免分类/用途改动覆盖草稿）

**User（提示词/原意）**  
- “receipt详情页中，修改entity、item名称、币种等内容之后，如果更换了category或attribution，会导致已修改的其他内容恢复原值。应该优化可以同时修改。”

**Assistant（实现前说明，若有）**  
- 排查 `receipt-details/[id].tsx` 中编辑态与实时刷新（realtime + `loadReceipt`）的状态同步逻辑，目标是避免在编辑过程中因分类/用途更新触发整单重载而覆盖 `editedReceipt` 草稿；保留必要场景下的强制回滚能力。

**Assistant（实现后说明 / 本轮结论）**  
- 已将 `loadReceipt` 改为带可选参数的 `useCallback`，并新增 `editingRef`：编辑态默认仅更新 `receipt` 基线，不覆盖 `editedReceipt`。  
- 修复后在同一编辑会话中可同时改 `entity/item name/currency/tax` 等字段，再改 `category/attribution` 不会把前述修改回滚。  
- 对于商品项直改失败场景，保留 `loadReceipt({ forceSyncEdited: true })` 强制同步回滚，避免脏草稿残留。

**关联**  
- `/Users/macbook/Vouchap/vouchap-app/src/mobile-ui/app/receipt-details/[id].tsx`

---

### 2026-04-28（Vouchap：核查并修复其他详情页编辑草稿被回刷覆盖）

**User（提示词/原意）**  
- “其他模块的详情页也需核查同类问题”。

**Assistant（实现前说明，若有）**  
- 排查 `invoice-details`、`inbound-details`、`outbound-details` 的详情页加载与 realtime 回刷逻辑，重点核查是否存在 `loadXxx` 直接覆盖 `editedXxx` 导致编辑态草稿回滚。

**Assistant（实现后说明 / 本轮结论）**  
- 已确认并修复 3 个详情页同类风险：新增 `editingRef`，将 `loadXxx` 改为 `useCallback` 且支持 `forceSyncEdited`；编辑态下默认只更新展示基线，不覆盖草稿，避免实时回刷导致用户已改字段丢失。  
- 已同步调整相关 `useEffect` 依赖（含 realtime refresh 调用），确保行为稳定；`ReadLints` 检查通过。

**关联**  
- `/Users/macbook/Vouchap/vouchap-app/src/mobile-ui/app/invoice-details/[id].tsx`  
- `/Users/macbook/Vouchap/vouchap-app/src/mobile-ui/app/inbound-details/[id].tsx`  
- `/Users/macbook/Vouchap/vouchap-app/src/mobile-ui/app/outbound-details/[id].tsx`

---


### 2026-04-30（aim-link-website：统一登录入口到 appv2 /signin）

**User（提示词/原意）**  
- “把aim.link-website网站上的各处登录链接改为https://appv2.aim.link/signin”。

**Assistant（实现前说明，若有）**  
- 在 `aim-link-website` 全局检索旧登录 URL（`https://app.aim.link/login`），先覆盖前端页面中的用户可见入口，再同步更新项目内文档说明，最后回查确保无遗漏。

**Assistant（实现后说明 / 本轮结论）**  
- 已将旧登录链接统一替换为 `https://appv2.aim.link/signin`，覆盖首页、导航、服务页及相关文档条目。  
- 回查结果：仓库中不再存在 `https://app.aim.link/login`。

**关联**  
- `/Users/macbook/aim-link-website/src/pages/Home.jsx`  
- `/Users/macbook/aim-link-website/src/components/Navbar.jsx`  
- `/Users/macbook/aim-link-website/src/pages/Service.jsx`  
- `/Users/macbook/aim-link-website/OPTIMIZATION_REPORT.md`  
- `/Users/macbook/aim-link-website/CHECKLIST.md`

---

### 2026-05-01（Vouchap：客户端 Gemini key 文案与残留清理）

**User（提示词/原意）**  
- 在 Supabase 已用 CLI 配好密钥的前提下，要求助手直接改代码：排查并清理 app/web 端对 API key 的依赖与残留。

**Assistant（实现前说明，若有）**  
- 全库检索 `EXPO_PUBLIC_GEMINI`、`@google/generative-ai` 直连、根目录重复 `lib/gemini*`；集中整理 `vouchap-app/src/shared-logic/gemini.ts` 的错误码与提示，使其指向 Supabase `gemini-proxy`；移除 `.env` 中客户端 Gemini 变量，删除已无路径引用的根目录副本文件。

**Assistant（实现后说明 / 本轮结论）**  
- `gemini.ts`：统一 `throwGeminiProxyUnavailable` / 错误码 `GEMINI_PROXY_UNAVAILABLE`；移除对 `EXPO_PUBLIC_GEMINI_API_KEY`、`EAS Secrets` 的误导性提示与多余 `Constants` 引用；删除所有「无 key」分支（占位 key 恒为真时的死代码）。  
- 根目录 `app.config.js`：`extra.geminiApiKey` 与 `vouchap-app` 一致为占位字符串，不再读取 `EXPO_PUBLIC_GEMINI_API_KEY`。  
- 删除未再被 `@/lib/*` 解析使用的 `lib/gemini.ts`、`lib/gemini-helper.ts`；`test-gemini-api*.js` 仅接受环境变量 `GEMINI_API_KEY`（可选本地直连 Google 冒烟测试，与 App 无关）。  
- `/.env` 与 `vouchap-app/.env`：移除 `EXPO_PUBLIC_GEMINI_API_KEY` 行，改为注释说明密钥仅在 Supabase Function secret。  
- `ReadLints` 对改动 TS/JS 文件检查通过。

**关联**  
- `/Users/macbook/Vouchap/vouchap-app/src/shared-logic/gemini.ts`  
- `/Users/macbook/Vouchap/app.config.js`  
- `/Users/macbook/Vouchap/.env`  
- `/Users/macbook/Vouchap/vouchap-app/.env`  
- `/Users/macbook/Vouchap/test-gemini-api.js`  
- `/Users/macbook/Vouchap/test-gemini-api-simple.js`

---

### 2026-05-01（Vouchap：发布 vouchap-app 2.6.0 / Build 50）

**User（提示词/原意）**  
- 「版本号更新为2.6.0」。

**Assistant（实现前说明，若有）**  
- 按 `.cursorrules` 同步 `vouchap-app` 的 `package.json`、`package-lock.json`、`app.json`、`app.config.js`、`android/app/build.gradle`、`ios/Vouchap/Info.plist`；并检查 `ios/.../project.pbxproj` 中 `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` 与构建号一致。

**Assistant（实现后说明 / 本轮结论）**  
- 应用版本号统一为 **2.6.0**；iOS `CFBundleVersion` 与 Android `versionCode` 统一为 **50**（`project.pbxproj` 同步为 `MARKETING_VERSION = 2.6.0`、`CURRENT_PROJECT_VERSION = 50`）。  
- 已执行 `git commit` + `git push`，提交说明：`发布版本号 2.6.0 (Build 50)`。

**关联**  
- `/Users/macbook/Vouchap/vouchap-app/package.json`  
- `/Users/macbook/Vouchap/vouchap-app/ios/Vouchap.xcodeproj/project.pbxproj`

---
