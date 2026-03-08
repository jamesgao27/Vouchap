import { Stack, usePathname } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import * as Font from 'expo-font';
import { validateSupabaseConfig } from '@/lib/supabase';
import { getCurrentSpace } from '@/lib/auth';
import { ToastHost } from '@/components/ToastHost';
import { ConfirmModalHost } from '@/components/ConfirmModalHost';
import WebSidebar, { shouldShowWebSidebar } from '@/components/WebSidebar';
import { FirmPendingOverlay } from '@/components/FirmPendingOverlay';
import WebChatFab from '@/components/WebChatFab';
import WebChatPanel from '@/components/WebChatPanel';
import { ChatPanelProvider, useChatPanel, type ChatPanelType } from '../contexts/ChatPanelContext';

/** 基础数据设置页：这些页不显示 chat-to-log 气泡（已打开的右栏保留） */
function isSettingsPage(pathname: string): boolean {
  const base = pathname?.replace(/^\//, '').split('/')[0] || '';
  return ['entities-manage', 'accounts-manage', 'categories-manage', 'purposes-manage', 'skus-manage', 'warehouse-manage', 'management', 'space-manage'].includes(base);
}

/** 某些页面完全不显示 chat-to-log（右栏 + 气泡都关掉） */
function isChatDisabledPath(pathname: string | null): boolean {
  if (!pathname) return false;
  // Dashboard（首页）
  if (pathname === '/' || pathname === '/index') return true;
  // 报税项目列表页：仅浏览，不支持 chat-to-log
  if (pathname === '/tax-filing') return true;
  return false;
}

function chatTypeFromPathname(pathname: string | null): ChatPanelType | null {
  if (!pathname) return null;
  // 报税相关路径：firm 订单列表 / 详情 以及 tax-filing 项目路由，统一映射为 tax-filing
  if (pathname === '/firm/todos' || pathname.startsWith('/firm/todos/')) return 'tax-filing';
  if (pathname === '/firm/engagements' || pathname.startsWith('/firm/engagement/')) return 'tax-filing';
  if (pathname.startsWith('/tax-filing')) return 'tax-filing';
  // Clients 模块：Cody (Client Assistant)
  if (pathname === '/firm/clients' || pathname.startsWith('/firm/clients/') || pathname.startsWith('/firm/client/')) return 'client';
  if (pathname === '/receipts' || pathname.startsWith('/receipts/')) return 'receipt';
  if (pathname === '/invoices' || pathname.startsWith('/invoices/')) return 'invoice';
  if (pathname === '/inbound' || pathname.startsWith('/inbound/')) return 'inbound';
  if (pathname === '/outbound' || pathname.startsWith('/outbound/')) return 'outbound';
  return null;
}

// Web 部署后 bundled 字体 URL 易 404，用 CDN 预加载保证图标显示（与 @expo/vector-icons 同源字体）
const IONICONS_FONT_URL =
  'https://cdn.jsdelivr.net/npm/@expo/vector-icons@15.0.3/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf';

/** 不同页面的默认 chat 开关策略 */
function defaultChatOpen(pathname: string | null): boolean {
  if (!pathname) return false;
  // 完全关闭 chat 的页面
  if (isChatDisabledPath(pathname)) return false;
  // 报税项目详情页：每次进入都默认打开右栏
  if (pathname.startsWith('/tax-filing/project/')) return true;
  // 费用、收入、库存列表页：默认打开右栏
  if (pathname === '/receipts' || pathname.startsWith('/receipts/')) return true;
  if (pathname === '/invoices' || pathname.startsWith('/invoices/')) return true;
  if (pathname === '/inbound' || pathname.startsWith('/inbound/')) return true;
  if (pathname === '/outbound' || pathname.startsWith('/outbound/')) return true;
  // Clients 模块：默认打开右栏（Cody）
  if (pathname === '/firm/clients' || pathname.startsWith('/firm/clients/') || pathname.startsWith('/firm/client/')) return true;
  // 其他页面默认关闭
  return false;
}

function LayoutContent() {
  const pathname = usePathname();
  // 首帧 pathname 可能未就绪（路由水合），用 URL 兜底，避免 Clients 页先显示 Eric 再闪成 Cody
  const pathnameForType =
    pathname ??
    (Platform.OS === 'web' && typeof window !== 'undefined' ? (window as any).location?.pathname ?? null : null);
  const showSidebar = Platform.OS === 'web' && shouldShowWebSidebar(pathname ?? '/');
  const { open: chatOpen, setOpen: setChatOpen, setType: setChatType, type: chatType } = useChatPanel();
  const [currentSpace, setCurrentSpace] = useState<{ kind?: string; firmStatus?: string } | null>(null);

  const loadSpace = useCallback(async () => {
    try {
      const space = await getCurrentSpace();
      setCurrentSpace(space ?? null);
    } catch {
      setCurrentSpace(null);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !showSidebar) return;
    loadSpace();
  }, [loadSpace, showSidebar, pathname]);

  const isFirmPending =
    Platform.OS === 'web' &&
    showSidebar &&
    currentSpace?.kind === 'firm' &&
    currentSpace?.firmStatus !== 'approved';
  const showFirmPendingOverlay = isFirmPending && (pathname === '/' || pathname === '/index' || (pathname?.startsWith('/firm')));

  // Web：根据不同页面应用默认的 chat 开关策略
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const openDefault = defaultChatOpen(pathname ?? null);
    setChatOpen(openDefault);
  }, [pathname, setChatOpen]);

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

  const chatDisabled = Platform.OS === 'web' && isChatDisabledPath(pathname ?? '/');

  return (
    <View style={[styles.root, showSidebar && styles.webRow]}>
      {showSidebar && <WebSidebar />}
      <View style={mainAreaStyle}>
      {showFirmPendingOverlay ? (
        <FirmPendingOverlay />
      ) : (
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
            title: 'Tax Filing',
            headerBackTitle: 'Home'
          }} 
        />
        <Stack.Screen 
          name="tax-filing/order/[orderId]" 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="tax-filing/project/[projectId]" 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="firm/clients" 
          options={{ title: 'Clients', headerBackTitle: 'Back' }} 
        />
        <Stack.Screen 
          name="firm/client/[clientSpaceId]" 
          options={{ title: '', headerBackTitle: 'Back', headerBackButtonVisible: true }} 
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
          options={{ title: '', headerBackTitle: 'Back', headerBackButtonVisible: true }} 
        />
        <Stack.Screen 
          name="firm/sku/[skuId]" 
          options={{ headerShown: false }} 
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
            title: 'Assistant',
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
      )}
      </View>
      {showSidebar && !chatDisabled && chatOpen && (
        <WebChatPanel effectiveType={chatTypeFromPathname(pathnameForType) ?? chatType ?? 'receipt'} />
      )}
      {showSidebar && !chatDisabled && !chatOpen && Platform.OS === 'web' && pathname !== '/chat-to-log' && !pathname?.startsWith('/receipts') && !pathname?.startsWith('/invoices') && !pathname?.startsWith('/receipt-details') && !pathname?.startsWith('/invoice-details') && !pathname?.startsWith('/inbound-details') && !pathname?.startsWith('/outbound-details') && !isSettingsPage(pathname ?? '') && (
        <WebChatFab type={chatTypeFromPathname(pathnameForType) ?? 'receipt'} />
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