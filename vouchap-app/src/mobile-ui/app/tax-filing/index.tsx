/**
 * Tax Filing (client): Service orders / projects list. English copy.
 * Card: 1:1 cover, status tag, edit icon (top-right, hover), firm name right in footer. No expand todos.
 * List view: compact horizontal row (thumbnail, name, status, progress, edit).
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showTaxFiling } from '@/lib/feature-flags';
import { getCurrentSpace } from '@/lib/auth';
import {
  getClientOrdersForClientSpace,
  confirmOrderAndCreateProjectTodos,
  type FirmOrderForClient,
} from '@/lib/firm';

const GRID_GAP = 16;
const LIST_ROW_HEIGHT = 72;

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
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<FirmOrderForClient[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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

  const handleConfirmOrder = async (order: FirmOrderForClient) => {
    setConfirmingId(order.id);
    const { error } = await confirmOrderAndCreateProjectTodos(order.id);
    setConfirmingId(null);
    if (!error) setOrders(await loadOrders());
  };

  const goToDetail = (orderId: string) => {
    router.push(`/tax-filing/order/${orderId}`);
  };

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
          {orders.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionText}>No orders yet</Text>
            </View>
          ) : viewMode === 'list' ? (
            <View style={styles.list}>
              {orders.map((o) => (
                <OrderListRow
                  key={o.id}
                  order={o}
                  onPress={() => goToDetail(o.id)}
                  onSettings={() => goToDetail(o.id)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.grid}>
              {orders.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onPress={() => goToDetail(o.id)}
                  onSettings={o.status !== 'onboarding' ? () => goToDetail(o.id) : undefined}
                  onConfirm={o.status === 'onboarding' ? () => handleConfirmOrder(o) : undefined}
                  confirming={confirmingId === o.id}
                />
              ))}
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

function OrderCard({
  order,
  onPress,
  onSettings,
  onConfirm,
  confirming,
}: {
  order: FirmOrderForClient;
  onPress: () => void;
  onSettings?: () => void;
  onConfirm?: () => void;
  confirming: boolean;
}) {
  const isOnboarding = order.status === 'onboarding';
  const displayName = getOrderDisplayName(order, isOnboarding);
  const taxSeasonYear = getTaxSeasonYear(order);
  const imageUrl = isOnboarding ? order.skuImageUrl : order.projectImageUrl;
  const total = order.taskTotal ?? 0;
  const completed = order.taskCompleted ?? 0;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const [hover, setHover] = useState(false);
  const showEdit = Platform.OS === 'web' ? hover : true;

  return (
    <View
      style={styles.cardWrap}
      onMouseEnter={Platform.OS === 'web' ? () => setHover(true) : undefined}
      onMouseLeave={Platform.OS === 'web' ? () => setHover(false) : undefined}
    >
      <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
        {/* 上部：1:1 封面 + 右上角 edit（hover 时显示，带淡化底色） */}
        <View style={styles.cardCoverWrap}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.cardCoverImg} resizeMode="cover" />
          ) : (
            <View style={styles.cardCoverPlaceholder}>
              <Ionicons name="document-text-outline" size={32} color="#B2BEC3" />
            </View>
          )}
          {onSettings && showEdit && (
            <TouchableOpacity
              style={styles.cardEditBtn}
              onPress={(e) => { e.stopPropagation(); onSettings(); }}
              hitSlop={8}
              activeOpacity={0.8}
            >
              <Ionicons name="pencil" size={18} color="#636E72" />
            </TouchableOpacity>
          )}
        </View>
        {/* 下部：项目信息，各行独立定位 */}
        <View style={styles.cardInfo}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {displayName}
            </Text>
          </View>
          {taxSeasonYear != null && (
            <View style={styles.cardRow}>
              <View style={[styles.taxSeasonPill, { backgroundColor: getTaxSeasonColor(taxSeasonYear) }]}>
                <Text style={styles.taxSeasonPillText}>{taxSeasonYear}</Text>
              </View>
            </View>
          )}
          {!isOnboarding && total > 0 && (
            <View style={styles.cardRowProgress}>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressTextRight}>{completed}/{total} · {progress}%</Text>
            </View>
          )}
          <View style={styles.cardRowFooter}>
            <View style={[styles.statusPill, { backgroundColor: STAGE_COLOR[order.status] ?? '#95A5A6' }]}>
              <Text style={styles.statusPillText}>{STAGE_LABEL[order.status] ?? order.status}</Text>
            </View>
            {order.firmName ? (
              <Text style={styles.cardFirmName} numberOfLines={1}>{order.firmName}</Text>
            ) : (
              <View style={styles.cardFirmName} />
            )}
          </View>
        </View>
        {isOnboarding && onConfirm && (
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            disabled={confirming}
            activeOpacity={0.8}
          >
            {confirming ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.acceptBtnText}>Accept and start</Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );
}

