# 邀请邮件发送配置指南

## 问题
目前邀请功能已实现，但邮件发送功能需要配置才能正常工作。

## 解决方案

### 方案 1：使用 Supabase Edge Function（推荐）

项目内已提供带 **CORS** 的 Edge Function 源码，从浏览器（如 `http://localhost:8081`）调用时不会出现 CORS 报错。

1. **使用项目内函数源码**
   - 路径：`vouchap-app/supabase/functions/send-invitation-email/index.ts`
   - 该函数已处理 OPTIONS 预检并在响应中返回 CORS 头，支持本地开发与生产环境调用。

2. **配置环境变量**
   - Supabase Dashboard > Edge Functions > 选择 `send-invitation-email` > Settings
   - 添加 `RESEND_API_KEY`（Resend 的 API Key）；可选 `RESEND_FROM` 发件人地址（默认 `Vouchap <onboarding@resend.dev>`）。
   - 未配置 `RESEND_API_KEY` 时，函数仍会返回 200，便于先修复 CORS 再配置发信。

3. **部署函数**
   - 在项目根目录或 `vouchap-app` 下执行：
   - `supabase link --project-ref <你的项目 ref>`（若尚未 link）
   - `supabase functions deploy send-invitation-email`
   - 部署后，从 `http://localhost:8081` 或你的前端域名调用该函数将不再被 CORS 拦截。

### 方案 2：使用 Supabase 邮件功能

如果 Supabase 已配置 SMTP，可以修改 `sendInvitationEmail` 函数直接使用 Supabase 的邮件 API。

### 方案 3：临时测试方案

在开发环境中，邀请链接会在控制台输出，可以手动复制并发送给被邀请者。

## CORS 说明

从浏览器（如 Web 开发时 `http://localhost:8081`）调用 Edge Function 时，必须先通过 CORS 预检。本仓库中的 `send-invitation-email` 已对 OPTIONS 请求返回 204 并带上 `Access-Control-Allow-*` 头，对 POST 响应也带上相同 CORS 头。若你之前在 Dashboard 里手写了一个未带 CORS 的版本，请用本仓库中的 `supabase/functions/send-invitation-email/index.ts` 重新部署以修复 CORS。

## 当前状态

- ✅ 邀请记录已创建到数据库
- ✅ 邀请链接已生成
- ✅ Edge Function 源码含 CORS，部署后可从浏览器正常调用
- ⚠️ 实际发信需在 Supabase 中配置 RESEND_API_KEY（或改用其他邮件服务）
- ✅ 登录时会检查待处理的邀请并显示提示

## 测试建议

1. **开发环境**：查看控制台输出的邀请链接，手动测试
2. **生产环境**：配置 Edge Function 后，邀请邮件会自动发送



