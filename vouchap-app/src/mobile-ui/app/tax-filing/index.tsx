/**
 * Tax Filing (client): Service orders list. Copy in English.
 * Style matches firm Service Catalog: grid of poster cards.
 * Before confirm: show SKU (name, image, description + items preview). After confirm: show project + project_todos.
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
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showTaxFiling } from '@/lib/feature-flags';
import { getCurrentSpace } from '@/lib/auth';
import {
  getClientOrdersForClientSpace,
  getSkuItems,
  getOrderProjects,
  confirmOrderAndCreateProjectTodos,
  type FirmOrderForClient,
} from '@/lib/firm';
import type { FirmSkuItem, FirmProject } from '@/types';

const CARD_MIN_WIDTH = 240;
const CARD_MAX_WIDTH = 360;
const GRID_GAP = 16;
const POSTER_ASPECT = 4 / 3;

const STATUS_LABEL: Record<string, string> = {
  pending: 'To submit',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

export default function TaxFilingScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<FirmOrderForClient[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [previewItemsByOrder, setPreviewItemsByOrder] = useState<Record<string, FirmSkuItem[]>>({});
  const [projectsByOrder, setProjectsByOrder] = useState<Record<string, FirmProject[]>>({});
  const [loadingItemsOrderId, setLoadingItemsOrderId] = useState<string | null>(null);

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
      const list = await loadOrders();
      setOrders(list);
      setLoading(false);
    })();
  }, [showTaxFiling, loadOrders, router]);

  const handleToggleOrderExpand = async (order: FirmOrderForClient) => {
    if (expandedOrderId === order.id) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(order.id);
    const isConfirmed = order.status !== 'pending';
    if (isConfirmed) {
      if (!projectsByOrder[order.id]) {
        setLoadingItemsOrderId(order.id);
        try {
          const todos = await getOrderProjects(order.id);
          setProjectsByOrder((prev) => ({ ...prev, [order.id]: todos }));
        } finally {
          setLoadingItemsOrderId(null);
        }
      }
    } else {
      if (!previewItemsByOrder[order.id]) {
        setLoadingItemsOrderId(order.id);
        try {
          const items = await getSkuItems(order.skuId);
          setPreviewItemsByOrder((prev) => ({ ...prev, [order.id]: items }));
        } finally {
          setLoadingItemsOrderId(null);
        }
      }
    }
  };

  const handleConfirmOrder = async (order: FirmOrderForClient) => {
    const { error } = await confirmOrderAndCreateProjectTodos(order.id);
    if (error) return;
    const list = await loadOrders();
    setOrders(list);
  };

  if (!showTaxFiling) return null;

  const numColumns = Platform.select({
    web: Math.max(2, Math.floor((windowWidth - 48) / (CARD_MIN_WIDTH + GRID_GAP))),
    default: 2,
  });
  const cardWidth =
    Platform.OS === 'web'
      ? Math.min(CARD_MAX_WIDTH, (windowWidth - 48 - GRID_GAP * (numColumns - 1)) / numColumns)
      : (windowWidth - 40 - GRID_GAP) / 2;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? (
        <ActivityIndicator size="large" color="#6C5CE7" style={styles.loader} />
      ) : (
        <>
          <Text style={styles.sectionTitle}>Tax filing & service orders</Text>
          {orders.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionText}>No orders yet</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {orders.map((o) => {
                const isPending = o.status === 'pending';
                const isExpanded = expandedOrderId === o.id;
                const displayName = isPending ? (o.skuName ?? 'Service order') : (o.projectName ?? o.skuName ?? 'Project');
                const displayDesc = isPending ? o.skuDescription : o.projectDescription;
                const imageUrl = isPending ? o.skuImageUrl : o.projectImageUrl;
                return (
                  <View key={o.id} style={[styles.card, { width: cardWidth }]}>
                    <View style={[styles.posterImageWrap, { aspectRatio: 1 / POSTER_ASPECT }]}>
                      {imageUrl ? (
                        <Image source={{ uri: imageUrl }} style={styles.posterImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.posterPlaceholder}>
                          <Ionicons name="document-text-outline" size={40} color="#B2BEC3" />
                          <Text style={styles.posterPlaceholderText}>Cover</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.posterBody}>
                      <View style={styles.posterBodyContent}>
                        <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                          {formatOrderTitle(o, displayName)}
                        </Text>
                        {displayDesc ? (
                          <Text style={styles.cardDesc} numberOfLines={2} ellipsizeMode="tail">
                            {displayDesc}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.itemRow}>
                        <Text style={[styles.status, styles[`status_${o.status}` as keyof typeof styles] as object]}>
                          {STATUS_LABEL[o.status] || o.status}
                        </Text>
                        {o.dueAt ? (
                          <Text style={styles.dueAt}>Due: {o.dueAt}</Text>
                        ) : null}
                      </View>
                    </View>
                    {isPending && (
                      <>
                        <TouchableOpacity
                          style={styles.previewToggle}
                          onPress={() => handleToggleOrderExpand(o)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.previewToggleText}>
                            {isExpanded ? 'Hide items' : 'Preview items'}
                          </Text>
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#636E72" />
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={styles.previewList}>
                            {loadingItemsOrderId === o.id ? (
                              <ActivityIndicator size="small" color="#6C5CE7" />
                            ) : (
                              (previewItemsByOrder[o.id] || []).map((item) => (
                                <View key={item.id} style={styles.previewItemRow}>
                                  <Text style={styles.previewItemType}>{item.type === 'client' ? 'Client' : 'Firm'}</Text>
                                  <Text style={styles.previewItemTitle}>{item.title}</Text>
                                </View>
                              ))
                            )}
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={() => handleConfirmOrder(o)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.acceptBtnText}>Accept and start</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {!isPending && (
                      <>
                        <TouchableOpacity
                          style={styles.previewToggle}
                          onPress={() => handleToggleOrderExpand(o)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.previewToggleText}>
                            {isExpanded ? 'Hide checklist' : 'View checklist'}
                          </Text>
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#636E72" />
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={styles.previewList}>
                            {loadingItemsOrderId === o.id ? (
                              <ActivityIndicator size="small" color="#6C5CE7" />
                            ) : (
                              (projectsByOrder[o.id] || []).map((item) => (
                                <View key={item.id} style={styles.previewItemRow}>
                                  <Text style={styles.previewItemType}>{item.type === 'client' ? 'Client' : 'Firm'}</Text>
                                  <Text style={styles.previewItemTitle}>{item.title}</Text>
                                  <Text style={styles.previewItemStatus}>{item.status}</Text>
                                </View>
                              ))
                            )}
                            <TouchableOpacity
                              style={styles.openFullLink}
                              onPress={() => router.push(`/tax-filing/order/${o.id}`)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.openFullLinkText}>Open full checklist</Text>
                              <Ionicons name="open-outline" size={14} color="#6C5CE7" />
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function formatOrderTitle(order: FirmOrderForClient, displayName: string): string {
  const d = order.dueAt || order.createdAt || null;
  if (!d) return displayName;
  try {
    const year = new Date(d).getFullYear();
    return `${year} · ${displayName}`;
  } catch {
    return displayName;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 20, paddingBottom: 40 },
  loader: { marginTop: 40 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#2D3436', marginBottom: 16 },
  emptySection: { paddingVertical: 24, alignItems: 'center' },
  emptySectionText: { fontSize: 14, color: '#95A5A6' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  posterImageWrap: { width: '100%', backgroundColor: '#E9ECEF' },
  posterImage: { width: '100%', height: '100%' },
  posterPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  posterPlaceholderText: { fontSize: 12, color: '#95A5A6', marginTop: 4 },
  posterBody: { padding: 14, minHeight: 100 },
  posterBodyContent: { marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#2D3436', lineHeight: 20 },
  cardDesc: { fontSize: 13, color: '#636E72', marginTop: 4, lineHeight: 18 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  status: { fontSize: 11, fontWeight: '500' },
  status_pending: { color: '#E17055' },
  status_submitted: { color: '#0984e3' },
  status_confirmed: { color: '#00B894' },
  status_cancelled: { color: '#95A5A6' },
  dueAt: { fontSize: 11, color: '#95A5A6' },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  previewToggleText: { fontSize: 13, color: '#636E72', fontWeight: '500' },
  previewList: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 6,
  },
  previewItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  previewItemType: {
    fontSize: 10,
    color: '#636E72',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  previewItemTitle: { fontSize: 12, color: '#2D3436', flex: 1 },
  previewItemStatus: { fontSize: 11, color: '#95A5A6' },
  openFullLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
  },
  openFullLinkText: { fontSize: 13, color: '#6C5CE7', fontWeight: '500' },
  acceptBtn: {
    marginHorizontal: 14,
    marginBottom: 14,
    paddingVertical: 10,
    backgroundColor: '#00B894',
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptBtnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
});
