# Assets 目录

此目录用于存放应用的静态资源文件。

**logo2 / logo.png / logo3**（2026-04 起）：`logo2` 供商店与原生构建图标；`logo.png` 为应用内默认与营销站主图；`logo3` **仅**用于应用 Web 端大屏左侧栏（`WebSidebar`）。更新后请同步到 `vouchap-app/src/mobile-ui/assets/` 与 `vouchap-website/public/`（见 `vouchap-app/src/mobile-ui/assets/README.md` 中的 `cp` 示例）。

## 必需的文件

根据 `app.json` 配置，你需要准备以下文件：

1. **icon.png** - 应用图标 (1024x1024)
2. **splash.png** - 启动画面 (1242x2436)
3. **adaptive-icon.png** - Android 自适应图标 (1024x1024)
4. **favicon.png** - Web 图标 (48x48)

## 临时解决方案

如果暂时没有这些文件，你可以：

1. 使用在线工具生成图标（如 [App Icon Generator](https://www.appicon.co/)）
2. 使用占位图片
3. 或者暂时注释掉 `app.json` 中的相关配置

## 图标要求

- **icon.png**: 1024x1024 像素，PNG 格式
- **splash.png**: 1242x2436 像素（或按比例），PNG 格式
- **adaptive-icon.png**: 1024x1024 像素，PNG 格式，背景色为白色
- **favicon.png**: 48x48 像素，PNG 格式