function OrderListRow({
  order,
  onPress,
  onSettings,
}: {
  order: FirmOrderForClient;
  onPress: () => void;
  onSettings: () => void;
}) {
  const isOnboarding = order.status === 'onboarding';
  const displayName = getOrderDisplayName(order, isOnboarding);
  const taxSeasonYear = getTaxSeasonYear(order);
  const imageUrl = isOnboarding ? order.skuImageUrl : order.projectImageUrl;
  const total = order.taskTotal ?? 0;
  const completed = order.taskCompleted ?? 0;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const titleText = taxSeasonYear != null ? `${taxSeasonYear} · ${displayName}` : displayName;

  return (
    <TouchableOpacity style={styles.listRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.listCover1x1}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cover1x1} resizeMode="cover" />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Ionicons name="document-text-outline" size={24} color="#B2BEC3" />
          </View>
        )}
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {titleText}
        </Text>
        <View style={styles.listMeta}>
          <View style={styles.listMetaLeft}>
            <View style={[styles.statusPillSmall, { backgroundColor: STAGE_COLOR[order.status] ?? '#95A5A6' }]}>
              <Text style={styles.statusPillText}>{STAGE_LABEL[order.status] ?? order.status}</Text>
            </View>
            {!isOnboarding && total > 0 && (
              <>
                <Text style={styles.listCount}>{completed}/{total}</Text>
                <View style={styles.progressBarTrackSmall}>
                  <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.listProgressPct}>{progress}%</Text>
              </>
            )}
          </View>
          {order.firmName ? (
            <Text style={styles.listFirmName} numberOfLines={1}>{order.firmName}</Text>
          ) : null}
        </View>
      </View>
      <TouchableOpacity
        style={styles.listEdit}
        onPress={(e) => { e.stopPropagation(); onSettings(); }}
        hitSlop={8}
      >
        <Ionicons name="pencil" size={18} color="#636E72" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
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
  cardWrap: { width: '100%', maxWidth: 320 },
  card: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  cardCoverWrap: { width: '100%', aspectRatio: 1, backgroundColor: '#E9ECEF', overflow: 'hidden', position: 'relative' },
  cardCoverImg: { width: '100%', height: '100%' },
  cardCoverPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  cardEditBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { padding: 12 },
  cardRow: { marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#2D3436' },
  taxSeasonPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  taxSeasonPillText: { fontSize: 12, color: '#FFF', fontWeight: '600' },
  cardRowProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  progressBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E9ECEF', overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#00B894', borderRadius: 3 },
  progressTextRight: { fontSize: 12, color: '#636E72', marginLeft: 4 },
  cardRowFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusPillText: { fontSize: 12, color: '#FFF', fontWeight: '600' },
  cardFirmName: { fontSize: 11, color: '#95A5A6', maxWidth: '50%', textAlign: 'right' },
  acceptBtn: {
    marginHorizontal: 12,
    marginBottom: 12,
    paddingVertical: 10,
    backgroundColor: '#00B894',
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptBtnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  list: { gap: 1, backgroundColor: '#E9ECEF', borderRadius: 12, overflow: 'hidden' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: LIST_ROW_HEIGHT,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
  },
  listCover1x1: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#E9ECEF',
  },
  coverPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  listBody: { flex: 1, marginLeft: 12, minWidth: 0 },
  listTitle: { fontSize: 14, fontWeight: '600', color: '#2D3436', marginBottom: 4 },
  listMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  listMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  statusPillSmall: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  listCount: { fontSize: 11, color: '#636E72' },
  progressBarTrackSmall: { flex: 1, maxWidth: 80, height: 4, borderRadius: 2, backgroundColor: '#E9ECEF', overflow: 'hidden' },
  listProgressPct: { fontSize: 11, color: '#636E72', minWidth: 28 },
  listFirmName: { fontSize: 11, color: '#95A5A6', maxWidth: 100 },
  listEdit: { padding: 8 },
});
