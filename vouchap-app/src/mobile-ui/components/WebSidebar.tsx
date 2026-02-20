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
import { Space, User } from '@/types';
import { showAiInventory } from '@/lib/feature-flags';

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
  { path: '/', label: 'Report', icon: 'grid-outline', match: (p) => p === '/' || p === '' },
  { path: '/invoices', label: 'Income', icon: 'arrow-up-circle-outline', match: (p) => p.startsWith('/invoices') || p.startsWith('/invoice-details') },
  { path: '/receipts', label: 'Expenses', icon: 'document-text-outline', match: (p) => p.startsWith('/receipts') || p.startsWith('/receipt-details') },
];

export default function WebSidebar() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [currentSpace, setCurrentSpaceState] = useState<Space | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      const [spaceData, userData] = await Promise.all([
        getCurrentSpace(forceRefresh),
        getCurrentUser(forceRefresh),
      ]);
      setCurrentSpaceState(spaceData ?? null);
      setUser(userData ?? null);
    } catch (e) {
      console.error('WebSidebar loadData:', e);
    }
  }, []);

  // 初始加载 + 路由变化时刷新
  useEffect(() => {
    loadData(true);
  }, [loadData, pathname]);

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

      {/* 主导航 */}
      <View style={styles.nav}>
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
      </View>

      {/* 用户信息：点击进入管理 */}
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
