# EAS Secrets 配置指南

## 问题

构建的应用安装在手机上后，登录和注册功能无法使用，提示「连不上网」。

## 根本原因

**Supabase 环境变量在 EAS Build 时没有正确注入到应用中。**

EAS Build 不会读取本地的 `.env` 文件，必须在 Expo Dashboard 的 Secrets / Environment 中设置变量。

## 解决方案

### 步骤 1：登录 Expo Dashboard

访问：https://expo.dev

### 步骤 2：进入项目设置

1. 选择你的项目（Vouchap / snap-receipt）
2. 打开 **Settings** → **Environment variables**（或 **Secrets**）

### 步骤 3：添加环境变量（仅以下两项）

| Name | 说明 |
|------|------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 项目 URL（`https://xxx.supabase.co`） |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon** / public key（非 `service_role`） |

**不要**在 EAS 中配置 `EXPO_PUBLIC_GEMINI_API_KEY`。Gemini API Key 仅存放在 **Supabase Edge Function Secret**（`GEMINI_API_KEY`），由 `gemini-proxy` 在服务端调用。详见 `vouchap-app/docs/GEMINI-API-SECURITY.md`。

若历史上曾在 EAS 配置过 `EXPO_PUBLIC_GEMINI_API_KEY`，可在 Dashboard 中**删除**该变量（应用已不再读取）。

### 步骤 4：重新构建应用

```bash
cd vouchap-app
eas build --platform android --profile production
```

### 步骤 5：验证

安装构建产物后测试登录/注册；AI 识别需 Supabase 已部署 `gemini-proxy` 且已设置 `GEMINI_API_KEY`。

## 本地开发

在 `vouchap-app/.env`（勿提交）中配置：

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Gemini 密钥勿写入客户端 `.env`。可选：在 Supabase 项目配置 Function secret 后，用已登录会话通过 App 走代理测试。

## 相关文档

- `vouchap-app/docs/GEMINI-API-SECURITY.md` — Gemini 代理与安全清单
- `vouchap-app/supabase/functions/gemini-proxy/README.md` — 部署与 CORS
