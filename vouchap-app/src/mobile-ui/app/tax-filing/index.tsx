/**
 * Tax Filing (client): Service orders / projects list. English copy.
 * Card: 1:1 cover, status tag, edit icon (top-right, hover), firm name right in footer. No expand todos.
 * List view: compact horizontal row (thumbnail, name, status, progress, edit).
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Platform,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showTaxFiling } from '@/lib/feature-flags';
import { getCurrentSpace } from '@/lib/auth';
import {
  getClientOrdersForClientSpace,
  confirmOrderAndCreateProjectTodos,
  type FirmOrderForClient,
} from '@/lib/firm';

const PINNED_ORDER_IDS_KEY = 'tax_filing_pinned_order_ids';

const GRID_GAP = 16;
const LIST_ROW_MIN_HEIGHT = 92;
const LIST_STATUS_WRAP_WIDTH = 92;
/** 卡片底部操作行高度：与 onboarding 的 Accept 按钮一致，保证卡片高度统一 */
const ACTION_ROW_HEIGHT = 40;
/** 置顶角标色号 #ff7711；点亮=实心橙底白标，未点亮=半透明白底+ff7711 图标；半透明略不透明以便更突出 */
const CORNER_PIN_ORANGE = '#ff7711';
const CORNER_PIN_WHITE_TRANSPARENT = 'rgba(255,255,255,0.88)';
const LIST_ACTION_GRAY = '#636E72';

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

/** 置顶图标（iconfont 风格：上横线 + 向上箭头），矢量 */
function PinToTopIcon({ size = 24, color = '#ff7711' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 6h14M12 20V10M12 10l-4 4M12 10l4 4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** 细条无限进度条，用于 Accept 点击后的占位，不撑高卡片 */
function IndeterminateProgressBar() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 260] });
  return (
    <View style={styles.indeterminateTrack} pointerEvents="none">
      <Animated.View style={[styles.indeterminateFill, { transform: [{ translateX }] }]} />
    </View>
  );
}

type ViewMode = 'grid' | 'list';

