/**
 * 订单/项目详情：Stack 内两页
 * - index: 顶栏为页面顶栏（由 index 内 setOptions 设为项目名），避免显示路径 "tax-filing/order/[orderId]"
 * - info: 项目信息
 */
import { Stack } from 'expo-router';

export default function OrderDetailLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="index"
        options={{ title: '', headerTitle: '' }}
      />
      <Stack.Screen name="info" />
    </Stack>
  );
}
