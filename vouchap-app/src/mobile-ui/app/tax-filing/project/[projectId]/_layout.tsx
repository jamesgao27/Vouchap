/**
 * 项目详情（client 侧以 project 为主体）：Stack 内两页
 * - index: 顶栏为页面顶栏（由 index 内 setOptions 设为项目名），避免显示路径 "tax-filing/project/[projectId]"
 * - info: 项目信息
 * 附件详情已改为大浮窗（FileDetailModal），不再单独路由。
 */
import { Stack } from 'expo-router';

export default function ProjectDetailLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerBackButtonVisible: true }}>
      <Stack.Screen
        name="index"
        options={{ title: '', headerTitle: '' }}
      />
      <Stack.Screen name="info" />
    </Stack>
  );
}
