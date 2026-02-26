/**
 * Web 端左侧栏：品牌、空间选择、模块入口、Chat 两个按钮、用户信息。
 * 仅用于 Platform.OS === 'web'，由 _layout 包裹主内容区展示。
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
} from 'react-native';

import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentUser, getCurrentSpace } from '@/lib/auth';
import { getPendingInvitationsForUser, subscribePendingInvitationsRealtime } from '@/lib/space-invitations';
import { Space, User } from '@/types';
import { showAiInventory, showTaxFiling } from '@/lib/feature-flags';

const SIDEBAR_WIDTH = 240;
const HIDE_SIDEBAR_ROUTES = [
  'login',
  'register',
  'reset-password',
  'set-password',
  'setup-space',
  'space-select',
  'handle-invitations',
  'auth',
  'invite',
];

export function shouldShowWebSidebar(pathname: string): boolean {
  if (Platform.OS !== 'web') return false;
  const first = pathname.replace(/^\//, '').split('/')[0] || 'index';
  return !HIDE_SIDEBAR_ROUTES.includes(first);
}

interface NavItem {
  path: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  match?: (path: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'grid-outline', match: (p) => p === '/' || p === '' },
  { path: '/receipts', label: 'Expenses', icon: 'document-text-outline', match: (p) => p.startsWith('/receipts') || p.startsWith('/receipt-details') },
  { path: '/invoices', label: 'Income', icon: 'arrow-up-circle-outline', match: (p) => p.startsWith('/invoices') || p.startsWith('/invoice-details') },
];

export default function WebSidebar() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [currentSpace, setCurrentSpaceState] = useState<Space | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [pendingInvitationsCount, setPendingInvitationsCount] = useState(0);
  const [spaceLoaded, setSpaceLoaded] = useState(false);

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      const [spaceData, userData, invitations] = await Promise.all([
        getCurrentSpace(forceRefresh),
        getCurrentUser(forceRefresh),
        getPendingInvitationsForUser().catch(() => []),
      ]);
      setCurrentSpaceState(spaceData ?? null);
      setUser(userData ?? null);
      setPendingInvitationsCount(invitations?.length ?? 0);
    } catch (e) {
      console.error('WebSidebar loadData:', e);
    } finally {
      setSpaceLoaded(true);
    }
  }, []);

  // 初始加载 + 路由变化时刷新
  useEffect(() => {
    loadData(true);
  }, [loadData, pathname]);

  // Web 端：Supabase Realtime 订阅，邀请数据变化时刷新角标
  useEffect(() => {
    if (Platform.OS !== 'web' || !user?.email) return;
    const refreshCount = () => {
      getPendingInvitationsForUser()
        .then((inv) => setPendingInvitationsCount(inv.length))
        .catch(() => {});
    };
    const unsubscribe = subscribePendingInvitationsRealtime(user.email, refreshCount);
    return unsubscribe;
  }, [Platform.OS, user?.email]);

  const isActive = (item: NavItem) => {
    if (item.match) return item.match(pathname);
    return pathname === item.path || pathname.startsWith(item.path + '/');
  };

  return (
    <View style={styles.sidebar}>
      {/* 品牌：项目 logo + 名称 */}
      <View style={styles.brand}>
        <Image
          source={require('../../../assets/icon.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.brandText}>Vouchap</Text>
      </View>

      {/* 空间名称：点击进入管理页（与底部个人信息一致） */}
      <TouchableOpacity
        style={styles.spaceButton}
        onPress={() => router.push('/management')}
        activeOpacity={0.7}
      >
        <Ionicons name="home-outline" size={20} color="#6C5CE7" />
        <Text style={styles.spaceText} numberOfLines={1}>
          {currentSpace?.name || 'Select space'}
        </Text>
      </TouchableOpacity>

      {/* 主导航：firm 仅展示 Dashboard + 四宫格；普通 space 展示 Dashboard / Expenses / Income / AI Inventory / 报税 */}
      <View style={styles.nav}>
        {!spaceLoaded ? null : currentSpace?.kind === 'firm' ? (
          <>
            <TouchableOpacity
              style={[styles.navItem, (pathname === '/' || pathname === '') && styles.navItemActive]}
              onPress={() => router.push('/')}
              activeOpacity={0.7}
            >
              <Ionicons name="grid-outline" size={22} color={pathname === '/' || pathname === '' ? '#6C5CE7' : '#2D3436'} />
              <Text style={[styles.navText, (pathname === '/' || pathname === '') && styles.navTextActive]}>
                Insights
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navItem, pathname.startsWith('/firm/clients') && styles.navItemActive]}
              onPress={() => router.push('/firm/clients')}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={22} color={pathname.startsWith('/firm/clients') ? '#6C5CE7' : '#2D3436'} />
              <Text style={[styles.navText, pathname.startsWith('/firm/clients') && styles.navTextActive]}>Clients</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navItem, pathname.startsWith('/firm/engagements') && styles.navItemActive]}
              onPress={() => router.push('/firm/engagements')}
              activeOpacity={0.7}
            >
              <Ionicons name="checkbox-outline" size={22} color={pathname.startsWith('/firm/engagements') ? '#6C5CE7' : '#2D3436'} />
              <Text style={[styles.navText, pathname.startsWith('/firm/engagements') && styles.navTextActive]}>Engagements</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navItem, pathname.startsWith('/firm/service-catalog') && styles.navItemActive]}
              onPress={() => router.push('/firm/service-catalog')}
              activeOpacity={0.7}
            >
              <Ionicons name="document-attach-outline" size={22} color={pathname.startsWith('/firm/service-catalog') ? '#6C5CE7' : '#2D3436'} />
              <Text style={[styles.navText, pathname.startsWith('/firm/service-catalog') && styles.navTextActive]}>Service Catalog</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <TouchableOpacity
                  key={item.path}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => router.push(item.path as any)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon}
                    size={22}
                    color={active ? '#6C5CE7' : '#2D3436'}
                  />
                  <Text style={[styles.navText, active && styles.navTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {showAiInventory && (
              <TouchableOpacity
                style={[styles.navItem, pathname.startsWith('/ai-inventory') && styles.navItemActive]}
                onPress={() => router.push('/ai-inventory')}
                activeOpacity={0.7}
              >
                <Ionicons name="cube-outline" size={22} color={pathname.startsWith('/ai-inventory') ? '#FF9500' : '#2D3436'} />
                <Text style={[styles.navText, pathname.startsWith('/ai-inventory') && styles.navTextAlt]}>
                  AI Inventory
                </Text>
              </TouchableOpacity>
            )}
            {showTaxFiling && (
              <TouchableOpacity
                style={[styles.navItem, pathname.startsWith('/tax-filing') && styles.navItemActive]}
                onPress={() => router.push('/tax-filing')}
                activeOpacity={0.7}
              >
                <Ionicons name="document-text-outline" size={22} color={pathname.startsWith('/tax-filing') ? '#0984e3' : '#2D3436'} />
                <Text style={[styles.navText, pathname.startsWith('/tax-filing') && styles.navTextActive]}>
                  报税
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* 用户信息：邀请通知 icon+角标 浮在卡片右上角 */}
      <View style={styles.userCardWrap}>
        <TouchableOpacity
          style={styles.userCard}
          onPress={() => router.push('/management')}
          activeOpacity={0.7}
        >
          <View style={styles.userAvatar}>
            <Text style={styles.userInitial}>
              {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.name || 'User'}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {user?.email || ''}
            </Text>
          </View>
        </TouchableOpacity>
        {pendingInvitationsCount > 0 && (
          <TouchableOpacity
            style={styles.invitationsFloating}
            onPress={() => router.push('/handle-invitations')}
            activeOpacity={0.7}
          >
            <Ionicons name="mail-outline" size={24} color="#6C5CE7" />
            <View style={styles.invitationsBadge}>
              <Text style={styles.invitationsBadgeText}>
                {pendingInvitationsCount > 99 ? '99+' : pendingInvitationsCount}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    minWidth: SIDEBAR_WIDTH,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#E9ECEF',
    paddingVertical: 16,
    paddingHorizontal: 12,
    flex: 0,
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  logoImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
  },
  spaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 8,
  },
  spaceText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#2D3436',
  },
  nav: {
    flex: 1,
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 10,
  },
  navItemActive: {
    backgroundColor: '#E8F4FD',
  },
  navText: {
    fontSize: 15,
    color: '#2D3436',
  },
  navTextActive: {
    color: '#6C5CE7',
    fontWeight: '600',
  },
  navTextAlt: {
    color: '#FF9500',
    fontWeight: '600',
  },
  userCardWrap: {
    position: 'relative',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invitationsFloating: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  invitationsBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#E74C3C',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  invitationsBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  userInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  userInfo: { flex: 1, minWidth: 0 },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3436',
  },
  userEmail: {
    fontSize: 12,
    color: '#636E72',
    marginTop: 2,
  },
});
