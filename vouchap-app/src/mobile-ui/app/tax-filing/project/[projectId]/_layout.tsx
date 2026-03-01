/**
 * 项目详情（client 侧以 project 为主体）：Stack 内两页
 * - index: 顶栏为页面顶栏（由 index 内 setOptions 设为项目名），避免显示路径 "tax-filing/project/[projectId]"
 * - info: 项目信息
 * - attachment/[attachmentId]: 附件详情
 */
import { Stack } from 'expo-router';

export default function ProjectDetailLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="index"
        options={{ title: '', headerTitle: '' }}
      />
      <Stack.Screen name="info" />
      <Stack.Screen name="attachment/[attachmentId]" options={{ title: 'Attachment' }} />
    </Stack>
  );
}
