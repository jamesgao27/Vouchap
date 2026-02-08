import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { validateSupabaseConfig } from '@/lib/supabase';

export default function RootLayout() {
  useEffect(() => {
    // 在应用启动时验证Supabase配置（仅用于日志，不阻止启动）
    const config = validateSupabaseConfig();
    if (!config.valid) {
      console.warn('⚠️ Supabase配置警告:', config.error);
      console.warn('应用可能无法正常连接Supabase。请在构建时设置正确的环境变量。');
    }
  }, []);

  return (
    <Stack>
        <Stack.Screen 
          name="index" 
          options={{ 
            headerShown: false 
          }} 
        />
        <Stack.Screen 
          name="receipts" 
          options={{ 
            title: 'Expenses',
            headerBackTitle: 'Home'
          }} 
        />
        <Stack.Screen 
          name="ai-inventory" 
          options={{ 
            title: 'AI Inventory',
            headerBackTitle: 'Home'
          }} 
        />
        <Stack.Screen 
          name="invoices" 
          options={{ 
            title: 'Income',
            headerBackTitle: 'Back'
          }} 
        />
        <Stack.Screen 
          name="inbound" 
          options={{ 
            title: 'Inbound lists',
            headerBackTitle: 'Back'
          }} 
        />
        <Stack.Screen 
          name="outbound" 
          options={{ 
            title: 'Outbound lists',
            headerBackTitle: 'Back'
          }} 
        />
        <Stack.Screen 
          name="skus-manage" 
          options={{ 
            title: 'SKU Management',
            headerBackTitle: 'Back'
          }} 
        />
        <Stack.Screen 
          name="warehouse-manage" 
          options={{ 
            title: 'Warehouse Management',
            headerBackTitle: 'Back'
          }} 
        />
        <Stack.Screen 
          name="suppliers-manage" 
          options={{ 
            title: 'Suppliers',
            headerBackTitle: 'Back',
            headerBackButtonVisible: true,
          }} 
        />
        <Stack.Screen 
          name="customers-manage" 
          options={{ 
            title: 'Customers',
            headerBackTitle: 'Back',
            headerBackButtonVisible: true,
          }} 
        />
        <Stack.Screen 
          name="receipt-details/[id]" 
          options={{ 
            title: 'Expenses Details'
          }} 
        />
        <Stack.Screen 
          name="invoice-details/[id]" 
          options={{ 
            title: 'Income Details'
          }} 
        />
        <Stack.Screen 
          name="inbound-details/[id]" 
          options={{ 
            title: 'Inbound Details'
          }} 
        />
        <Stack.Screen 
          name="outbound-details/[id]" 
          options={{ 
            title: 'Outbound Details'
          }} 
        />
        <Stack.Screen 
          name="login" 
          options={{ 
            headerShown: false
          }} 
        />
        <Stack.Screen 
          name="register" 
          options={{ 
            headerShown: false
          }} 
        />
        <Stack.Screen 
          name="reset-password" 
          options={{ 
            headerShown: false
          }} 
        />
        <Stack.Screen 
          name="set-password" 
          options={{ 
            headerShown: false
          }} 
        />
        <Stack.Screen 
          name="categories-manage" 
          options={{ 
            title: 'Manage Categories',
            headerBackTitle: 'Back',
            headerBackButtonVisible: true,
          }} 
        />
        <Stack.Screen 
          name="purposes-manage" 
          options={{ 
            title: 'Manage Purposes',
            headerBackTitle: 'Back',
            headerBackButtonVisible: true,
          }} 
        />
        <Stack.Screen 
          name="accounts-manage" 
          options={{ 
            title: 'Manage Accounts',
            headerBackTitle: 'Back',
            headerBackButtonVisible: true,
          }} 
        />
        <Stack.Screen 
          name="space-members" 
          options={{ 
            title: 'Space Members',
            headerBackTitle: 'Back',
            headerBackButtonVisible: true,
            presentation: 'card', // 确保使用 card 模式，避免导航问题
          }} 
        />
        <Stack.Screen 
          name="management" 
          options={{ 
            title: 'Management',
            headerBackTitle: 'Home'
          }} 
        />
        <Stack.Screen 
          name="space-manage" 
          options={{ 
            title: 'Space Information'
          }} 
        />
        <Stack.Screen 
          name="voice-input" 
          options={{ 
            title: 'Chat to Log',
            presentation: 'modal'
          }} 
        />
        <Stack.Screen 
          name="manual-entry" 
          options={{ 
            title: 'Add Expense',
            presentation: 'modal'
          }} 
        />
        <Stack.Screen 
          name="space-select" 
          options={{ 
            headerShown: false
          }} 
        />
        <Stack.Screen 
          name="profile" 
          options={{ 
            title: 'Personal Information'
          }} 
        />
        <Stack.Screen 
          name="auth/confirm" 
          options={{ 
            headerShown: false
          }} 
        />
        <Stack.Screen 
          name="invite/[id]" 
          options={{ 
            headerShown: false
          }} 
        />
        <Stack.Screen 
          name="handle-invitations" 
          options={{ 
            headerShown: false
          }} 
        />
        <Stack.Screen 
          name="setup-space" 
          options={{ 
            headerShown: false
          }} 
        />
      </Stack>
  );
}