/**
 * Tax Filing (client): Service orders / projects list. English copy.
 * Reuses mobile receipts list style: SectionList + row layout (no card/grid view).
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { showTaxFiling } from '@/lib/feature-flags';
import { getCurrentSpace } from '@/lib/auth';
import {
  getClientOrdersForClientSpace,
  confirmOrderAndCreateProjectTodos,
  getProjectByOrderId,
  updateOrderStatus,
  hideOrderForClientSpace,
  unhideOrderForClientSpace,
  type FirmOrderForClient,
} from '@/lib/firm';
import { showToast } from '@/lib/toast';
import { confirmDestructive } from '../../../shared-logic/alertWeb';

const PINNED_ORDER_IDS_KEY = 'tax_filing_pinned_order_ids';

/** In-memory fallback when AsyncStorage native module is null (e.g. Expo Go / unlinked build). */
const memoryFallback = new Map<string, string>();
const useNativeAsyncStorage = Platform.OS !== 'web' && Constants.appOwnership !== 'expo';

/** Resolve once: try loading AsyncStorage; if native module is null we get null and use memory only. */
let asyncStoragePromise: Promise<typeof import('@react-native-async-storage/async-storage').default | null> | null = null;
function getAsyncStorage(): Promise<typeof import('@react-native-async-storage/async-storage').default | null> {
  if (asyncStoragePromise != null) return asyncStoragePromise;
  asyncStoragePromise = (async () => {
    try {
      const m = await import('@react-native-async-storage/async-storage');
      return m.default;
    } catch {
      return null;
    }
  })();
  return asyncStoragePromise;
}

async function safeGetItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  }
  if (!useNativeAsyncStorage) {
    return memoryFallback.get(key) ?? null;
  }
  const AsyncStorage = await getAsyncStorage();
  if (AsyncStorage == null) return memoryFallback.get(key) ?? null;
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}
async function safeSetItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {
      memoryFallback.set(key, value);
    }
    return;
  }
  if (!useNativeAsyncStorage) {
    memoryFallback.set(key, value);
    return;
  }
  const AsyncStorage = await getAsyncStorage();
  if (AsyncStorage == null) {
    memoryFallback.set(key, value);
    return;
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    memoryFallback.set(key, value);
  }
}

const STAGE_LABEL: Record<string, string> = {
  onboarding: 'Onboarding',
  processing: 'Processing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STAGE_COLOR: Record<string, string> = {
  onboarding: '#E67E22',
  processing: '#29B6F6',
  completed: '#00B894',
  cancelled: '#B2BEC3',
};

/** 税季标签颜色（与报税项目 Info、订单详情、WEB 列表一致） */
const TAX_SEASON_COLORS = [
  '#6C5CE7', '#E17055', '#00B894', '#0984E3', '#FDCB6E',
  '#E84393', '#00CEC9', '#74B9FF', '#A29BFE', '#FD79A8',
];
function getTaxSeasonColor(year: number): string {
  return TAX_SEASON_COLORS[Math.abs(year) % 10] ?? TAX_SEASON_COLORS[0];
}

type SectionData = { title: string; monthKey: string; data: FirmOrderForClient[] };

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

