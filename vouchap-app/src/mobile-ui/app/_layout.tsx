import { Stack, usePathname } from 'expo-router';
import React, { useEffect } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import * as Font from 'expo-font';
import { validateSupabaseConfig } from '@/lib/supabase';
import { ToastHost } from '@/components/ToastHost';
import { ConfirmModalHost } from '@/components/ConfirmModalHost';
import WebSidebar, { shouldShowWebSidebar } from '@/components/WebSidebar';
import WebChatFab from '@/components/WebChatFab';
import WebChatPanel from '@/components/WebChatPanel';
import { ChatPanelProvider, useChatPanel, type ChatPanelType } from '../contexts/ChatPanelContext';

/** 基础数据设置页：这些页不显示 chat-to-log 气泡（已打开的右栏保留） */
function isSettingsPage(pathname: string): boolean {
  const base = pathname?.replace(/^\//, '').split('/')[0] || '';
  return ['entities-manage', 'accounts-manage', 'categories-manage', 'purposes-manage', 'skus-manage', 'warehouse-manage', 'management', 'space-manage'].includes(base);
}

function chatTypeFromPathname(pathname: string | null): ChatPanelType | null {
  if (!pathname) return null;
  if (pathname === '/receipts' || pathname.startsWith('/receipts/')) return 'receipt';
  if (pathname === '/invoices' || pathname.startsWith('/invoices/')) return 'invoice';
  if (pathname === '/inbound' || pathname.startsWith('/inbound/')) return 'inbound';
  if (pathname === '/outbound' || pathname.startsWith('/outbound/')) return 'outbound';
  return null;
}

// Web 部署后 bundled 字体 URL 易 404，用 CDN 预加载保证图标显示（与 @expo/vector-icons 同源字体）
const IONICONS_FONT_URL =
  'https://cdn.jsdelivr.net/npm/@expo/vector-icons@15.0.3/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf';

function LayoutContent() {
  const pathname = usePathname();
  const showSidebar = Platform.OS === 'web' && shouldShowWebSidebar(pathname ?? '/');
  const { open: chatOpen, setType: setChatType } = useChatPanel();

  // Web：主区切换到不同列表时，chat-to-log 提交类别跟随切换
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const type = chatTypeFromPathname(pathname ?? null);
    if (type) setChatType(type);
  }, [pathname, setChatType]);

  // Web：等 Ionicons 字体从 CDN 加载后再渲染，避免图标全缺
  const [webFontReady, setWebFontReady] = React.useState(
    () => Platform.OS !== 'web' || Font.isLoaded('ionicons')
  );
  useEffect(() => {
    if (Platform.OS !== 'web' || Font.isLoaded('ionicons')) {
      setWebFontReady(true);
      return;
    }
    Font.loadAsync({ ionicons: IONICONS_FONT_URL })
      .then(() => setWebFontReady(true))
      .catch((e) => {
        console.warn('Ionicons font load (CDN) failed:', e);
        setWebFontReady(true);
      });
  }, []);

  useEffect(() => {
    const config = validateSupabaseConfig();
    if (!config.valid) {
      console.warn('⚠️ Supabase配置警告:', config.error);
      console.warn('应用可能无法正常连接Supabase。请在构建时设置正确的环境变量。');
    }
  }, []);

  if (!webFontReady) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const mainAreaStyle = [
    styles.mainArea,
  ];

  return (
    <View style={[styles.root, showSidebar && styles.webRow]}>
      {showSidebar && <WebSidebar />}
      <View style={mainAreaStyle}>
      <Stack screenOptions={{ contentStyle: { flex: 1 } }}>
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
          name="tax-filing/index" 
          options={{ 
            title: '报税',
            headerBackTitle: 'Home'
          }} 
        />
        <Stack.Screen 
          name="firm/clients" 
          options={{ title: 'Clients', headerBackTitle: 'Back' }} 
        />
        <Stack.Screen 
          name="firm/assignments" 
          options={{ title: 'Assignment', headerBackTitle: 'Back' }} 
        />
        <Stack.Screen 
          name="firm/engagements" 
          options={{ title: 'Engagements', headerBackTitle: 'Back' }} 
        />
        <Stack.Screen 
          name="firm/engagement/[id]" 
          options={{ title: 'Engagement', headerBackTitle: 'Back' }} 
        />
        <Stack.Screen 
          name="firm/service-catalog" 
          options={{ title: 'Service Catalog', headerBackTitle: 'Back' }} 
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
          name="entities-manage" 
          options={{ 
            title: 'Entities',
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
          name="chat-to-log" 
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
          name="auth/setup" 
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
      </View>
      {showSidebar && chatOpen && <WebChatPanel />}
      {showSidebar && !chatOpen && Platform.OS === 'web' && pathname !== '/chat-to-log' && !pathname?.startsWith('/receipts') && !pathname?.startsWith('/invoices') && !pathname?.startsWith('/receipt-details') && !pathname?.startsWith('/invoice-details') && !pathname?.startsWith('/inbound-details') && !pathname?.startsWith('/outbound-details') && !isSettingsPage(pathname ?? '') && (
        <WebChatFab type={chatTypeFromPathname(pathname ?? null) ?? 'receipt'} />
      )}
      <ToastHost />
      <ConfirmModalHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  webRow: {
    flexDirection: 'row',
  },
  mainArea: {
    flex: 1,
    minWidth: 0,
  },
});

export default function RootLayout() {
  return (
    <ChatPanelProvider>
      <LayoutContent />
    </ChatPanelProvider>
  );
}