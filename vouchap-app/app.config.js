const pkg = require("./package.json");

export default {
  expo: {
    name: "Vouchap",
    slug: "vouchap",
    version: pkg.version,
    owner: "aimlink",
    // 使用 default 以支持大屏/平板旋转，符合 Google Play「移除屏幕方向限制」建议
    orientation: "default",
    icon: "./assets/icon.png",
    scheme: "vouchap", // 关键：解决邮件跳转的核心配置
    userInterfaceStyle: "light",
    splash: {
      backgroundColor: "#ffffff",
      resizeMode: "contain"
    },
    // 仅打包实际引用的资源，避免 "**/*" 把整个项目打进包导致体积暴增（原 315MB+）
    assetBundlePatterns: [],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.vouchap.app",
      buildNumber: "12",
      associatedDomains: ["applinks:vouchap.com"]
    },
    android: {
      package: "com.vouchap.app",
      versionCode: 25,
      // 使用系统照片选择器，不再声明 READ_MEDIA_IMAGES，符合 Google Play 照片权限政策
      permissions: [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "ACCESS_NETWORK_STATE",
        "INTERNET"
      ],
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#ffffff"
      },
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "vouchap.com",
              pathPrefix: "/"
            },
            {
              scheme: "vouchap" // 允许通过 vouchap:// 唤起
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    plugins: [
      ["expo-router", { root: "./src/mobile-ui/app" }],
      [
        "expo-image-picker",
        {
          "photosPermission": "Vouchap requires Camera and Photo Library access to scan and upload your receipts for digital tracking.",
          "cameraPermission": "Vouchap requires Camera and Photo Library access to scan and upload your receipts for digital tracking."
        }
      ],
      ["expo-camera", { "cameraPermission": "Vouchap requires Camera and Photo Library access to scan and upload your receipts for digital tracking." }],
      [
        "react-native-document-scanner-plugin",
        {
          "cameraPermission": "Vouchap requires Camera and Photo Library access to scan and upload your receipts for digital tracking."
        }
      ]
    ],
    // Web 浏览器页签：标题与 favicon 使用应用名和 icon
    web: {
      name: "Vouchap",
      favicon: "./assets/icon.png"
    },
    // 子路径部署（如 Cloudflare Pages 在 /app/）：设置 EXPO_PUBLIC_WEB_BASE_PATH=/app，否则图标/资源可能 404
    ...(process.env.EXPO_PUBLIC_WEB_BASE_PATH
      ? { experiments: { baseUrl: process.env.EXPO_PUBLIC_WEB_BASE_PATH } }
      : {}),
    // 这里通过扩展运算符引入 app.json 中的 projectId，保持同步
    // showAiInventory: production 默认隐藏；仅 develop 或显式 EXPO_PUBLIC_SHOW_AI_INVENTORY=true 时显示
    // geminiApiKey: 构建时从 EAS Secrets 的 EXPO_PUBLIC_GEMINI_API_KEY 写入，确保 production 也能拿到 key
    extra: {
      eas: {
        projectId: "f98c5cea-fd51-41e3-9c9c-1512c6b1a8e7"
      },
      showAiInventory:
        process.env.NODE_ENV !== "production"
          ? true
          : process.env.EXPO_PUBLIC_SHOW_AI_INVENTORY === "true",
      geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || ""
    }
  }
};