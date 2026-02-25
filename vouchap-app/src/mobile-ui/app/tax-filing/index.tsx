/**
 * 报税入口：展示由关联的 firm 推送给本空间（client）的 todo 清单。
 * 仅 develop 显示入口（showTaxFiling）。
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showTaxFiling } from '@/lib/feature-flags';
import { getCurrentSpace } from '@/lib/auth';
import { getClientOrdersForClientSpace, getSkuItems, confirmOrderAndCreateProjectTodos } from '@/lib/firm';
import type { FirmOrder, FirmSkuItem } from '@/types';

const STATUS_LABEL: Record<string, string> = {
  pending: 'To submit',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

export default function TaxFilingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Array<FirmOrder & { skuName?: string }>>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [previewItemsByOrder, setPreviewItemsByOrder] = useState<Record<string, FirmSkuItem[]>>({});
  const [loadingItemsOrderId, setLoadingItemsOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!showTaxFiling) {
      router.replace('/');
      return;
    }
    (async () => {
      const space = await getCurrentSpace(true);
      if (!space?.id) {
        setLoading(false);
        return;
      }
      const ordersList = await getClientOrdersForClientSpace(space.id);
      setOrders(ordersList);
      setLoading(false);
    })();
  }, []);

  const handleToggleOrderExpand = async (order: FirmOrder & { skuName?: string }) => {
    if (expandedOrderId === order.id) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(order.id);
    if (!previewItemsByOrder[order.id]) {
      setLoadingItemsOrderId(order.id);
      try {
        const items = await getSkuItems(order.skuId);
        setPreviewItemsByOrder((prev) => ({ ...prev, [order.id]: items }));
      } finally {
        setLoadingItemsOrderId(null);
      }
    }
  };

  if (!showTaxFiling) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? (
        <ActivityIndicator size="large" color="#0984e3" style={styles.loader} />
      ) : (
        <>
          <Text style={styles.sectionTitle}>Service orders</Text>
          {orders.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionText}>No orders yet</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {orders.map((o) => {
                const isPending = o.status === 'pending';
                const isExpanded = expandedOrderId === o.id;
                return (
                  <View key={o.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{formatOrderTitle(o)}</Text>
                      <Text style={[styles.status, styles[`status_${o.status}` as keyof typeof styles] as object]}>
                        {STATUS_LABEL[o.status] || o.status}
                      </Text>
                    </View>
                    <Text style={styles.cardDescSmall}>
                      Created at: {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'}
                    </Text>
                    {o.dueAt ? <Text style={styles.dueAt}>Due: {o.dueAt}</Text> : null}
                    {isPending && (
                      <>
                        <TouchableOpacity
                          style={styles.previewToggle}
                          onPress={() => handleToggleOrderExpand(o)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.previewToggleText}>
                            {isExpanded ? 'Hide items preview' : 'Preview items for this order'}
                          </Text>
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color="#636E72"
                          />
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={styles.previewList}>
                            {loadingItemsOrderId === o.id ? (
                              <ActivityIndicator size="small" color="#0984e3" />
                            ) : (
                              (previewItemsByOrder[o.id] || []).map((item) => (
                                <View key={item.id} style={styles.previewItemRow}>
                                  <Text style={styles.previewItemType}>
                                    {item.type === 'client' ? 'Client' : 'Firm'}
                                  </Text>
                                  <Text style={styles.previewItemTitle}>{item.title}</Text>
                                </View>
                              ))
                            )}
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={async () => {
                            const { error } = await confirmOrderAndCreateProjectTodos(o.id);
                            if (!error) {
                              const space = await getCurrentSpace(true);
                              if (space?.id) {
                                const updatedOrders = await getClientOrdersForClientSpace(space.id);
                                setOrders(updatedOrders);
                              }
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.acceptBtnText}>Accept and start</Text>
                        </TouchableOpacity>
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

function formatOrderTitle(order: FirmOrder & { skuName?: string }): string {
  const base = order.skuName ?? 'Service order';
  const d = order.dueAt || order.createdAt || null;
  if (!d) return base;
  try {
    const year = new Date(d).getFullYear();
    return `${year} · ${base}`;
  } catch {
    return base;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2D3436', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#636E72', marginBottom: 24, textAlign: 'center' },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', marginTop: 48 },
  emptyText: { marginTop: 12, fontSize: 16, color: '#95A5A6' },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#2D3436', marginBottom: 12 },
  emptySection: { paddingVertical: 16, alignItems: 'center' },
  emptySectionText: { fontSize: 14, color: '#95A5A6' },
  list: { gap: 12 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#2D3436', flex: 1 },
  cardDesc: { fontSize: 14, color: '#636E72', marginBottom: 4 },
  cardDescSmall: { fontSize: 12, color: '#95A5A6', marginBottom: 4 },
  dueAt: { fontSize: 12, color: '#95A5A6', marginBottom: 8 },
  status: { fontSize: 12, fontWeight: '500' },
  status_pending: { color: '#E17055' },
  status_submitted: { color: '#0984e3' },
  status_confirmed: { color: '#00B894' },
  status_cancelled: { color: '#95A5A6' },
  submitBtn: {
    marginTop: 8,
    paddingVertical: 10,
    backgroundColor: '#0984e3',
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: { color: '#FFF', fontWeight: '600' },
  acceptBtn: {
    marginTop: 8,
    paddingVertical: 10,
    backgroundColor: '#00B894',
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptBtnText: { color: '#FFF', fontWeight: '600' },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 6,
  },
  previewToggleText: { fontSize: 13, color: '#636E72', fontWeight: '500' },
  previewList: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    gap: 4,
  },
  previewItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewItemType: {
    fontSize: 11,
    color: '#636E72',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  previewItemTitle: { fontSize: 13, color: '#2D3436', flexShrink: 1 },
});
