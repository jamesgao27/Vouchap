import React, { useEffect, useState, useCallback, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentSpace, getUserSpaces } from '@/lib/auth';
import {
  getFirmClientsWithDetails,
  getFirmOrders,
  getFirmClientFollowUps,
  addFirmClientFollowUp,
  getFirmSkus,
  createFirmOrder,
  updateFirmClientLabels,
  getFirmSpaceMembers,
  updateFirmClientAssignee,
} from '@/lib/firm';
import { createPendingOrderForInvitee } from '@/lib/firm-clients';
import { showToast } from '../../../../shared-logic/toast';
import type { FirmClientWithDetails, FirmOrder, FirmClientFollowUp, FirmSku, FirmSpaceMember } from '@/lib/firm';
import { CLIENT_DISPLAY_STATUS_LABELS } from '@/types';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import CenterModal from '../../../components/CenterModal';
import SkuPreview from '../../../components/SkuPreview';

type TabKey = 'info' | 'orders';

const INVITEE_PREFIX = 'invitee-';

export default function FirmClientDetailScreen() {
  const { clientSpaceId: segment } = useLocalSearchParams<{ clientSpaceId: string }>();
  const isInvitee = typeof segment === 'string' && segment.startsWith(INVITEE_PREFIX);
  const inviteeClientId = isInvitee ? segment!.slice(INVITEE_PREFIX.length) : undefined;
  const resolvedClientSpaceId = isInvitee ? undefined : segment ?? undefined;

  const router = useRouter();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<FirmClientWithDetails | null>(null);
  const [orders, setOrders] = useState<FirmOrder[]>([]);
  const [followUps, setFollowUps] = useState<FirmClientFollowUp[]>([]);
  const [skus, setSkus] = useState<FirmSku[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [followUpContent, setFollowUpContent] = useState('');
  const [addingFollowUp, setAddingFollowUp] = useState(false);
  const [newOrderModalVisible, setNewOrderModalVisible] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [assigneeMembers, setAssigneeMembers] = useState<FirmSpaceMember[]>([]);
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [isFirmAdmin, setIsFirmAdmin] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [savingLabels, setSavingLabels] = useState(false);
  const [showNewOrderSkuMenu, setShowNewOrderSkuMenu] = useState(false);

  const load = useCallback(async () => {
    const space = await getCurrentSpace();
    if (!space?.id || space.kind !== 'firm' || !segment || typeof segment !== 'string') {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [clients, ords, fus, skuList] = await Promise.all([
      getFirmClientsWithDetails(space.id),
      getFirmOrders(space.id, resolvedClientSpaceId, inviteeClientId),
      getFirmClientFollowUps(space.id, resolvedClientSpaceId, inviteeClientId),
      getFirmSkus(space.id),
    ]);
    const found = inviteeClientId
      ? clients.find((c) => c.inviteeClientId === inviteeClientId || c.id === inviteeClientId) ?? null
      : clients.find((c) => c.clientSpaceId === resolvedClientSpaceId) ?? null;
    setClient(found);
    setOrders(ords);
    setFollowUps(fus);
    setSkus(skuList);
    setLoading(false);
  }, [segment, resolvedClientSpaceId, inviteeClientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!client?.firmSpaceId) return;
    getUserSpaces().then((spaces) => {
      const membership = spaces.find((us) => us.spaceId === client.firmSpaceId);
      setIsFirmAdmin(membership?.isAdmin === true);
    });
  }, [client?.firmSpaceId]);

  const handleSaveLabels = useCallback(async (labels: string[]) => {
    if (!client?.id || client.isPendingClaim) return;
    setSavingLabels(true);
    const { error } = await updateFirmClientLabels(client.id, labels);
    setSavingLabels(false);
    if (error) {
      showToast(error.message ?? 'Failed to update labels.', 'error');
      return;
    }
    setClient((prev) => (prev ? { ...prev, labels } : null));
    showToast('Labels updated.', 'success');
  }, [client?.id]);

  const handleAddTag = useCallback(() => {
    const tag = newTagInput.trim();
    if (!tag || !client) return;
    const current = client.labels ?? [];
    if (current.includes(tag)) return;
    setNewTagInput('');
    handleSaveLabels([...current, tag]);
  }, [client, newTagInput, handleSaveLabels]);

  const handleRemoveTag = useCallback(
    (index: number) => {
      if (!client) return;
      const current = client.labels ?? [];
      handleSaveLabels(current.filter((_, i) => i !== index));
    },
    [client, handleSaveLabels]
  );

  const handleOpenAssigneePicker = useCallback(async () => {
    if (!client?.firmSpaceId) return;
    setShowAssigneePicker(true);
    const members = await getFirmSpaceMembers(client.firmSpaceId);
    setAssigneeMembers(members);
  }, [client?.firmSpaceId]);

  const handleSelectAssignee = useCallback(async (userId: string | null) => {
    if (!client?.id || !client?.firmSpaceId) return;
    setSavingAssignee(true);
    const { error } = await updateFirmClientAssignee(client.id, userId, client.firmSpaceId);
    setSavingAssignee(false);
    setShowAssigneePicker(false);
    if (error) {
      showToast(error.message ?? 'Failed to update assignee.', 'error');
      return;
    }
    const space = await getCurrentSpace();
    if (space?.id && space.kind === 'firm') {
      const [clientsRes] = await Promise.all([getFirmClientsWithDetails(space.id)]);
      const found = client.isPendingClaim
        ? clientsRes.find((c) => c.id === client.id || c.inviteeClientId === client.id) ?? null
        : clientsRes.find((c) => c.clientSpaceId === client.clientSpaceId) ?? null;
      if (found) setClient(found);
    }
    showToast('Assignee updated.', 'success');
  }, [client?.id, client?.firmSpaceId, client?.clientSpaceId, client?.isPendingClaim]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: client?.name ?? 'Client',
    });
  }, [navigation, client?.name]);

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

  const selectableSkus = useMemo(
    () => skus.filter((s) => (s.templateStatus != null ? s.templateStatus !== 'draft' : (s.isPublished === true || !!s.taxCountry || !!s.taxScenario))),
    [skus],
  );

  const handleAddFollowUp = useCallback(async () => {
    const content = followUpContent.trim();
    if (!client || !content) return;
    const firmSpaceId = client.firmSpaceId;
    if (!firmSpaceId) {
      showToast('Missing firm context.', 'error');
      return;
    }
    setAddingFollowUp(true);
    const { error } = client.isPendingClaim
      ? await addFirmClientFollowUp(firmSpaceId, '', content, client.id)
      : await addFirmClientFollowUp(firmSpaceId, client.clientSpaceId, content);
    if (!error) {
      const fus = client.isPendingClaim
        ? await getFirmClientFollowUps(firmSpaceId, undefined, client.id)
        : await getFirmClientFollowUps(firmSpaceId, client.clientSpaceId);
      setFollowUps(fus);
      setFollowUpContent('');
      showToast('Follow-up saved.', 'success');
    } else {
      showToast(error?.message ?? 'Failed to save follow-up.', 'error');
    }
    setAddingFollowUp(false);
  }, [client, followUpContent]);

  const openNewOrderModal = useCallback(() => {
    const first = selectableSkus[0]?.id ?? null;
    setSelectedSkuId(first);
    setShowNewOrderSkuMenu(false);
    setNewOrderModalVisible(true);
  }, [selectableSkus]);

  const handleCreateOrder = useCallback(async (): Promise<boolean> => {
    if (!client || !selectedSkuId) return false;
    const space = await getCurrentSpace();
    if (!space?.id || space.kind !== 'firm') return false;
    setCreatingOrder(true);
    let error: Error | null = null;
    if (client.isPendingClaim) {
      const res = await createPendingOrderForInvitee(space.id, {
        clientName: client.name || '',
        contactName: client.contactName ?? '',
        contactEmail: client.contactEmail ?? '',
        skuId: selectedSkuId,
      });
      error = res.error;
      if (!error) {
        const fresh = await getFirmOrders(space.id, undefined, client.id);
        setOrders(fresh);
      }
    } else {
      const res = await createFirmOrder(space.id, client.clientSpaceId, selectedSkuId, null);
      error = res?.error ?? null;
      if (!error) {
        const fresh = await getFirmOrders(space.id, client.clientSpaceId);
        setOrders(fresh);
      }
    }
    setCreatingOrder(false);
    if (error) showToast(error.message ?? 'Failed to create order.', 'error');
    return !error;
  }, [client, selectedSkuId]);

  const confirmCreateAndClose = useCallback(async () => {
    const ok = await handleCreateOrder();
    if (ok) setNewOrderModalVisible(false);
  }, [handleCreateOrder]);

  if (!segment || typeof segment !== 'string') {
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

  return (
    <View style={styles.container}>
      <View style={styles.operationBar}>
        <View style={styles.tabGroup}>
          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'info' && styles.tabChipActive]}
            onPress={() => setActiveTab('info')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabChipText, activeTab === 'info' && styles.tabChipTextActive]}>Info</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'orders' && styles.tabChipActive]}
            onPress={() => setActiveTab('orders')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabChipText, activeTab === 'orders' && styles.tabChipTextActive]}>Orders</Text>
          </TouchableOpacity>
        </View>
        {activeTab === 'orders' && selectableSkus.length > 0 && (
          <TouchableOpacity style={styles.operationBtn} onPress={openNewOrderModal} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={16} color="#6C5CE7" />
            <Text style={styles.operationBtnText}>New order</Text>
          </TouchableOpacity>
        )}
      </View>

      {activeTab === 'info' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Basic information</Text>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Contact</Text>
                <Text style={styles.infoValue}>{client.contactName ?? '—'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{client.contactEmail ?? '—'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Status</Text>
                <View style={styles.infoValueTouch}>
                  {client.labels?.length ? (
                    <View style={[styles.labelBadge, { backgroundColor: '#6C5CE7' }]}>
                      <Text style={styles.labelBadgeText}>{client.labels[0]}</Text>
                    </View>
                  ) : (
                    <Text style={styles.infoValue}>{CLIENT_DISPLAY_STATUS_LABELS[client.displayStatus ?? ''] ?? client.displayStatus ?? '—'}</Text>
                  )}
                </View>
              </View>
              {!client.isPendingClaim && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Labels</Text>
                  <View style={styles.labelsRow}>
                    {(client.labels ?? []).map((tag, i) => (
                      <View key={i} style={styles.tagChipWrap}>
                        <View style={[styles.labelBadge, { backgroundColor: '#6C5CE7' }]}>
                          <Text style={styles.labelBadgeText}>{tag}</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleRemoveTag(i)} hitSlop={8} style={styles.tagRemove}>
                          <Ionicons name="close-circle" size={18} color="#636E72" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <View style={styles.tagAddRow}>
                      <TextInput
                        style={styles.tagInput}
                        placeholder="Add tag"
                        placeholderTextColor="#95A5A6"
                        value={newTagInput}
                        onChangeText={setNewTagInput}
                        onSubmitEditing={handleAddTag}
                        returnKeyType="done"
                      />
                      <TouchableOpacity
                        style={[styles.tagAddBtn, (!newTagInput.trim() || savingLabels) && styles.followUpBtnDisabled]}
                        onPress={handleAddTag}
                        disabled={!newTagInput.trim() || savingLabels}
                      >
                        {savingLabels ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.tagAddBtnText}>Add</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Assignee</Text>
                <View style={styles.infoValueRow}>
                  <Text style={styles.infoValue}>{client.assigneeName ?? client.assigneeEmail ?? '—'}</Text>
                  {isFirmAdmin && (
                    <TouchableOpacity onPress={handleOpenAssigneePicker} style={styles.changeLink} activeOpacity={0.7}>
                      <Text style={styles.changeLinkText}>Change</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statPill}
                activeOpacity={0.8}
                onPress={() => setActiveTab('orders')}
              >
                <Text style={styles.statNumber}>{orders.length}</Text>
                <Text style={styles.statLabel}>Orders</Text>
              </TouchableOpacity>
              <View style={styles.statPill}>
                <Text style={styles.statNumber}>{followUps.length}</Text>
                <Text style={styles.statLabel}>Follow-ups</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Follow-up history</Text>
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
                  <Text style={styles.followUpBtnText}>Add follow-up</Text>
                )}
              </TouchableOpacity>
            </View>
            {followUps.length === 0 ? (
              <Text style={styles.emptyText}>No follow-up records yet.</Text>
            ) : (
              followUps.map((f) => {
                const isOrderEvent = f.kind !== 'note' && f.referenceId;
                const iconName =
                  f.kind === 'order_created'
                    ? 'document-text-outline'
                    : f.kind === 'order_started'
                      ? 'play-circle-outline'
                      : f.kind === 'order_completed'
                        ? 'checkmark-done-outline'
                        : f.kind === 'order_cancelled'
                          ? 'close-circle-outline'
                          : null;
                const rowContent = (
                  <>
                    {iconName ? (
                      <Ionicons name={iconName as any} size={18} color="#6C5CE7" style={styles.followUpRowIcon} />
                    ) : null}
                    <View style={styles.followUpRowText}>
                      <Text style={styles.followUpContent}>{f.content}</Text>
                      <Text style={styles.followUpMeta}>{formatDate(f.createdAt)}</Text>
                    </View>
                  </>
                );
                return isOrderEvent ? (
                  <TouchableOpacity
                    key={f.id}
                    style={styles.followUpRow}
                    onPress={() => router.push(`/firm/engagement/${f.referenceId}`)}
                    activeOpacity={0.7}
                  >
                    {rowContent}
                  </TouchableOpacity>
                ) : (
                  <View key={f.id} style={styles.followUpRow}>
                    {rowContent}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {activeTab === 'orders' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {Platform.OS === 'web' ? (
            <DataTable<FirmOrder & { skuName?: string }>
              columns={orderColumns}
              data={ordersWithSkuName}
              keyExtractor={(r) => r.id}
              emptyMessage="No orders yet."
              storageKey="client-orders-table"
              onRowPress={(row) => router.push(`/firm/engagement/${row.id}`)}
            />
          ) : (
            orders.length === 0 ? (
              <Text style={styles.emptyText}>No orders yet.</Text>
            ) : (
              orders.map((o) => {
                const skuName = skus.find((s) => s.id === o.skuId)?.name ?? '—';
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={styles.orderRow}
                    onPress={() => router.push(`/firm/engagement/${o.id}`)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.orderSku}>{skuName}</Text>
                    <Text style={styles.orderMeta}>{o.status} · {formatDate(o.createdAt)}</Text>
                  </TouchableOpacity>
                );
              })
            )
          )}
        </ScrollView>
      )}
      <CenterModal
        visible={newOrderModalVisible}
        title="Create new order"
        onClose={() => setNewOrderModalVisible(false)}
        maxWidth={840}
        cardHeight={660}
      >
        <View style={styles.newOrderRow}>
          {/* Left: client info (prefilled, read-only) + sku selection */}
          <ScrollView
            style={styles.newOrderLeftScroll}
            contentContainerStyle={styles.newOrderLeftContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.newOrderSubtitle}>
              Create a new service engagement for this client. {'\n'}Client information is prefilled and cannot be edited here.
            </Text>
            <View style={styles.newOrderField}>
              <Text style={styles.newOrderLabel}>Client name</Text>
              <View style={styles.newOrderValueBox}>
                <Text style={styles.newOrderValueText} numberOfLines={1}>
                  {client.name || '—'}
                </Text>
              </View>
            </View>
            <View style={styles.newOrderField}>
              <Text style={styles.newOrderLabel}>Contact name</Text>
              <View style={styles.newOrderValueBox}>
                <Text style={styles.newOrderValueText} numberOfLines={1}>
                  {client.contactName || '—'}
                </Text>
              </View>
            </View>
            <View style={styles.newOrderField}>
              <Text style={styles.newOrderLabel}>Contact email</Text>
              <View style={styles.newOrderValueBox}>
                <Text style={styles.newOrderValueText} numberOfLines={1}>
                  {client.contactEmail || '—'}
                </Text>
              </View>
            </View>
            <View style={styles.newOrderField}>
              <Text style={styles.newOrderLabel}>Service template</Text>
              {selectableSkus.length === 0 ? (
                <View style={[styles.newOrderSelect, styles.newOrderSelectDisabled]}>
                  <Text style={styles.newOrderSelectPlaceholder}>
                    Please configure Service Catalog in the Firm module first.
                  </Text>
                </View>
              ) : (
                <View style={styles.newOrderSelectWrapper}>
                  <TouchableOpacity
                    style={styles.newOrderSelect}
                    onPress={() => setShowNewOrderSkuMenu((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.newOrderSelectText} numberOfLines={1}>
                      {selectedSkuId
                        ? selectableSkus.find((s) => s.id === selectedSkuId)?.name ?? 'Select a service template'
                        : 'Select a service template'}
                    </Text>
                    <Ionicons
                      name={showNewOrderSkuMenu ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#636E72"
                    />
                  </TouchableOpacity>
                  {showNewOrderSkuMenu && (
                    <View style={styles.newOrderSelectDropdown}>
                      <ScrollView
                        style={styles.newOrderSelectDropdownScroll}
                        contentContainerStyle={styles.newOrderSelectDropdownContent}
                        nestedScrollEnabled
                      >
                        {selectableSkus.map((sku) => (
                          <TouchableOpacity
                            key={sku.id}
                            style={[
                              styles.newOrderSelectOption,
                              selectedSkuId === sku.id && styles.newOrderSelectOptionSelected,
                            ]}
                            onPress={() => {
                              setSelectedSkuId(sku.id);
                              setShowNewOrderSkuMenu(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.newOrderSelectOptionTitle,
                                selectedSkuId === sku.id && styles.newOrderSelectOptionTitleSelected,
                              ]}
                              numberOfLines={1}
                            >
                              {sku.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}
            </View>
            <View style={[styles.modalActions, { marginTop: 80 }]}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setNewOrderModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  (!selectedSkuId || creatingOrder) && styles.modalConfirmBtnDisabled,
                ]}
                onPress={confirmCreateAndClose}
                disabled={!selectedSkuId || creatingOrder}
                activeOpacity={0.7}
              >
                {creatingOrder ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Create order</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Right: full-height SKU preview, reusing Add client viewer */}
          <View style={styles.newOrderRight}>
            <Text style={styles.newOrderPreviewTitle}>Service preview</Text>
            <SkuPreview sku={skus.find((s) => s.id === selectedSkuId) ?? null} />
          </View>
        </View>
      </CenterModal>

      <Modal visible={showAssigneePicker} transparent animationType="fade" onRequestClose={() => setShowAssigneePicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAssigneePicker(false)}>
          <Pressable style={[styles.modalCard, { maxWidth: 320 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assignee</Text>
              <TouchableOpacity onPress={() => setShowAssigneePicker(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color="#636E72" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 280 }}>
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => handleSelectAssignee(null)}
                disabled={savingAssignee}
              >
                <Text style={styles.pickerRowText}>None</Text>
                {!client?.assignedUserId ? <Ionicons name="checkmark" size={20} color="#6C5CE7" /> : null}
              </TouchableOpacity>
              {assigneeMembers.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.pickerRow}
                  onPress={() => handleSelectAssignee(m.id)}
                  disabled={savingAssignee}
                >
                  <Text style={styles.pickerRowText}>{m.name || m.email || m.id}</Text>
                  {client?.assignedUserId === m.id ? <Ionicons name="checkmark" size={20} color="#6C5CE7" /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            {savingAssignee ? <ActivityIndicator size="small" color="#6C5CE7" style={{ marginVertical: 8 }} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
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
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECEFF1' },
  errorText: { fontSize: 16, color: '#E74C3C' },

  operationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  tabGroup: {
    flexDirection: 'row',
    backgroundColor: '#F0F2F5',
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  tabChip: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 6 },
  tabChipActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabChipText: { fontSize: 13, fontWeight: '600', color: '#95A5A6' },
  tabChipTextActive: { color: '#2D3436' },
  operationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    gap: 5,
  },
  operationBtnText: { fontSize: 13, color: '#6C5CE7', fontWeight: '500' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    padding: 20,
    marginBottom: 20,
  },
  infoCardTitle: { fontSize: 11, fontWeight: '700', color: '#95A5A6', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 14 },
  infoGrid: { gap: 16 },
  infoItem: { gap: 4 },
  infoLabel: { fontSize: 12, color: '#95A5A6' },
  infoValue: { fontSize: 14, color: '#2D3436', fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E9ECEF' },
  statPill: {
    minWidth: 80,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    alignItems: 'center',
  },
  statNumber: { fontSize: 20, fontWeight: '700', color: '#2D3436' },
  statLabel: { fontSize: 12, color: '#636E72', marginTop: 2 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#636E72', marginBottom: 12 },
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
  emptyText: { fontSize: 13, color: '#95A5A6' },
  infoValueTouch: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  changeLink: { paddingVertical: 2, paddingHorizontal: 4 },
  changeLinkText: { fontSize: 13, color: '#6C5CE7', fontWeight: '500' },
  labelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  labelBadgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  labelsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  tagChipWrap: { flexDirection: 'row', alignItems: 'center' },
  tagRemove: { marginLeft: 2 },
  tagAddRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagInput: { borderWidth: 1, borderColor: '#E9ECEF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, minWidth: 100, flex: 1 },
  tagAddBtn: { backgroundColor: '#6C5CE7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  tagAddBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  pickerRowText: { fontSize: 14, color: '#2D3436' },
  followUpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  followUpRowIcon: { marginRight: 8, marginTop: 2 },
  followUpRowText: { flex: 1 },
  followUpContent: { fontSize: 13, color: '#2D3436', marginBottom: 2 },
  followUpMeta: { fontSize: 12, color: '#95A5A6' },

  cellText: { fontSize: 13, color: '#2D3436' },
  orderRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  orderSku: { fontSize: 14, fontWeight: '600', color: '#2D3436' },
  orderMeta: { fontSize: 13, color: '#636E72', marginTop: 2 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2D3436' },
  modalClientInfo: { marginTop: 8, marginBottom: 4 },
  modalClientName: { fontSize: 15, fontWeight: '600', color: '#2D3436', marginBottom: 2 },
  modalClientMeta: { fontSize: 13, color: '#636E72' },
  modalLabel: { fontSize: 13, fontWeight: '500', color: '#636E72', marginBottom: 8 },
  skuScroll: { marginBottom: 12 },
  skuChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginRight: 8,
  },
  skuChipSelected: { backgroundColor: '#6C5CE7', borderColor: '#6C5CE7' },
  skuChipText: { fontSize: 13, color: '#2D3436' },
  skuChipTextSelected: { color: '#fff', fontWeight: '600' },
  previewBox: {
    marginTop: 8,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    gap: 6,
  },
  previewTitle: { fontSize: 12, fontWeight: '600', color: '#636E72', marginBottom: 4 },
  previewItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewItemType: {
    fontSize: 11,
    color: '#636E72',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  previewItemTitle: { fontSize: 13, color: '#2D3436', flex: 1 },
  previewHint: { fontSize: 12, color: '#636E72', marginTop: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { fontSize: 14, color: '#636E72', fontWeight: '500' },
  modalConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#6C5CE7',
  },
  modalConfirmBtnDisabled: { opacity: 0.6 },
  modalConfirmText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  newOrderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 24,
  },
  newOrderLeftScroll: {
    maxHeight: 560,
    flex: 1,
  },
  newOrderLeftContent: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  newOrderSubtitle: {
    fontSize: 13,
    color: '#636E72',
    lineHeight: 18,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  newOrderRight: {
    width: 400,
    paddingRight: 12,
    flexShrink: 0,
    marginTop: 4,
    paddingLeft: 8,
  },
  newOrderPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636E72',
    marginBottom: 8,
  },
  newOrderField: {
    marginBottom: 16,
  },
  newOrderLabel: {
    fontSize: 13,
    color: '#636E72',
    marginBottom: 6,
    fontWeight: '500',
  },
  newOrderValueBox: {
    fontSize: 14,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  newOrderValueText: {
    fontSize: 14,
    color: '#2D3436',
  },
  newOrderSelectWrapper: {
    marginTop: 4,
    position: 'relative' as const,
    zIndex: 50,
  },
  newOrderSelect: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#F8F9FA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  newOrderSelectDisabled: {
    opacity: 0.6,
  },
  newOrderSelectText: {
    flex: 1,
    fontSize: 13,
    color: '#636E72',
    marginRight: 8,
  },
  newOrderSelectPlaceholder: {
    fontSize: 13,
    color: '#B2BEC3',
  },
  newOrderSelectDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#FFFFFF',
    maxHeight: 220,
    overflow: 'hidden',
    zIndex: 9999,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  newOrderSelectDropdownScroll: {
    maxHeight: 220,
  },
  newOrderSelectDropdownContent: {
    paddingVertical: 4,
  },
  newOrderSelectOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  newOrderSelectOptionSelected: {
    backgroundColor: 'rgba(108,92,231,0.06)',
  },
  newOrderSelectOptionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2D3436',
    marginBottom: 2,
  },
  newOrderSelectOptionTitleSelected: {
    color: '#6C5CE7',
  },
});