export default function TaxFilingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<FirmOrderForClient[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [pinnedOrderIds, setPinnedOrderIds] = useState<string[]>([]);
  const [hidingId, setHidingId] = useState<string | null>(null);
  const [unhidingId, setUnhidingId] = useState<string | null>(null);

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
      const raw = await safeGetItem(PINNED_ORDER_IDS_KEY);
      if (raw) {
        try {
          const ids = JSON.parse(raw) as string[];
          if (Array.isArray(ids)) setPinnedOrderIds(ids);
        } catch (_) {}
      }
    })();
  }, []);

  const sortedOrders = useMemo(() => {
    const visible = orders.filter((o) => !o.hiddenFromClientAt);
    return [...visible].sort((a, b) => {
      const pa = pinnedOrderIds.includes(a.id);
      const pb = pinnedOrderIds.includes(b.id);
      if (pa && !pb) return -1;
      if (!pa && pb) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [orders, pinnedOrderIds]);

  const hiddenOrders = useMemo(() => {
    return orders
      .filter((o) => o.hiddenFromClientAt)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [orders]);

  const sections = useMemo((): SectionData[] => {
    const out: SectionData[] = [{ title: 'Active', monthKey: 'active', data: sortedOrders }];
    if (hiddenOrders.length > 0) {
      out.push({ title: `Hidden (${hiddenOrders.length})`, monthKey: 'hidden', data: hiddenOrders });
    }
    return out;
  }, [sortedOrders, hiddenOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setOrders(await loadOrders());
    setRefreshing(false);
  }, [loadOrders]);

  const handleTogglePin = useCallback(async (orderId: string) => {
    setPinnedOrderIds((prev) => {
      const next = prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId];
      safeSetItem(PINNED_ORDER_IDS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const handleConfirmOrder = async (order: FirmOrderForClient) => {
    setConfirmingId(order.id);
    const { error } = await confirmOrderAndCreateProjectTodos(order.id);
    setConfirmingId(null);
    if (error) return;
    setOrders(await loadOrders());
    const project = await getProjectByOrderId(order.id);
    if (project?.id) router.push(`/tax-filing/project/${project.id}`);
  };

  const handleRejectOrder = useCallback((order: FirmOrderForClient) => {
    confirmDestructive(
      'Reject order',
      'Are you sure you want to reject this order? You can’t undo this.',
      async () => {
        setRejectingId(order.id);
        const { error } = await updateOrderStatus(order.id, 'cancelled');
        setRejectingId(null);
        if (error) {
          showToast(error.message ?? 'Failed to reject', 'error');
          return;
        }
        showToast('Order rejected', 'success');
        setOrders(await loadOrders());
      },
      { confirmLabel: 'Reject order' },
    );
  }, [loadOrders]);

  const hideOrderForClient = useCallback(async (orderId: string) => {
    setHidingId(orderId);
    const { error } = await hideOrderForClientSpace(orderId);
    setHidingId(null);
    if (error) {
      showToast(error.message ?? 'Failed to hide', 'error');
      return;
    }
    setOrders(await loadOrders());
  }, [loadOrders]);

  const unhideOrderForClient = useCallback(async (orderId: string) => {
    setUnhidingId(orderId);
    const { error } = await unhideOrderForClientSpace(orderId);
    setUnhidingId(null);
    if (error) {
      showToast(error.message ?? 'Failed to unhide', 'error');
      return;
    }
    setOrders(await loadOrders());
  }, [loadOrders]);

  const goToTodos = (order: FirmOrderForClient) => {
    if (order.projectId) {
      router.push(`/tax-filing/project/${order.projectId}`);
    } else {
      router.push(`/tax-filing/order/${order.id}`);
    }
  };

  const renderItem = useCallback(
    ({ item: order, section }: { item: FirmOrderForClient; section: SectionData }) => {
      const isHiddenSection = section.monthKey === 'hidden';
      const isOnboarding = order.status === 'onboarding';
      const isCancelled = order.status === 'cancelled';
      const displayName = getOrderDisplayName(order, isOnboarding);
      const taxSeasonYear = getTaxSeasonYear(order);
      const progress =
        !isOnboarding && !isCancelled && (order.taskTotal ?? 0) > 0
          ? { completed: order.taskCompleted ?? 0, total: order.taskTotal ?? 0 }
          : null;
      const progressPercent =
        progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

      return (
        <TouchableOpacity
          style={styles.receiptItem}
          onPress={() => (isHiddenSection ? goToTodos(order) : goToTodos(order))}
          onLongPress={() => (order.status !== 'onboarding' ? undefined : handleTogglePin(order.id))}
          activeOpacity={0.7}
        >
          <View style={styles.receiptContent}>
            <View style={styles.firstRow}>
              <View style={styles.firstRowLeft}>
                {taxSeasonYear != null && (
                  <View style={[styles.taxSeasonPill, { backgroundColor: getTaxSeasonColor(taxSeasonYear) }]}>
                    <Text style={styles.taxSeasonText}>{taxSeasonYear}</Text>
                  </View>
                )}
                <Text style={[styles.storeName, isCancelled && styles.mutedText]} numberOfLines={1}>
                  {displayName}
                </Text>
              </View>
              {isHiddenSection ? (
                <TouchableOpacity
                  style={styles.unhideBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    unhideOrderForClient(order.id);
                  }}
                  disabled={unhidingId === order.id}
                >
                  {unhidingId === order.id ? (
                    <ActivityIndicator size="small" color="#6C5CE7" />
                  ) : (
                    <Text style={styles.unhideBtnText}>Unhide</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.secondRow}>
              <View style={[styles.statusBadge, { backgroundColor: STAGE_COLOR[order.status] ?? '#95A5A6' }]}>
                <Text style={styles.statusText}>{STAGE_LABEL[order.status] ?? order.status}</Text>
              </View>
              {order.firmName ? (
                <Text style={styles.footerText}>By {order.firmName}</Text>
              ) : null}
            </View>
            {isOnboarding && !isCancelled && !isHiddenSection ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleRejectOrder(order);
                  }}
                  disabled={rejectingId === order.id}
                >
                  {rejectingId === order.id ? (
                    <ActivityIndicator size="small" color="#636E72" />
                  ) : (
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.acceptBtn, confirmingId === order.id && styles.acceptBtnDisabled]}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleConfirmOrder(order);
                  }}
                  disabled={confirmingId === order.id}
                >
                  {confirmingId === order.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.acceptBtnText}>Accept and Start</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : progress ? (
              <View style={styles.progressRow}>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                </View>
                <Text style={styles.progressDetailText}>
                  {progress.completed}/{progress.total} • {progressPercent}%
                </Text>
              </View>
            ) : !isHiddenSection && isCancelled ? (
              <View style={styles.progressRow}>
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={(e) => {
                    e.stopPropagation();
                    hideOrderForClient(order.id);
                  }}
                  disabled={hidingId === order.id}
                  style={styles.settingsIcon}
                >
                  {hidingId === order.id ? (
                    <ActivityIndicator size="small" color="#C0392B" />
                  ) : (
                    <Ionicons name="trash-outline" size={20} color="#C0392B" />
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [
      confirmingId,
      rejectingId,
      hidingId,
      unhidingId,
      handleConfirmOrder,
      handleRejectOrder,
      handleTogglePin,
      hideOrderForClient,
      unhideOrderForClient,
    ],
  );

  const renderSectionHeader = useCallback(({ section }: { section: SectionData }) => {
    if (!section.title) return null;
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.data.length} orders</Text>
      </View>
    );
  }, []);

  if (!showTaxFiling) return null;

  return (
    <View style={styles.container}>
      <SectionList<FirmOrderForClient, SectionData>
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={
          sections.every((s) => s.data.length === 0) ? styles.emptyList : styles.listContent
        }
        ListEmptyComponent={
          loading && orders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color="#6C5CE7" />
              <Text style={styles.emptyText}>Loading...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color="#BDC3C7" />
              <Text style={styles.emptyText}>No orders yet</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ECEFF1',
  },
  toolbarSlot: {
    height: 52,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
    justifyContent: 'center',
  },
  header: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
  },
  receiptItem: {
    backgroundColor: '#fff',
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 12,
    paddingLeft: 24,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderRadius: 12,
    // 轻微底部阴影，让卡片与背景分层
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  receiptContent: {
    flex: 1,
  },
  firstRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  firstRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  firstRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    marginRight: 12,
  },
  mutedText: {
    color: '#95A5A6',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  taxSeasonPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  taxSeasonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  settingsIcon: {
    padding: 4,
  },
  secondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 14,
    color: '#636E72',
    marginLeft: 'auto',
  },
  progressText: {
    fontSize: 14,
    color: '#6C5CE7',
    fontWeight: '500',
  },
  dateText: {
    fontSize: 14,
    color: '#636E72',
    marginLeft: 'auto',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    minHeight: 30,
    marginTop: 4,
  },
  progressRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    minHeight: 30,
  },
  progressBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#6C5CE7',
  },
  progressDetailText: {
    fontSize: 12,
    color: '#636E72',
    fontWeight: '500',
  },
  acceptBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    minHeight: 30,
    borderRadius: 10,
    backgroundColor: '#6C5CE7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  acceptBtnDisabled: {
    opacity: 0.7,
  },
  acceptBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  rejectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    minHeight: 30,
    borderRadius: 10,
    backgroundColor: '#FFE5E5',
    justifyContent: 'center',
    alignItems: 'center',
    // 更轻的阴影，避免过重的红色块感
    ...(Platform.OS === 'web' || Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 }
      : {}),
    ...(Platform.OS === 'android' ? { elevation: 1 } : {}),
  },
  rejectBtnText: {
    fontSize: 14,
    color: '#C0392B',
    fontWeight: '600',
  },
  unhideBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E8E0F7',
  },
  unhideBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  sectionHeader: {
    backgroundColor: '#E9ECEF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3436',
  },
  sectionCount: {
    fontSize: 14,
    color: '#636E72',
  },
  listContent: {
    paddingHorizontal: 4,
    paddingTop: 0,
    paddingBottom: 100,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#636E72',
    marginTop: 16,
    fontWeight: '600',
  },
});
