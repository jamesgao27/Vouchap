import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentSpace } from '@/lib/auth';
import {
  getFirmClientsWithDetails,
  getFirmOrders,
  getFirmClientFollowUps,
  addFirmClientFollowUp,
  getFirmSkus,
  getSkuItems,
  createFirmOrder,
} from '@/lib/firm';
import type { FirmClientWithDetails, FirmOrder, FirmClientFollowUp, FirmSku, FirmSkuItem } from '@/lib/firm';
import { CLIENT_DISPLAY_STATUS_LABELS } from '@/types';
import DataTable, { type DataTableColumn } from '@/components/DataTable';

export default function FirmClientDetailScreen() {
  const { clientSpaceId } = useLocalSearchParams<{ clientSpaceId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<FirmClientWithDetails | null>(null);
  const [orders, setOrders] = useState<FirmOrder[]>([]);
  const [followUps, setFollowUps] = useState<FirmClientFollowUp[]>([]);
  const [skus, setSkus] = useState<FirmSku[]>([]);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<FirmSkuItem[]>([]);
  const [previewOrderSkuName, setPreviewOrderSkuName] = useState<string | null>(null);
  const [followUpContent, setFollowUpContent] = useState('');
  const [addingFollowUp, setAddingFollowUp] = useState(false);
  const [ordersExpanded, setOrdersExpanded] = useState(true);
  const [followUpsExpanded, setFollowUpsExpanded] = useState(true);

  useEffect(() => {
    (async () => {
      const space = await getCurrentSpace();
      if (!space || !space.id || space.kind !== 'firm' || !clientSpaceId || typeof clientSpaceId !== 'string') {
        setLoading(false);
        return;
      }
      const firmSpaceId = space.id;
      setLoading(true);
      const [clients, ords, fus, skuList] = await Promise.all([
        getFirmClientsWithDetails(firmSpaceId),
        getFirmOrders(firmSpaceId, clientSpaceId),
        getFirmClientFollowUps(firmSpaceId, clientSpaceId),
        getFirmSkus(firmSpaceId),
      ]);
      const found = clients.find((c) => c.clientSpaceId === clientSpaceId) ?? null;
      setClient(found);
      setOrders(ords);
      setFollowUps(fus);
      setSkus(skuList);
      setLoading(false);
    })();
  }, [clientSpaceId]);

  const orderColumns = useMemo<DataTableColumn<FirmOrder & { skuName?: string }>[]>(() => [
    {
      id: 'createdAt',
      label: 'Created at',
      minWidth: 150,
      getValue: (r) => <Text style={styles.cellText}>{formatDate(r.createdAt)}</Text>,
      getSortValue: (r) => r.createdAt,
    },
    {
      id: 'sku',
      label: 'Service',
      minWidth: 160,
      getValue: (r) => <Text style={styles.cellText}>{r.skuName ?? '—'}</Text>,
      getSortValue: (r) => (r.skuName ?? '').toLowerCase(),
    },
    {
      id: 'status',
      label: 'Status',
      minWidth: 100,
      getValue: (r) => <Text style={styles.cellText}>{r.status}</Text>,
      getSortValue: (r) => r.status,
    },
    {
      id: 'dueAt',
      label: 'Due at',
      minWidth: 140,
      getValue: (r) => <Text style={styles.cellText}>{r.dueAt ? formatDate(r.dueAt) : '—'}</Text>,
      getSortValue: (r) => r.dueAt ?? '',
    },
  ], []);

  const ordersWithSkuName = useMemo(
    () => orders.map((o) => ({
      ...o,
      skuName: skus.find((s) => s.id === o.skuId)?.name,
    })),
    [orders, skus],
  );

  const handleCreateOrder = useCallback(async () => {
    if (!client || !selectedSkuId) return;
    const space = await getCurrentSpace();
    if (!space || !space.id || space.kind !== 'firm') return;
    setCreatingOrder(true);
    const { id, error } = await createFirmOrder(space.id, client.clientSpaceId, selectedSkuId, null);
    if (!error) {
      const fresh = await getFirmOrders(space.id, client.clientSpaceId);
      setOrders(fresh);
      const sku = skus.find((s) => s.id === selectedSkuId) ?? null;
      const items = await getSkuItems(selectedSkuId);
      setPreviewItems(items);
      setPreviewOrderSkuName(sku?.name ?? null);
    }
    setCreatingOrder(false);
  }, [client, selectedSkuId, skus, orders]);

  const handleAddFollowUp = useCallback(async () => {
    const content = followUpContent.trim();
    if (!client || !content) return;
    const space = await getCurrentSpace();
    if (!space || !space.id || space.kind !== 'firm') return;
    setAddingFollowUp(true);
    const { error } = await addFirmClientFollowUp(space.id, client.clientSpaceId, content);
    if (!error) {
      const fus = await getFirmClientFollowUps(space.id, client.clientSpaceId);
      setFollowUps(fus);
      setFollowUpContent('');
    }
    setAddingFollowUp(false);
  }, [client, followUpContent]);

  if (!clientSpaceId || typeof clientSpaceId !== 'string') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Invalid client.</Text>
      </View>
    );
  }

  if (loading && !client) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  if (!client) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Client not found.</Text>
      </View>
    );
  }

  const content = (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={20} color="#636E72" />
          <Text style={styles.backText}>Back to Clients</Text>
        </TouchableOpacity>
        <Text style={styles.clientName}>{client.name}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Contact</Text>
          <Text style={styles.infoValue}>{client.contactName ?? '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{client.contactEmail ?? '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={styles.infoValue}>{CLIENT_DISPLAY_STATUS_LABELS[client.displayStatus ?? ''] ?? client.displayStatus ?? '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Assignee</Text>
          <Text style={styles.infoValue}>{client.assigneeName ?? client.assigneeEmail ?? '—'}</Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setOrdersExpanded(v => !v)}>
          <View style={styles.sectionTitleRow}>
            <Ionicons
              name={ordersExpanded ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color="#636E72"
            />
            <Text style={styles.sectionTitle}>Orders</Text>
            <Text style={styles.sectionCount}>({orders.length})</Text>
          </View>
          <TouchableOpacity
            style={styles.sectionActionBtn}
            onPress={() => {
              if (skus.length > 0 && !selectedSkuId) {
                setSelectedSkuId(skus[0].id);
              }
            }}
          >
            <Text style={styles.sectionActionText}>New order</Text>
          </TouchableOpacity>
        </TouchableOpacity>
        {ordersExpanded && (
          <View style={styles.sectionBody}>
            {Platform.OS === 'web' ? (
              <DataTable<FirmOrder & { skuName?: string }>
                columns={orderColumns}
                data={ordersWithSkuName}
                keyExtractor={(r) => r.id}
                emptyMessage="No orders yet."
                storageKey="client-orders-table"
              />
            ) : (
              orders.map(o => {
                const skuName = skus.find(s => s.id === o.skuId)?.name ?? '—';
                return (
                  <View key={o.id} style={styles.orderRow}>
                    <Text style={styles.orderSku}>{skuName}</Text>
                    <Text style={styles.orderMeta}>{o.status} · {formatDate(o.createdAt)}</Text>
                  </View>
                );
              })
            )}

            {skus.length > 0 && (
              <View style={styles.newOrderBox}>
                <Text style={styles.newOrderTitle}>Create new order</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.skuScroll}>
                  {skus.map((sku) => (
                    <TouchableOpacity
                      key={sku.id}
                      style={[
                        styles.skuChip,
                        selectedSkuId === sku.id && styles.skuChipSelected,
                      ]}
                      onPress={() => setSelectedSkuId(sku.id)}
                    >
                      <Text
                        style={[
                          styles.skuChipText,
                          selectedSkuId === sku.id && styles.skuChipTextSelected,
                        ]}
                      >
                        {sku.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.newOrderBtn, (!selectedSkuId || creatingOrder) && styles.newOrderBtnDisabled]}
                  onPress={handleCreateOrder}
                  disabled={!selectedSkuId || creatingOrder}
                >
                  {creatingOrder ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="add-circle-outline" size={18} color="#fff" />
                      <Text style={styles.newOrderBtnText}>Create order</Text>
                    </>
                  )}
                </TouchableOpacity>

                {previewItems.length > 0 && (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewTitle}>
                      Preview items for {previewOrderSkuName ?? 'order'}
                    </Text>
                    {previewItems.map((item) => (
                      <View key={item.id} style={styles.previewItemRow}>
                        <Text style={styles.previewItemType}>{item.type === 'client' ? 'Client' : 'Firm'}</Text>
                        <Text style={styles.previewItemTitle}>{item.title}</Text>
                      </View>
                    ))}
                    <Text style={styles.previewHint}>
                      Projects will be created after client confirms this order.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.sectionCard}>
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setFollowUpsExpanded(v => !v)}>
          <View style={styles.sectionTitleRow}>
            <Ionicons
              name={followUpsExpanded ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color="#636E72"
            />
            <Text style={styles.sectionTitle}>Follow-ups</Text>
            <Text style={styles.sectionCount}>({followUps.length})</Text>
          </View>
        </TouchableOpacity>
        {followUpsExpanded && (
          <View style={styles.sectionBody}>
            <View style={styles.followUpInputBox}>
              <TextInput
                style={styles.followUpInput}
                placeholder="Add a follow-up note"
                placeholderTextColor="#95A5A6"
                value={followUpContent}
                onChangeText={setFollowUpContent}
                multiline
              />
              <TouchableOpacity
                style={[styles.followUpBtn, (addingFollowUp || !followUpContent.trim()) && styles.followUpBtnDisabled]}
                onPress={handleAddFollowUp}
                disabled={addingFollowUp || !followUpContent.trim()}
              >
                {addingFollowUp ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.followUpBtnText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>

            {followUps.length === 0 ? (
              <Text style={styles.emptyFollowUpText}>No follow-up records yet.</Text>
            ) : (
              followUps.map((f) => (
                <View key={f.id} style={styles.followUpRow}>
                  <Text style={styles.followUpContent}>{f.content}</Text>
                  <Text style={styles.followUpMeta}>{formatDate(f.createdAt)}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );

  if (Platform.OS === 'web') {
    return <View style={{ flex: 1, backgroundColor: '#ECEFF1' }}>{content}</View>;
  }
  return <View style={{ flex: 1 }}>{content}</View>;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECEFF1' },
  errorText: { fontSize: 16, color: '#E74C3C' },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { fontSize: 13, color: '#636E72', marginLeft: 4 },
  clientName: { fontSize: 20, fontWeight: '700', color: '#2D3436', marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  infoLabel: { fontSize: 13, color: '#636E72' },
  infoValue: { fontSize: 13, color: '#2D3436', fontWeight: '500' },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#2D3436' },
  sectionCount: { fontSize: 13, color: '#636E72' },
  sectionActionBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  sectionActionText: { fontSize: 13, color: '#6C5CE7', fontWeight: '500' },
  sectionBody: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },

  cellText: { fontSize: 13, color: '#2D3436' },
  orderRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  orderSku: { fontSize: 14, fontWeight: '600', color: '#2D3436' },
  orderMeta: { fontSize: 13, color: '#636E72', marginTop: 2 },

  newOrderBox: { marginTop: 12, gap: 8 },
  newOrderTitle: { fontSize: 14, fontWeight: '600', color: '#2D3436' },
  skuScroll: { marginTop: 4 },
  skuChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginRight: 8,
  },
  skuChipSelected: {
    backgroundColor: '#6C5CE7',
    borderColor: '#6C5CE7',
  },
  skuChipText: { fontSize: 13, color: '#2D3436' },
  skuChipTextSelected: { color: '#fff', fontWeight: '600' },
  newOrderBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#6C5CE7',
  },
  newOrderBtnDisabled: { opacity: 0.6 },
  newOrderBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },

  previewBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    gap: 4,
  },
  previewTitle: { fontSize: 13, fontWeight: '600', color: '#2D3436', marginBottom: 4 },
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
  previewHint: { fontSize: 12, color: '#636E72', marginTop: 4 },

  followUpInputBox: { marginBottom: 12, gap: 8 },
  followUpInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#2D3436',
  },
  followUpBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#6C5CE7',
  },
  followUpBtnDisabled: { opacity: 0.6 },
  followUpBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  emptyFollowUpText: { fontSize: 13, color: '#95A5A6' },
  followUpRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  followUpContent: { fontSize: 13, color: '#2D3436', marginBottom: 2 },
  followUpMeta: { fontSize: 12, color: '#95A5A6' },
});

