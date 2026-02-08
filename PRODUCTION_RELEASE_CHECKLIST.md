# Production 发布前验证（确保 Gemini 在正式版可用）

此前 develop/preview 正常、production 上架后调模型失败，多半是 **production 构建时没有拿到 Gemini API Key**。按下面做可避免再次发生。

---

## 1. 确认 EAS Secrets 已包含 production

- 打开 [Expo Dashboard](https://expo.dev) → 你的项目 → **Settings** → **Secrets**
- 确认存在 **`EXPO_PUBLIC_GEMINI_API_KEY`**（名称必须一致）
- EAS Secrets 是**项目级**的，development / preview / **production** 构建都会用同一份，无需按 profile 再配一次

若没有或不确定，可重新创建：

```bash
eas secret:create --scope project --name EXPO_PUBLIC_GEMINI_API_KEY --value "你的_Gemini_API_Key" --type string
```

---

## 2. 构建时把 Key 写入 app 配置（已做）

`app.config.js` 里已增加：

- `extra.geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || ""`

这样在 EAS 构建时，会用 Secrets 里的 Key 写入 `Constants.expoConfig.extra.geminiApiKey`，即使 `process.env` 在运行时未注入，正式版也能从 `extra` 读到 Key。

---

## 3. 发布前必做：用 production 构建实测 Gemini

**不要**只靠 develop/preview 正常就直发 production。请先：

1. **打一版 production 构建**
   ```bash
   eas build --profile production -p ios
   ```
2. **装到真机**（TestFlight 或 EAS 提供的安装链接）
3. **在 app 里实测**：
   - 首页「扫描小票」或「聊天」触发一次 Gemini 识别
   - 确认能成功返回结果、无报错
4. **再用这同一份构建**提交到 App Store（或先 TestFlight 再提审）

只要这次 production 构建在真机上能正常调 Gemini，上架后也会正常。

---

## 4. 可选：本地先验证 Key 是否有效

在提交构建前，可用现有脚本确认当前 Key 能调通 Gemini：

```bash
export EXPO_PUBLIC_GEMINI_API_KEY="你的_key"
node test-gemini-api-simple.js
```

看到 `GEMINI_API_KEY 测试通过` 再打 production 构建即可。

---

## 小结

| 步骤 | 说明 |
|------|------|
| 1 | EAS Secrets 中必须有 `EXPO_PUBLIC_GEMINI_API_KEY`（项目级） |
| 2 | `app.config.js` 已把该 Key 写入 `extra.geminiApiKey`，production 会从这儿读 |
| 3 | **发布前**用 `eas build --profile production -p ios` 打一版，装真机测一次 Gemini，通过后再提交该构建到 App Store |

这样再发的 production 就能保证正常调用 Gemini。