export default function TaxFilingScreen() {
  const router = useRouter();
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
      AsyncStorage.setItem(PINNED_ORDER_IDS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const handleConfirmOrder = async (order: FirmOrderForClient) => {
    setConfirmingId(order.id);
    const { error } = await confirmOrderAndCreateProjectTodos(order.id);
    setConfirmingId(null);
    if (!error) setOrders(await loadOrders());
  };

  /** 点击卡片/行：进入 Todos 树形列表页 */
  const goToTodos = (orderId: string) => {
    router.push(`/tax-filing/order/${orderId}`);
  };
  /** 点击 edit：进入项目信息页 */
  const goToInfo = (orderId: string) => {
    router.push(`/tax-filing/order/${orderId}/info`);
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
          {sortedOrders.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionText}>No orders yet</Text>
            </View>
          ) : viewMode === 'list' ? (
            <View style={styles.list}>
              {sortedOrders.map((o) => (
                <OrderListRow
                  key={o.id}
                  order={o}
                  isPinned={pinnedOrderIds.includes(o.id)}
                  onTogglePin={() => handleTogglePin(o.id)}
                  onPress={() => goToTodos(o.id)}
                  onSettings={o.status !== 'onboarding' ? () => goToInfo(o.id) : undefined}
                  onConfirm={o.status === 'onboarding' ? () => handleConfirmOrder(o) : undefined}
                  confirming={confirmingId === o.id}
                />
              ))}
            </View>
          ) : (
            <View style={styles.grid}>
              {sortedOrders.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  isPinned={pinnedOrderIds.includes(o.id)}
                  onTogglePin={() => handleTogglePin(o.id)}
                  onPress={() => goToTodos(o.id)}
                  onSettings={o.status !== 'onboarding' ? () => goToInfo(o.id) : undefined}
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
  isPinned,
  onTogglePin,
  onPress,
  onSettings,
  onConfirm,
  confirming,
}: {
  order: FirmOrderForClient;
  isPinned: boolean;
  onTogglePin: () => void;
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
      <TouchableOpacity
        style={[styles.card, hover && styles.cardHover]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        {/* 上部：1:1 封面 + 左上三角角标(置顶)：摸上去白底灰标，点亮橙底白标 + 右上角 edit */}
        <View style={styles.cardCoverWrap}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.cardCoverImg} resizeMode="cover" />
          ) : (
            <View style={styles.cardCoverPlaceholder}>
              <Ionicons name="document-text-outline" size={32} color="#B2BEC3" />
            </View>
          )}
          {(isPinned || hover) && (
            <TouchableOpacity
              style={styles.cornerPinWrap}
              onPress={(e) => { e.stopPropagation(); onTogglePin(); }}
              hitSlop={0}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.cornerPinTriangle,
                  { backgroundColor: isPinned ? CORNER_PIN_ORANGE : CORNER_PIN_WHITE_TRANSPARENT },
                ]}
              />
              <View style={styles.cornerPinIconWrap}>
                <PinToTopIcon size={28} color={isPinned ? '#FFF' : CORNER_PIN_ORANGE} />
              </View>
            </TouchableOpacity>
          )}
          {onSettings && showEdit && (
            <TouchableOpacity
              style={styles.cardEditCornerWrap}
              onPress={(e) => { e.stopPropagation(); onSettings(); }}
              hitSlop={0}
              activeOpacity={0.85}
            >
              <View style={[styles.cardEditCornerTriangle, { backgroundColor: CORNER_PIN_WHITE_TRANSPARENT }]} />
              <View style={styles.cardEditCornerIconWrap}>
                <Ionicons name="create-outline" size={22} color={CORNER_PIN_ORANGE} />
              </View>
            </TouchableOpacity>
          )}
        </View>
        {/* 下部：项目信息，各行独立定位 */}
        <View style={styles.cardInfo}>
          <View style={styles.cardRowTitle}>
            <Text
              style={styles.cardTitle}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {displayName}
            </Text>
          </View>
          <View style={styles.cardRowTagRow}>
            {taxSeasonYear != null ? (
              <View style={[styles.taxSeasonPill, { backgroundColor: getTaxSeasonColor(taxSeasonYear) }]}>
                <Text style={styles.taxSeasonPillText}>{taxSeasonYear}</Text>
              </View>
            ) : (
              <View />
            )}
            <View style={[styles.statusPill, { backgroundColor: STAGE_COLOR[order.status] ?? '#95A5A6' }]}>
              <Text style={styles.statusPillText}>{STAGE_LABEL[order.status] ?? order.status}</Text>
            </View>
          </View>
          {order.firmName ? (
            <View style={styles.cardRowFooter}>
              <View />
              <Text style={styles.cardFirmName} numberOfLines={1}>Services from {order.firmName}</Text>
            </View>
          ) : null}
          {/* 非 onboarding 才在卡片内显示进度条；有按钮时不占位，点击后按钮消失、同位置显示进度条，两种状态卡片总高一致 */}
          {!isOnboarding && (
            <View style={styles.cardRowProgress}>
              {total > 0 ? (
                <>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                  </View>
                  <Text style={styles.progressTextRight}>{completed}/{total} · {progress}%</Text>
                </>
              ) : null}
            </View>
          )}
        </View>
        {isOnboarding && onConfirm && (
          <View style={styles.acceptBtnWrap}>
            {confirming ? (
              <View style={styles.acceptBtnProgress}>
                <IndeterminateProgressBar />
              </View>
            ) : (
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  onConfirm();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.acceptBtnText}>Accept and start</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

function OrderListRow({
  order,
  isPinned,
  onTogglePin,
  onPress,
  onSettings,
  onConfirm,
  confirming,
}: {
  order: FirmOrderForClient;
  isPinned: boolean;
  onTogglePin: () => void;
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
      style={styles.listRowWrap}
      onMouseEnter={Platform.OS === 'web' ? () => setHover(true) : undefined}
      onMouseLeave={Platform.OS === 'web' ? () => setHover(false) : undefined}
    >
      <TouchableOpacity style={styles.listRow} onPress={onPress} activeOpacity={0.7}>
        {/* 列表行左上角三角角标（恢复原位置）：点亮=橙底+白标，未点亮 hover=半透明三角+灰标；与 edit 同灰 #636E72 */}
          {(isPinned || hover) && (
            <TouchableOpacity
              style={styles.listRowCornerPinWrap}
              onPress={(e) => { e.stopPropagation(); onTogglePin(); }}
              hitSlop={0}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.listRowCornerPinTriangle,
                  { backgroundColor: isPinned ? CORNER_PIN_ORANGE : CORNER_PIN_WHITE_TRANSPARENT },
                ]}
              />
              <View style={styles.listRowCornerPinIconWrap}>
                <PinToTopIcon size={18} color={isPinned ? '#FFF' : LIST_ACTION_GRAY} />
              </View>
            </TouchableOpacity>
          )}
        {/* 左侧：仅 edit，左移下移与角标 icon 垂直对齐、上下对称，同灰 */}
        <View style={styles.listEditWrap}>
          {onSettings && showEdit ? (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onSettings(); }}
              hitSlop={6}
              activeOpacity={0.8}
              style={styles.listActionBtn}
            >
              <Ionicons name="create-outline" size={18} color={LIST_ACTION_GRAY} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.listCoverWrap}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.listCoverImg} resizeMode="cover" />
          ) : (
            <View style={styles.listCoverPlaceholder}>
              <Ionicons name="document-text-outline" size={24} color="#B2BEC3" />
            </View>
          )}
        </View>
        {/* 中间：第一行 报税季+标题，第二行 状态+Services from */}
        <View style={styles.listBody}>
          <View style={styles.listRow1}>
            {taxSeasonYear != null ? (
              <View style={[styles.listTaxPill, { backgroundColor: getTaxSeasonColor(taxSeasonYear) }]}>
                <Text style={styles.listTaxPillText}>{taxSeasonYear}</Text>
              </View>
            ) : null}
            <View style={styles.listTitleWrap}>
              <Text style={styles.listTitle} numberOfLines={1} ellipsizeMode="tail">
                {displayName}
              </Text>
            </View>
          </View>
          <View style={styles.listRow2}>
            <View style={styles.listStatusWrap}>
              <View style={[styles.listStatusPill, { backgroundColor: STAGE_COLOR[order.status] ?? '#95A5A6' }]}>
                <Text style={styles.listStatusPillText}>{STAGE_LABEL[order.status] ?? order.status}</Text>
              </View>
            </View>
            {order.firmName ? (
              <Text style={styles.listFirmName} numberOfLines={1} ellipsizeMode="tail">
                Services from {order.firmName}
              </Text>
            ) : null}
          </View>
        </View>
        {/* 右端固定宽度、垂直居中：进度条或 Accept，二者水平居中对齐 */}
        <View style={styles.listRightSlot}>
          {isOnboarding && onConfirm ? (
            confirming ? (
              <View style={styles.listAcceptProgress}>
                <IndeterminateProgressBar />
              </View>
            ) : (
              <TouchableOpacity
                style={styles.listAcceptBtn}
                onPress={(e) => { e.stopPropagation(); onConfirm(); }}
                activeOpacity={0.8}
              >
                <Text style={styles.acceptBtnText}>Accept and start</Text>
              </TouchableOpacity>
            )
          ) : total > 0 ? (
            <View style={styles.listProgressBlock}>
              <View style={styles.listProgressTrack}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.listProgressText}>{completed}/{total} · {progress}%</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
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
  cardHover: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    ...(Platform.OS === 'android' ? { elevation: 8 } : {}),
  },
  cardCoverWrap: { width: '100%', aspectRatio: 1, backgroundColor: '#E9ECEF', overflow: 'hidden', position: 'relative' },
  cardCoverImg: { width: '100%', height: '100%' },
  cardCoverPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  cornerPinWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 132,
    height: 132,
    overflow: 'hidden',
  },
  cornerPinTriangle: {
    position: 'absolute',
    top: -66,
    left: -66,
    width: 132,
    height: 132,
    transform: [{ rotate: '-45deg' }],
  },
  cornerPinIconWrap: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEditCornerWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 132,
    height: 132,
    overflow: 'hidden',
  },
  cardEditCornerTriangle: {
    position: 'absolute',
    top: -66,
    left: 66,
    width: 132,
    height: 132,
    transform: [{ rotate: '45deg' }],
  },
  cardEditCornerIconWrap: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { padding: 12 },
  cardRow: { marginBottom: 6 },
  cardRowTitle: { marginBottom: 6, minHeight: 40, overflow: 'hidden' },
  cardRowTagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#2D3436', lineHeight: 20 },
  taxSeasonPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  taxSeasonPillText: { fontSize: 12, color: '#FFF', fontWeight: '600' },
  cardRowProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 0,
    minHeight: ACTION_ROW_HEIGHT,
  },
  progressBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E9ECEF', overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#00B894', borderRadius: 3 },
  progressTextRight: { fontSize: 12, color: '#636E72', marginLeft: 4 },
  cardRowFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusPillText: { fontSize: 12, color: '#FFF', fontWeight: '600' },
  cardFirmName: { fontSize: 11, color: '#95A5A6', maxWidth: '85%', textAlign: 'right' },
  acceptBtnWrap: {
    height: ACTION_ROW_HEIGHT,
    marginTop: 0,
    marginHorizontal: 12,
    marginBottom: 12,
    justifyContent: 'center',
  },
  acceptBtn: {
    height: ACTION_ROW_HEIGHT,
    backgroundColor: '#6C5CE7',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? {
          shadowColor: '#6C5CE7',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.35,
          shadowRadius: 6,
        }
      : {}),
    ...(Platform.OS === 'android' ? { elevation: 4 } : {}),
  },
  acceptBtnProgress: {
    height: ACTION_ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  acceptBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  indeterminateTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E9ECEF',
    overflow: 'hidden',
    width: '100%',
  },
  indeterminateFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: '#00B894',
    borderRadius: 2,
  },
  list: { gap: 1, backgroundColor: '#E9ECEF', borderRadius: 12, overflow: 'hidden' },
  listRowWrap: { width: '100%' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: LIST_ROW_MIN_HEIGHT,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
    position: 'relative',
  },
  listEditWrap: {
    width: 28,
    minWidth: 28,
    alignSelf: 'stretch',
    marginLeft: -12,
    paddingLeft: 2,
    paddingTop: 32,
  },
  listActionBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCoverWrap: {
    width: 64,
    height: 64,
    marginLeft: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E9ECEF',
    position: 'relative',
  },
  listCoverImg: { width: '100%', height: '100%' },
  listCoverPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  listRowCornerPinWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 72,
    height: 72,
    overflow: 'hidden',
    zIndex: 1,
  },
  listRowCornerPinTriangle: {
    position: 'absolute',
    top: -36,
    left: -36,
    width: 72,
    height: 72,
    transform: [{ rotate: '-45deg' }],
  },
  listRowCornerPinIconWrap: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBody: { flex: 1, marginLeft: 12, minWidth: 0, justifyContent: 'center', paddingVertical: 6 },
  listRow1: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  listRow2: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listTaxPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  listTaxPillText: { fontSize: 12, color: '#FFF', fontWeight: '600' },
  listTitleWrap: { flex: 1, minWidth: 0, overflow: 'hidden' },
  listTitle: { fontSize: 15, fontWeight: '600', color: '#2D3436', lineHeight: 20 },
  listStatusWrap: { width: LIST_STATUS_WRAP_WIDTH, minWidth: LIST_STATUS_WRAP_WIDTH },
  listStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  listStatusPillText: { fontSize: 12, color: '#FFF', fontWeight: '600' },
  listFirmName: { fontSize: 12, color: '#95A5A6', flex: 1, minWidth: 0 },
  listRightSlot: {
    width: '40%',
    minWidth: 120,
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listProgressBlock: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listProgressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E9ECEF', overflow: 'hidden' },
  listProgressText: { fontSize: 12, color: '#636E72' },
  listAcceptBtn: {
    width: '100%',
    maxWidth: 200,
    height: ACTION_ROW_HEIGHT,
    backgroundColor: '#6C5CE7',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? {
          shadowColor: '#6C5CE7',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
        }
      : {}),
    ...(Platform.OS === 'android' ? { elevation: 4 } : {}),
  },
  listAcceptProgress: {
    width: '100%',
    height: ACTION_ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
