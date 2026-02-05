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
      associatedDomains: ["applinks:vouchap.com"]
    },
    android: {
      package: "com.vouchap.app",
      versionCode: 15,
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
      [
        "expo-image-picker",
        {
          "photosPermission": "Vouchap needs access to your photo library.",
          "cameraPermission": "Vouchap needs access to your camera."
        }
      ],
      ["expo-camera", { "cameraPermission": "Vouchap needs access to your camera." }],
      [
        "react-native-document-scanner-plugin",
        {
          "cameraPermission": "We need camera access to snap receipts."
        }
      ]
    ],
    // 这里通过扩展运算符引入 app.json 中的 projectId，保持同步
    extra: {
      eas: {
        projectId: "f98c5cea-fd51-41e3-9c9c-1512c6b1a8e7"
      }
    }
  }
};