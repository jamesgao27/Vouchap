# 生产环境日志收集配置指南

## 问题
- 开发环境没有日志输出
- Production 包的日志无法收集，难以排查问题

## 解决方案：集成 Sentry

Sentry 是业界标准的错误监控和日志收集工具，支持 React Native 和 Expo。

### 1. 安装依赖

```bash
npm install @sentry/react-native
npx expo install expo-dev-client
```

### 2. 初始化 Sentry（推荐在 `app/_layout.tsx` 或入口文件）

创建 `lib/sentry.ts`：

```typescript
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

// 仅在 production 环境启用 Sentry
const isProduction = Constants.expoConfig?.extra?.eas?.env === 'production' || 
                     process.env.NODE_ENV === 'production';

if (isProduction) {
  Sentry.init({
    dsn: 'YOUR_SENTRY_DSN', // 从 Sentry 项目设置中获取
    environment: Constants.expoConfig?.extra?.eas?.env || 'production',
    enableAutoSessionTracking: true,
    tracesSampleRate: 1.0, // 生产环境建议 0.1-0.2
  });
}

export default Sentry;
```

### 3. 在应用入口初始化

在 `app/_layout.tsx` 或 `app/index.tsx` 顶部：

```typescript
import '@/lib/sentry'; // 必须在其他导入之前
```

### 4. 捕获错误和日志

#### 自动捕获未处理的错误
Sentry 会自动捕获未处理的 Promise rejection 和异常。

#### 手动记录错误
```typescript
import * as Sentry from '@sentry/react-native';

try {
  // 你的代码
} catch (error) {
  Sentry.captureException(error);
  console.error(error); // 保留 console.error 用于开发环境
}
```

#### 记录自定义消息
```typescript
import * as Sentry from '@sentry/react-native';

Sentry.captureMessage('供应商名称已存在，自动使用已存在的ID', {
  level: 'info',
  extra: {
    duplicateName: '供应商名称',
    targetId: 'xxx',
  },
});
```

#### 添加用户上下文
```typescript
import * as Sentry from '@sentry/react-native';

Sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.name,
});
```

### 5. 配置 EAS Secrets

在 EAS Secrets 中添加 Sentry DSN：

```bash
eas secret:create --scope project --name SENTRY_DSN --value "YOUR_SENTRY_DSN"
```

然后在 `app.config.js` 中读取：

```javascript
extra: {
  // ... 其他配置
  sentryDsn: process.env.SENTRY_DSN || '',
}
```

### 6. 在代码中使用

更新 `lib/receipt-processor.ts` 中的错误处理：

```typescript
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const isProduction = Constants.expoConfig?.extra?.eas?.env === 'production';

// 在 catch 块中
catch (error: any) {
  if (isProduction) {
    Sentry.captureException(error, {
      tags: {
        component: 'receipt-processor',
        action: 'updateReceipt',
      },
      extra: {
        receiptId,
        receiptData: receipt,
        errorCode: error?.code,
      },
    });
  }
  console.error('后台处理小票失败:', error);
  // ... 其他错误处理
}
```

## 替代方案：使用 Expo 的内置日志

如果不想集成 Sentry，可以使用 Expo 的日志系统：

### 1. 使用 `expo-logging`

```bash
npx expo install expo-logging
```

### 2. 配置日志级别

```typescript
import { Logging } from 'expo-logging';

// 仅在 production 启用日志收集
if (process.env.NODE_ENV === 'production') {
  Logging.setLogLevel('info');
}
```

### 3. 发送日志到后端

创建 API 端点接收日志，然后在关键位置发送：

```typescript
async function sendLog(level: string, message: string, data?: any) {
  if (process.env.NODE_ENV !== 'production') return;
  
  try {
    await fetch('YOUR_LOG_ENDPOINT', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, data, timestamp: new Date().toISOString() }),
    });
  } catch (error) {
    // 静默失败，避免日志收集本身导致问题
  }
}
```

## 推荐方案

**推荐使用 Sentry**，因为：
1. 自动捕获错误和崩溃
2. 提供详细的错误堆栈和上下文
3. 支持性能监控
4. 有免费额度（每月 5,000 错误）
5. 易于集成和配置

## 查看日志

### Sentry
1. 访问 https://sentry.io
2. 登录你的账户
3. 选择 Vouchap 项目
4. 在 Issues 页面查看错误和日志

### 开发环境
- iOS: 使用 Xcode Console 或 `npx react-native log-ios`
- Android: 使用 Android Studio Logcat 或 `npx react-native log-android`

## 注意事项

1. **不要在生产环境记录敏感信息**（如密码、API keys）
2. **控制日志量**：避免在循环中大量记录日志
3. **使用适当的日志级别**：error > warn > info > debug
4. **添加用户上下文**：帮助定位问题发生的用户和环境
