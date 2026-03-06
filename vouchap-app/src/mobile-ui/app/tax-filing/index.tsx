/**
 * Tax Filing (client): Service orders / projects list. English copy.
 * 卡片/列表复用 ProjectListCardAndRow，样式与 firm Service Catalog 一致。
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showTaxFiling } from '@/lib/feature-flags';
import { getCurrentSpace } from '@/lib/auth';
import {
  getClientOrdersForClientSpace,
  confirmOrderAndCreateProjectTodos,
  type FirmOrderForClient,
} from '@/lib/firm';
import {
  ProjectListCard,
  ProjectListRow,
  GRID_GAP,
  projectListStyles,
  type ProjectListCardItem,
} from '@/components/ProjectListCardAndRow';

const CARD_MAX_WIDTH = 320;
const PINNED_ORDER_IDS_KEY = 'tax_filing_pinned_order_ids';

/** 订单阶段（6 阶段 + 取消），Onboarding = 启动/契约建立，与后端一致 */
const STAGE_LABEL: Record<string, string> = {
  onboarding: 'Onboarding',
  collecting: 'Collecting',
  processing: 'Processing',
  reviewing: 'Reviewing',
  filing: 'Filing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STAGE_COLOR: Record<string, string> = {
  onboarding: '#6C5CE7',
  collecting: '#0984E3',
  processing: '#FDCB6E',
  reviewing: '#E17055',
  filing: '#00CEC9',
  completed: '#00B894',
  cancelled: '#636E72',
};

/** 税季标签颜色：10 年周期循环 */
const TAX_SEASON_COLORS = [
  '#6C5CE7', '#E17055', '#00B894', '#0984E3', '#FDCB6E',
  '#E84393', '#00CEC9', '#74B9FF', '#A29BFE', '#FD79A8',
];

function getTaxSeasonColor(year: number): string {
  return TAX_SEASON_COLORS[Math.abs(year) % 10] ?? TAX_SEASON_COLORS[0];
}

type ViewMode = 'grid' | 'list';

export default function TaxFilingScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<FirmOrderForClient[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pinnedOrderIds, setPinnedOrderIds] = useState<string[]>([]);

  const loadOrders = useCallback(async () => {
    const space = await getCurrentSpace(true);
    if (!space?.id) return [];
    return getClientOrdersForClientSpace(space.id);
  }, []);

  useEffect(() => {
    if (!showTaxFiling) {
      router.replace('/');
      return;
    }
    (async () => {
      setLoading(true);
      setOrders(await loadOrders());
      setLoading(false);
    })();
  }, [showTaxFiling, loadOrders, router]);

  useEffect(() => {
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const raw = await AsyncStorage.getItem(PINNED_ORDER_IDS_KEY);
        if (raw) {
          const ids = JSON.parse(raw) as string[];
          if (Array.isArray(ids)) setPinnedOrderIds(ids);
        }
      } catch (_) {}
    })();
  }, []);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const pa = pinnedOrderIds.includes(a.id);
      const pb = pinnedOrderIds.includes(b.id);
      if (pa && !pb) return -1;
      if (!pa && pb) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [orders, pinnedOrderIds]);

  const handleTogglePin = useCallback(async (orderId: string) => {
    setPinnedOrderIds((prev) => {
      const next = prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId];
      import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
        AsyncStorage.setItem(PINNED_ORDER_IDS_KEY, JSON.stringify(next)).catch(() => {});
      }).catch(() => {});
      return next;
    });
  }, []);

  const handleConfirmOrder = async (order: FirmOrderForClient) => {
    setConfirmingId(order.id);
    const { error } = await confirmOrderAndCreateProjectTodos(order.id);
    setConfirmingId(null);
    if (!error) setOrders(await loadOrders());
  };

  /** 点击卡片/行：已接受订单进 project 路由（client 主权），未接受进 order 路由 */
  const goToTodos = (order: FirmOrderForClient) => {
    if (order.projectId) {
      router.push(`/tax-filing/project/${order.projectId}`);
    } else {
      router.push(`/tax-filing/order/${order.id}`);
    }
  };
  /** 点击 edit：进入项目信息页
   *  - 已接受：跳转到 project 页并激活 Info 页签 + 编辑态
   *  - 未接受：仍使用 order info 路由
   */
  const goToInfo = (order: FirmOrderForClient) => {
    if (order.projectId) {
      router.push(`/tax-filing/project/${order.projectId}?tab=info&edit=1`);
    } else {
      router.push(`/tax-filing/order/${order.id}/info`);
    }
  };

  const numColumns = Platform.select({
    web: Math.max(2, Math.floor((windowWidth - 48) / (200 + GRID_GAP))),
    default: 2,
  });
  const cardWidth =
    Platform.OS === 'web'
      ? Math.min(CARD_MAX_WIDTH, (windowWidth - 48 - GRID_GAP * (numColumns - 1)) / numColumns)
      : (windowWidth - 40 - GRID_GAP) / 2;

  if (!showTaxFiling) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? (
        <ActivityIndicator size="large" color="#6C5CE7" style={styles.loader} />
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.sectionTitle}>Service orders</Text>
            <View style={styles.viewToggle}>
              <TouchableOpacity
                style={[styles.viewToggleBtn, viewMode === 'grid' && styles.viewToggleBtnActive]}
                onPress={() => setViewMode('grid')}
                activeOpacity={0.7}
              >
                <Ionicons name="grid-outline" size={20} color={viewMode === 'grid' ? '#6C5CE7' : '#636E72'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
                onPress={() => setViewMode('list')}
                activeOpacity={0.7}
              >
                <Ionicons name="list" size={22} color={viewMode === 'list' ? '#6C5CE7' : '#636E72'} />
              </TouchableOpacity>
            </View>
          </View>
          {sortedOrders.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionText}>No orders yet</Text>
            </View>
          ) : viewMode === 'list' ? (
            <View style={projectListStyles.list}>
              {sortedOrders.map((o) => {
                const item = orderToItem(o, confirmingId, handleConfirmOrder);
                return (
                  <ProjectListRow
                    key={o.id}
                    item={item}
                    isPinned={pinnedOrderIds.includes(o.id)}
                    onTogglePin={() => handleTogglePin(o.id)}
                    onPress={() => goToTodos(o)}
                    onSettings={o.status !== 'onboarding' ? () => goToInfo(o) : undefined}
                  />
                );
              })}
            </View>
          ) : (
            <View style={styles.grid}>
              {sortedOrders.map((o) => {
                const item = orderToItem(o, confirmingId, handleConfirmOrder);
                return (
                  <ProjectListCard
                    key={o.id}
                    item={item}
                    cardWidth={cardWidth}
                    isPinned={pinnedOrderIds.includes(o.id)}
                    onTogglePin={() => handleTogglePin(o.id)}
                    onPress={() => goToTodos(o)}
                    onSettings={o.status !== 'onboarding' ? () => goToInfo(o) : undefined}
                  />
                );
              })}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function getTaxSeasonYear(order: FirmOrderForClient): number | null {
  const d = order.dueAt || order.createdAt || null;
  if (!d) return null;
  try {
    return new Date(d).getFullYear();
  } catch {
    return null;
  }
}

function getOrderDisplayName(order: FirmOrderForClient, isOnboarding: boolean): string {
  return isOnboarding ? (order.skuName ?? 'Service order') : (order.projectName ?? order.skuName ?? 'Project');
}

function orderToItem(
  order: FirmOrderForClient,
  confirmingId: string | null,
  onConfirm: (order: FirmOrderForClient) => void
): ProjectListCardItem {
  const isOnboarding = order.status === 'onboarding';
  const taxSeasonYear = getTaxSeasonYear(order);
  return {
    id: order.id,
    displayName: getOrderDisplayName(order, isOnboarding),
    imageUrl: isOnboarding ? order.skuImageUrl ?? null : order.projectImageUrl ?? null,
    tagPill: taxSeasonYear != null ? { label: String(taxSeasonYear), color: getTaxSeasonColor(taxSeasonYear) } : null,
    statusLabel: STAGE_LABEL[order.status] ?? order.status,
    statusColor: STAGE_COLOR[order.status] ?? '#95A5A6',
    footerText: order.firmName ? `Services from ${order.firmName}` : null,
    progress:
      !isOnboarding && (order.taskTotal ?? 0) > 0
        ? { completed: order.taskCompleted ?? 0, total: order.taskTotal ?? 0 }
        : null,
    action: isOnboarding
      ? { label: 'Accept and start', onPress: () => onConfirm(order), confirming: confirmingId === order.id }
      : null,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 20, paddingBottom: 40 },
  loader: { marginTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#2D3436' },
  viewToggle: { flexDirection: 'row', gap: 4 },
  viewToggleBtn: { padding: 8, borderRadius: 8 },
  viewToggleBtnActive: { backgroundColor: '#EDE9FE' },
  emptySection: { paddingVertical: 24, alignItems: 'center' },
  emptySectionText: { fontSize: 14, color: '#95A5A6' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
});
