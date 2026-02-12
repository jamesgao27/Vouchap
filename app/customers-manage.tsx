import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  mergeCustomer,
  unmergeCustomer,
  getCustomersForMergeHistory,
  getCustomerUsageCounts,
  type CustomersMergeHistoryData,
  type CustomerUsageCounts,
} from '@/lib/customers';
import { updateSupplier, mergeSupplier } from '@/lib/suppliers';
import { getCustomerListForManage, type CustomerListItem } from '@/lib/customer-supplier-list';
import { GradientText } from '@/lib/GradientText';
import type { Customer } from '@/types';

export default function CustomersManageScreen() {
  const router = useRouter();
  const [list, setList] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<'customer' | 'supplier'>('customer');
  const [editName, setEditName] = useState('');
  const [editTaxNumber, setEditTaxNumber] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editIsSupplier, setEditIsSupplier] = useState(false);
  const [editIsCustomer, setEditIsCustomer] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const editNameInputRef = useRef<TextInput>(null);
  const [showDuplicateNameModal, setShowDuplicateNameModal] = useState(false);
  const [duplicateNameModalPayload, setDuplicateNameModalPayload] = useState<{
    code: string;
    duplicateName: string;
    targetId?: string;
    targetSource?: 'customer' | 'supplier';
    editingId: string;
    editingSource: 'customer' | 'supplier';
  } | null>(null);
  const [newName, setNewName] = useState('');
  const [newTaxNumber, setNewTaxNumber] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newIsSupplier, setNewIsSupplier] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [mergeHistoryData, setMergeHistoryData] = useState<CustomersMergeHistoryData | null>(null);
  const [usageCounts, setUsageCounts] = useState<CustomerUsageCounts | null>(null);
  const [expandedRootIds, setExpandedRootIds] = useState<Set<string>>(new Set());
  const [showQuickCleanModal, setShowQuickCleanModal] = useState(false);
  const [showMergeTargetModal, setShowMergeTargetModal] = useState(false);
  const [mergeTargetModalAccounts, setMergeTargetModalAccounts] = useState<Customer[] | null>(null);
  const [mergeTargetSelectedId, setMergeTargetSelectedId] = useState<string | null>(null);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [deleteSelectedModalAccounts, setDeleteSelectedModalAccounts] = useState<Customer[] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (message: string, duration: number = 1500) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(duration),
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToastMessage(null));
  };

  useEffect(() => {
    loadList();
  }, []);

  const loadList = async () => {
    try {
      setLoading(true);
      const data = await getCustomerListForManage();
      setList(data);
    } catch (error) {
      console.error('Error loading customer list:', error);
      Alert.alert('Error', 'Failed to load list');
    } finally {
      setLoading(false);
    }
  };


  const handleAddCustomer = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Please enter customer name');
      return;
    }

    try {
      const newCustomer = await createCustomer(
        newName.trim(),
        false,
        newTaxNumber.trim() || undefined,
        newPhone.trim() || undefined,
        newAddress.trim() || undefined,
        newIsSupplier
      );
      setList(prev => [...prev, { ...newCustomer, source: 'customer' as const }]);
      setNewName('');
      setNewTaxNumber('');
      setNewPhone('');
      setNewAddress('');
      setNewIsSupplier(false);
      setShowAddForm(false);
      Alert.alert('Success', 'Customer created');
    } catch (error: any) {
      console.error('Error creating customer:', error);
      Alert.alert('Error', error.message || 'Failed to create customer');
      loadList();
    }
  };

  const handleUpdate = async (id: string, source: 'customer' | 'supplier') => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Please enter customer name');
      return;
    }

    try {
      if (source === 'customer') {
        await updateCustomer(id, {
          name: editName.trim(),
          taxNumber: editTaxNumber.trim() || undefined,
          phone: editPhone.trim() || undefined,
          address: editAddress.trim() || undefined,
          isSupplier: editIsSupplier,
        });
      } else {
        await updateSupplier(id, {
          name: editName.trim(),
          taxNumber: editTaxNumber.trim() || undefined,
          phone: editPhone.trim() || undefined,
          address: editAddress.trim() || undefined,
          isCustomer: editIsCustomer,
        });
      }
      setList(prev => prev.map(it => (it.id === id && it.source === source ? { ...it, name: editName.trim(), taxNumber: editTaxNumber.trim() || undefined, phone: editPhone.trim() || undefined, address: editAddress.trim() || undefined, ...(source === 'customer' ? { isSupplier: editIsSupplier } : { isCustomer: editIsCustomer }) } : it)));
      setEditingId(null);
      setEditName('');
      setEditTaxNumber('');
      setEditPhone('');
      setEditAddress('');
      setEditIsSupplier(false);
      setEditIsCustomer(false);
    } catch (error: any) {
      const code = error?.code;
      const targetId = error?.targetId as string | undefined;
      const targetSource = error?.targetSource as 'customer' | 'supplier' | undefined;
      if (code === 'CUSTOMER_NAME_EXISTS' || code === 'SUPPLIER_NAME_EXISTS') {
        setDuplicateNameModalPayload({
          code,
          duplicateName: (error?.duplicateName ?? editName) || '',
          targetId,
          targetSource,
          editingId: id,
          editingSource: source,
        });
        setShowDuplicateNameModal(true);
        return;
      }
      console.error('Error updating:', error);
      Alert.alert('Error', error.message || 'Failed to update');
      loadList();
    }
  };

  /** Close modal only; keep edited state (mask/back). */
  const handleDuplicateNameCloseOnly = () => {
    setShowDuplicateNameModal(false);
    setDuplicateNameModalPayload(null);
  };

  /** Keep editing: close modal, stay in edit mode and focus name input + keyboard. */
  const handleDuplicateNameKeepEditing = () => {
    setShowDuplicateNameModal(false);
    setDuplicateNameModalPayload(null);
    setTimeout(() => editNameInputRef.current?.focus(), 300);
  };

  /** Do not modify: close modal and cancel editing. */
  const handleDuplicateNameDontChange = () => {
    setShowDuplicateNameModal(false);
    setDuplicateNameModalPayload(null);
    setEditingId(null);
    setEditName('');
    setEditTaxNumber('');
    setEditPhone('');
    setEditAddress('');
    setEditIsSupplier(false);
    setEditIsCustomer(false);
  };

  const handleDuplicateNameMerge = async () => {
    const payload = duplicateNameModalPayload;
    if (!payload?.targetId || payload.targetSource == null) {
      setShowDuplicateNameModal(false);
      setDuplicateNameModalPayload(null);
      Alert.alert('Notice', 'Cannot merge: target not found.');
      return;
    }
    if (payload.editingSource !== payload.targetSource) {
      setShowDuplicateNameModal(false);
      setDuplicateNameModalPayload(null);
      Alert.alert('Notice', 'Current and target types differ. Cannot merge.');
      return;
    }
    setShowDuplicateNameModal(false);
    setDuplicateNameModalPayload(null);
    try {
      if (payload.editingSource === 'customer') {
        await mergeCustomer([payload.editingId], payload.targetId);
      } else {
        await mergeSupplier([payload.editingId], payload.targetId);
      }
      setEditingId(null);
      setEditName('');
      setEditTaxNumber('');
      setEditPhone('');
      setEditAddress('');
      setEditIsSupplier(false);
      setEditIsCustomer(false);
      loadList();
    } catch (e: any) {
      Alert.alert('Merge failed', e?.message ?? String(e));
      loadList();
    }
  };

  const handleDelete = (item: CustomerListItem) => {
    if (item.source === 'customer') {
      Alert.alert('Delete Customer', `Delete "${item.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCustomer(item.id);
              setList(prev => prev.filter(it => !(it.id === item.id && it.source === 'customer')));
              Alert.alert('Success', 'Customer deleted');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete');
              loadList();
            }
          },
        },
      ]);
    } else {
      Alert.alert('Remove from list', `Unmark "${item.name}" as customer? It will stay in supplier list.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: async () => {
            try {
              await updateSupplier(item.id, { isCustomer: false });
              setList(prev => prev.filter(it => !(it.id === item.id && it.source === 'supplier')));
              Alert.alert('Success', 'Removed from customer list');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed');
              loadList();
            }
          },
        },
      ]);
    }
  };

  const startEdit = (item: CustomerListItem) => {
    setEditingId(item.id);
    setEditingSource(item.source);
    setEditName(item.name);
    setEditTaxNumber(item.taxNumber || '');
    setEditPhone(item.phone || '');
    setEditAddress(item.address || '');
    setEditIsSupplier(item.source === 'customer' ? (item.isSupplier ?? false) : false);
    setEditIsCustomer(item.source === 'supplier' ? (item.isCustomer ?? false) : false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditTaxNumber('');
    setEditPhone('');
    setEditAddress('');
    setEditIsSupplier(false);
    setEditIsCustomer(false);
  };

  const toggleCustomerSelection = (customerId: string) => {
    const newSelected = new Set(selectedCustomerIds);
    if (newSelected.has(customerId)) newSelected.delete(customerId);
    else newSelected.add(customerId);
    setSelectedCustomerIds(newSelected);
  };

  const handleStartMerge = async () => {
    setMergeMode(true);
    setSelectedCustomerIds(new Set());
    setEditingId(null);
    setShowAddForm(false);
    setExpandedRootIds(new Set());
    try {
      const [historyData, counts] = await Promise.all([
        getCustomersForMergeHistory(),
        getCustomerUsageCounts(),
      ]);
      setMergeHistoryData(historyData);
      setUsageCounts(counts);
    } catch (e: any) {
      console.error('Error loading merge data:', e);
      Alert.alert('Error', e?.message ?? 'Failed to load merge data');
    }
  };

  const handleCancelMerge = () => {
    setMergeMode(false);
    setSelectedCustomerIds(new Set());
    setMergeHistoryData(null);
    setUsageCounts(null);
    setExpandedRootIds(new Set());
  };

  const directInvoices = (id: string) => usageCounts?.invoiceCountByCustomerId[id] ?? 0;
  const totalCount = (root: Customer, children: Customer[]) =>
    directInvoices(root.id) + children.reduce((s, c) => s + directInvoices(c.id), 0);
  const directCount = (id: string) => directInvoices(id);

  const cleanableRoots = (() => {
    if (!mergeHistoryData || !usageCounts) return [];
    return mergeHistoryData.roots.filter((root) => {
      const children = mergeHistoryData.childrenByRootId.get(root.id) ?? [];
      const hasUsage = directInvoices(root.id) > 0;
      const hasChildUsage = children.some((c) => directInvoices(c.id) > 0);
      const hasChildren = children.length > 0;
      return !hasUsage && !hasChildUsage && !hasChildren;
    });
  })();

  const handleCleanEmpty = () => {
    if (cleanableRoots.length === 0) {
      Alert.alert('Notice', 'No empty customers to clean.');
      return;
    }
    setShowQuickCleanModal(true);
  };

  const doQuickCleanConfirm = async () => {
    if (cleanableRoots.length === 0) return;
    setShowQuickCleanModal(false);
    try {
      for (const root of cleanableRoots) {
        await deleteCustomer(root.id);
      }
      await loadList();
      const [historyData, counts] = await Promise.all([
        getCustomersForMergeHistory(),
        getCustomerUsageCounts(),
      ]);
      setMergeHistoryData(historyData);
      setUsageCounts(counts);
      showToast(`Cleaned ${cleanableRoots.length} empty customer(s).`);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  const setMergeTargetSelection = (customerId: string) => setMergeTargetSelectedId(customerId);
  const confirmMergeTarget = () => {
    if (!mergeTargetSelectedId) return;
    const sourceIds = Array.from(selectedCustomerIds).filter((id) => id !== mergeTargetSelectedId);
    setShowMergeTargetModal(false);
    setMergeTargetModalAccounts(null);
    setMergeTargetSelectedId(null);
    performMerge(sourceIds, mergeTargetSelectedId);
  };
  const chooseMergeTarget = (target: Customer) => {
    setShowMergeTargetModal(false);
    setMergeTargetModalAccounts(null);
    setMergeTargetSelectedId(null);
    const sourceIds = Array.from(selectedCustomerIds).filter((id) => id !== target.id);
    performMerge(sourceIds, target.id);
  };

  const handleConfirmMerge = () => {
    if (selectedCustomerIds.size < 2) {
      Alert.alert('Error', 'Please select at least 2 customers to merge');
      return;
    }
    const allInMerge = mergeHistoryData
      ? [...mergeHistoryData.roots, ...Array.from(mergeHistoryData.childrenByRootId.values()).flat()]
      : [];
    const selected = allInMerge.filter((c) => selectedCustomerIds.has(c.id));
    setMergeTargetModalAccounts(selected);
    setMergeTargetSelectedId(null);
    setShowMergeTargetModal(true);
  };

  const performMerge = async (sourceCustomerIds: string[], targetCustomerId: string) => {
    try {
      await mergeCustomer(sourceCustomerIds, targetCustomerId);
      await loadList();
      const [historyData, counts] = await Promise.all([
        getCustomersForMergeHistory(),
        getCustomerUsageCounts(),
      ]);
      setMergeHistoryData(historyData);
      setUsageCounts(counts);
      setSelectedCustomerIds(new Set());
      setExpandedRootIds(new Set());
      showToast('Customers merged successfully');
    } catch (error: any) {
      console.error('Error merging customers:', error);
      Alert.alert('Error', error.message || 'Failed to merge customers');
    }
  };

  const handleUnmerge = async (childId: string) => {
    try {
      await unmergeCustomer(childId);
      await loadList();
      const [historyData, counts] = await Promise.all([
        getCustomersForMergeHistory(),
        getCustomerUsageCounts(),
      ]);
      setMergeHistoryData(historyData);
      setUsageCounts(counts);
      setSelectedCustomerIds((prev) => {
        const next = new Set(prev);
        next.delete(childId);
        return next;
      });
      showToast('Unmerged');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedCustomerIds.size === 0) return;
    const allInMerge = mergeHistoryData
      ? [...mergeHistoryData.roots, ...Array.from(mergeHistoryData.childrenByRootId.values()).flat()]
      : [];
    const selected = allInMerge.filter((c) => selectedCustomerIds.has(c.id));
    setDeleteSelectedModalAccounts(selected);
    setShowDeleteSelectedModal(true);
  };

  const doDeleteSelectedConfirm = async () => {
    const selected = deleteSelectedModalAccounts;
    setShowDeleteSelectedModal(false);
    setDeleteSelectedModalAccounts(null);
    if (!selected || selected.length === 0) return;
    try {
      for (const c of selected) {
        await deleteCustomer(c.id);
      }
      await loadList();
      const [historyData, counts] = await Promise.all([
        getCustomersForMergeHistory(),
        getCustomerUsageCounts(),
      ]);
      setMergeHistoryData(historyData);
      setUsageCounts(counts);
      setSelectedCustomerIds(new Set());
      showToast(`Deleted ${selected.length} customer(s).`);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  const toggleExpand = (rootId: string) => {
    setExpandedRootIds((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6C5CE7" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {toastMessage && (
        <Animated.View style={[styles.toastWrapper, { opacity: toastOpacity }]} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </Animated.View>
      )}

      <Modal visible={showDuplicateNameModal} transparent animationType="fade" onRequestClose={handleDuplicateNameCloseOnly}>
        <TouchableOpacity style={styles.duplicateModalOverlay} activeOpacity={1} onPress={handleDuplicateNameCloseOnly}>
          <View style={styles.duplicateModalContentContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.duplicateModalContent}>
              <View style={styles.duplicateModalHeader}>
                <Ionicons name="person-outline" size={48} color="#6C5CE7" />
                <Text style={styles.duplicateModalTitle}>
                  {duplicateNameModalPayload?.code === 'CUSTOMER_NAME_EXISTS' ? 'Duplicate customer name:' : 'Duplicate supplier name:'}
                </Text>
              </View>
              <View style={styles.duplicateModalMessageBlock}>
                <View style={styles.duplicateModalNameContainer}>
                  <Text style={styles.duplicateModalNameText}>{duplicateNameModalPayload?.duplicateName || '—'}</Text>
                </View>
              </View>
              <View style={styles.duplicateModalButtons}>
                <TouchableOpacity style={[styles.duplicateModalButton, styles.duplicateModalButtonReplace]} onPress={handleDuplicateNameKeepEditing} activeOpacity={0.8}>
                  <Ionicons name="create-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.duplicateModalButtonReplaceText}>Keep editing</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.duplicateModalButton, styles.duplicateModalButtonMerge]} onPress={handleDuplicateNameMerge} activeOpacity={0.8}>
                  <Ionicons name="git-merge-outline" size={20} color="#E74C3C" style={{ marginRight: 8 }} />
                  <Text style={styles.duplicateModalButtonMergeText}>Merge into existing</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.duplicateModalButton, styles.duplicateModalButtonDontChange]} onPress={handleDuplicateNameDontChange} activeOpacity={0.8}>
                  <Ionicons name="close-outline" size={18} color="#95A5A6" style={{ marginRight: 6 }} />
                  <Text style={styles.duplicateModalButtonDontChangeText}>Do not modify</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Quick Clean */}
      <Modal visible={showQuickCleanModal} transparent animationType="fade" onRequestClose={() => setShowQuickCleanModal(false)}>
        <TouchableOpacity style={styles.actionModalOverlay} activeOpacity={1} onPress={() => setShowQuickCleanModal(false)}>
          <View style={styles.actionModalContentContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.actionModalContent}>
              <View style={styles.actionModalHeader}>
                <View style={styles.actionModalHeaderIconWrap}>
                  <Ionicons name="trash-outline" size={40} color="#E67E22" />
                </View>
                <Text style={styles.actionModalTitle}>Quick Clean</Text>
                <Text style={styles.actionModalSubtitle}>
                  Delete {cleanableRoots.length} empty customer(s) (no invoices, not merged):
                </Text>
              </View>
              <ScrollView style={styles.actionModalList} nestedScrollEnabled>
                {cleanableRoots.map((r) => (
                  <View key={r.id} style={styles.actionModalRow}>
                    <Text style={styles.actionModalRowText} numberOfLines={1}>{r.name}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.actionModalButtons}>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonSecondary]} onPress={() => setShowQuickCleanModal(false)} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonWarning]} onPress={doQuickCleanConfirm} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonWarningText}>Clean</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Merge: choose which customer to keep */}
      <Modal visible={showMergeTargetModal} transparent animationType="fade" onRequestClose={() => { setShowMergeTargetModal(false); setMergeTargetModalAccounts(null); setMergeTargetSelectedId(null); }}>
        <TouchableOpacity style={styles.actionModalOverlay} activeOpacity={1} onPress={() => { setShowMergeTargetModal(false); setMergeTargetModalAccounts(null); setMergeTargetSelectedId(null); }}>
          <View style={styles.actionModalContentContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.actionModalContent}>
              <View style={styles.actionModalHeader}>
                <View style={styles.actionModalHeaderIconWrap}>
                  <Ionicons name="git-merge-outline" size={40} color="#6C5CE7" />
                </View>
                <Text style={styles.actionModalTitle}>Choose which customer to keep,</Text>
                <Text style={styles.actionModalSubtitle}>Others will be merged into it.</Text>
              </View>
              <ScrollView style={styles.actionModalList} nestedScrollEnabled>
                {(mergeTargetModalAccounts ?? []).map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.actionModalRowTappable, mergeTargetSelectedId === c.id && styles.actionModalRowSelected]}
                    onPress={() => setMergeTargetSelection(c.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionModalRowText} numberOfLines={1}>{c.name}</Text>
                    {mergeTargetSelectedId === c.id ? (
                      <Ionicons name="checkmark-circle" size={22} color="#6C5CE7" />
                    ) : (
                      <Ionicons name="ellipse-outline" size={22} color="#BDC3C7" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.actionModalButtons}>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonSecondary]} onPress={() => { setShowMergeTargetModal(false); setMergeTargetModalAccounts(null); setMergeTargetSelectedId(null); }} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonPrimary]} onPress={confirmMergeTarget} disabled={!mergeTargetSelectedId} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonPrimaryText}>Merge</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete selected */}
      <Modal visible={showDeleteSelectedModal} transparent animationType="fade" onRequestClose={() => { setShowDeleteSelectedModal(false); setDeleteSelectedModalAccounts(null); }}>
        <TouchableOpacity style={styles.actionModalOverlay} activeOpacity={1} onPress={() => { setShowDeleteSelectedModal(false); setDeleteSelectedModalAccounts(null); }}>
          <View style={styles.actionModalContentContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.actionModalContent}>
              <View style={styles.actionModalHeader}>
                <View style={styles.actionModalHeaderIconWrap}>
                  <Ionicons name="trash-outline" size={40} color="#E74C3C" />
                </View>
                <Text style={styles.actionModalSubtitle}>
                  Delete {deleteSelectedModalAccounts?.length ?? 0} selected customer(s)?
                </Text>
              </View>
              <ScrollView style={styles.actionModalList} nestedScrollEnabled>
                {(deleteSelectedModalAccounts ?? []).map((c) => (
                  <View key={c.id} style={styles.actionModalRow}>
                    <Text style={styles.actionModalRowText} numberOfLines={1}>{c.name}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.actionModalButtons}>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonSecondary]} onPress={() => { setShowDeleteSelectedModal(false); setDeleteSelectedModalAccounts(null); }} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonDanger]} onPress={doDeleteSelectedConfirm} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonDangerText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      
      {/* Header */}
      {mergeMode ? (
        <View style={styles.headerMerge}>
          <View style={styles.headerMergeTextBlock}>
            <GradientText
              text="Select two or more, then choose which to keep, others will be merged into it."
              style={styles.mergeHeaderTextInHeader}
              containerStyle={styles.mergeHeaderGradientContainer}
            />
          </View>
          <View style={styles.headerTableRow}>
            <View style={styles.checkboxContainer} />
            <View style={styles.headerTableRowNameCell}>
              <Text style={styles.tableHeaderNameLeft}>Customer</Text>
              <Text style={styles.headerSelectedCount}>
                （{selectedCustomerIds.size}/{mergeHistoryData ? mergeHistoryData.roots.length : 0}）
              </Text>
            </View>
            <View style={styles.countsCell}>
              <Text style={styles.tableHeaderCount}>Records</Text>
            </View>
            <View style={styles.expandPlaceholderSmall} />
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <GradientText
              text="Customers for invoices and outbound, Keep collecting and connecting."
              style={styles.headerTitle}
              containerStyle={styles.gradientTextContainer}
            />
          </View>
        </View>
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, mergeMode ? styles.scrollContentWithBottomBar : null]}>
        {/* Customers List */}
        <View style={styles.customersList}>
          {/* Add New Customer Button */}
          {!showAddForm && !mergeMode && (
            <TouchableOpacity
              style={styles.customerCard}
              onPress={() => setShowAddForm(true)}
            >
              <View style={styles.addCustomerRow}>
                <Ionicons name="add-circle" size={20} color="#6C5CE7" />
                <Text style={styles.addCustomerText}>Add Customer</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Add Customer Form */}
          {showAddForm && (
            <View style={styles.formCard}>
              <TextInput
                style={styles.editInputInline}
                value={newName}
                onChangeText={setNewName}
                placeholder="Customer name *"
                placeholderTextColor="#95A5A6"
              />
              <TextInput
                style={styles.editInputInline}
                value={newTaxNumber}
                onChangeText={setNewTaxNumber}
                placeholder="Tax number (optional)"
                placeholderTextColor="#95A5A6"
              />
              <TextInput
                style={styles.editInputInline}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="Phone (optional)"
                placeholderTextColor="#95A5A6"
                keyboardType="phone-pad"
              />
              <TextInput
                style={[styles.editInputInline, styles.multilineInput]}
                value={newAddress}
                onChangeText={setNewAddress}
                placeholder="Address (optional)"
                placeholderTextColor="#95A5A6"
                multiline
                numberOfLines={2}
              />
              <TouchableOpacity
                style={styles.toggleButton}
                onPress={() => setNewIsSupplier(!newIsSupplier)}
              >
                <Ionicons 
                  name={newIsSupplier ? "checkmark-circle" : "ellipse-outline"} 
                  size={20} 
                  color={newIsSupplier ? "#6C5CE7" : "#95A5A6"} 
                />
                <Text style={[styles.toggleButtonText, newIsSupplier && styles.toggleButtonTextActive]}>
                  Also a supplier
                </Text>
              </TouchableOpacity>
              <View style={styles.editButtonsInline}>
                <TouchableOpacity
                  style={styles.cancelButtonInline}
                  onPress={() => {
                    setShowAddForm(false);
                    setNewName('');
                    setNewTaxNumber('');
                    setNewPhone('');
                    setNewAddress('');
                    setNewIsSupplier(false);
                  }}
                >
                  <Text style={styles.cancelButtonTextInline}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButtonInline}
                  onPress={handleAddCustomer}
                >
                  <Text style={styles.confirmButtonTextInline}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {mergeMode && mergeHistoryData ? (
            mergeHistoryData.roots.map((root) => {
              const children = mergeHistoryData.childrenByRootId.get(root.id) ?? [];
              const expanded = expandedRootIds.has(root.id);
              const hasChildren = children.length > 0;
              return (
                <View key={root.id} style={styles.customerCard}>
                  <View style={[styles.mergeRowRoot, selectedCustomerIds.has(root.id) && styles.customerRowSelected]}>
                    <TouchableOpacity
                      style={styles.mergeRowSelectionArea}
                      onPress={() => toggleCustomerSelection(root.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.checkboxContainer}>
                        {selectedCustomerIds.has(root.id) ? (
                          <Ionicons name="checkbox" size={24} color="#6C5CE7" />
                        ) : (
                          <Ionicons name="checkbox-outline" size={24} color="#BDC3C7" />
                        )}
                      </View>
                      <Text style={styles.customerName} numberOfLines={1}>{root.name}</Text>
                      <View style={styles.countsCell}>
                        <Text style={styles.countText}>
                          {expanded ? directCount(root.id) : totalCount(root, children)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {hasChildren ? (
                      <TouchableOpacity
                        style={styles.expandButtonSmall}
                        onPress={() => toggleExpand(root.id)}
                        hitSlop={{ left: 0, right: 48, top: 24, bottom: 24 }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={14} color="#6C5CE7" />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.expandPlaceholderSmall} />
                    )}
                  </View>
                  {expanded && children.map((child) => (
                    <View key={child.id} style={[styles.childRow, selectedCustomerIds.has(child.id) && styles.customerRowSelected]}>
                      <TouchableOpacity
                        style={styles.mergeRowSelectionArea}
                        onPress={() => toggleCustomerSelection(child.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.checkboxContainer}>
                          {selectedCustomerIds.has(child.id) ? (
                            <Ionicons name="checkbox" size={24} color="#6C5CE7" />
                          ) : (
                            <Ionicons name="checkbox-outline" size={24} color="#BDC3C7" />
                          )}
                        </View>
                        <Text style={styles.childName} numberOfLines={1}>{child.name}</Text>
                        <View style={styles.countsCell}>
                          <Text style={styles.countText}>{directCount(child.id)}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.childRowUnmergeButton}
                        onPress={() => handleUnmerge(child.id)}
                        hitSlop={{ left: 8, right: 8, top: 8, bottom: 8 }}
                      >
                        <Ionicons name="exit-outline" size={14} color="#6C5CE7" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })
          ) : (
            list.map((item) => (
              <View key={`${item.source}-${item.id}`} style={styles.customerCard}>
                {editingId === item.id && editingSource === item.source ? (
                  <View style={styles.editRow}>
                    <TextInput
                      ref={editNameInputRef}
                      style={styles.editInputInline}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Customer name *"
                      placeholderTextColor="#95A5A6"
                    />
                    <TextInput
                      style={styles.editInputInline}
                      value={editTaxNumber}
                      onChangeText={setEditTaxNumber}
                      placeholder="Tax number (optional)"
                      placeholderTextColor="#95A5A6"
                    />
                    <TextInput
                      style={styles.editInputInline}
                      value={editPhone}
                      onChangeText={setEditPhone}
                      placeholder="Phone (optional)"
                      placeholderTextColor="#95A5A6"
                      keyboardType="phone-pad"
                    />
                    <TextInput
                      style={[styles.editInputInline, styles.multilineInput]}
                      value={editAddress}
                      onChangeText={setEditAddress}
                      placeholder="Address (optional)"
                      placeholderTextColor="#95A5A6"
                      multiline
                      numberOfLines={2}
                    />
                    {editingSource === 'customer' && (
                      <TouchableOpacity style={styles.toggleButton} onPress={() => setEditIsSupplier(!editIsSupplier)}>
                        <Ionicons name={editIsSupplier ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={editIsSupplier ? '#6C5CE7' : '#95A5A6'} />
                        <Text style={[styles.toggleButtonText, editIsSupplier && styles.toggleButtonTextActive]}>Also a supplier</Text>
                      </TouchableOpacity>
                    )}
                    {editingSource === 'supplier' && (
                      <TouchableOpacity style={styles.toggleButton} onPress={() => setEditIsCustomer(!editIsCustomer)}>
                        <Ionicons name={editIsCustomer ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={editIsCustomer ? '#6C5CE7' : '#95A5A6'} />
                        <Text style={[styles.toggleButtonText, editIsCustomer && styles.toggleButtonTextActive]}>Also a customer</Text>
                      </TouchableOpacity>
                    )}
                    <View style={styles.editButtonsInline}>
                      <TouchableOpacity style={styles.cancelButtonInline} onPress={cancelEdit}>
                        <Text style={styles.cancelButtonTextInline}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.confirmButtonInline} onPress={() => handleUpdate(item.id, item.source)}>
                        <Text style={styles.confirmButtonTextInline}>Confirm</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.customerRow}>
                    <View style={styles.customerIndicator}>
                      <Ionicons name="person-outline" size={16} color="#6C5CE7" />
                    </View>
                    <View style={styles.customerInfo}>
                      <View style={styles.customerNameRow}>
                        <Text style={styles.customerName} numberOfLines={1}>{item.name}</Text>
                        {item.source === 'customer' && item.isSupplier && (
                          <View style={styles.linkedBadge}>
                            <Ionicons name="storefront-outline" size={12} color="#6C5CE7" />
                            <Text style={styles.linkedBadgeText}>Supplier</Text>
                          </View>
                        )}
                      </View>
                      {(item.taxNumber || item.phone || item.address) && (
                        <View style={styles.customerDetails}>
                          {item.taxNumber && <Text style={styles.customerDetailText} numberOfLines={1}>Tax: {item.taxNumber}</Text>}
                          {item.phone && <Text style={styles.customerDetailText} numberOfLines={1}>Phone: {item.phone}</Text>}
                          {item.address && <Text style={styles.customerDetailText} numberOfLines={1}>Address: {item.address}</Text>}
                        </View>
                      )}
                      {item.source === 'supplier' && (
                        <View style={styles.linkedBadge}>
                          <Ionicons name="storefront-outline" size={12} color="#6C5CE7" />
                          <Text style={styles.linkedBadgeText}>From supplier list</Text>
                        </View>
                      )}
                    </View>
                    {'isAiRecognized' in item && item.isAiRecognized && (
                      <View style={styles.aiBadge}>
                        <Text style={styles.aiBadgeText}>AI</Text>
                      </View>
                    )}
                    <View style={styles.customerActions}>
                      <TouchableOpacity style={styles.iconButton} onPress={() => startEdit(item)}>
                        <Ionicons name="create-outline" size={18} color="#6C5CE7" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconButton} onPress={() => handleDelete(item)}>
                        <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {!showAddForm && !mergeMode && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomBarAddButton} onPress={() => setShowAddForm(true)}>
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.bottomBarAddButtonText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomBarMergeButton} onPress={handleStartMerge}>
            <Ionicons name="git-merge-outline" size={20} color="#fff" />
            <Text style={styles.bottomBarMergeButtonText}>Merge & Clean</Text>
          </TouchableOpacity>
        </View>
      )}

      {mergeMode && (
        <View style={[styles.bottomBar, styles.bottomBarMergeMode]}>
          {selectedCustomerIds.size === 0 ? (
            <View style={styles.bottomBarCleanWrapper}>
              <TouchableOpacity style={styles.bottomBarCleanButton} onPress={handleCleanEmpty}>
                <Ionicons name="trash-outline" size={18} color="#E67E22" />
                <Text style={styles.bottomBarCleanButtonText}>Quick Clean</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.bottomBarMergeActions}>
              <TouchableOpacity style={styles.bottomBarCancelButton} onPress={handleCancelMerge}>
                <Text style={styles.bottomBarCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bottomBarConfirmButton}
                onPress={handleConfirmMerge}
                disabled={selectedCustomerIds.size < 2}
              >
                <Text style={styles.bottomBarConfirmButtonText}>Merge</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bottomBarDeleteButton} onPress={handleDeleteSelected}>
                <Text style={styles.bottomBarDeleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  toastWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    alignSelf: 'center',
    backgroundColor: 'rgba(45, 52, 54, 0.9)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerMerge: {
    flexDirection: 'column',
    paddingTop: 13,
    paddingBottom: 0,
    minHeight: 88,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerMergeTextBlock: {
    alignItems: 'flex-start',
    paddingBottom: 4,
    paddingLeft: 64,
    paddingRight: 16,
    paddingTop: 0,
  },
  mergeHeaderTextInHeader: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'left',
  },
  mergeHeaderGradientContainer: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
  headerTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 6,
    paddingRight: 32,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: 24,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  headerTableRowNameCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  tableHeaderNameLeft: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636E72',
  },
  headerSelectedCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636E72',
    marginLeft: 4,
  },
  tableHeaderCount: {
    minWidth: 64,
    fontSize: 13,
    fontWeight: '600',
    color: '#636E72',
    textAlign: 'right',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  gradientTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  scrollContentWithBottomBar: {
    paddingBottom: 88,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  customersList: {
    gap: 12,
  },
  customerCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
  },
  mergeRowRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
  },
  mergeRowSelectionArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  expandButtonSmall: {
    padding: 2,
    marginRight: 4,
  },
  expandPlaceholderSmall: {
    width: 18,
  },
  countsCell: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 64,
  },
  countText: {
    fontSize: 13,
    color: '#636E72',
    textAlign: 'right',
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingVertical: 6,
    minHeight: 40,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  childName: {
    flex: 1,
    fontSize: 14,
    color: '#636E72',
  },
  childRowUnmergeButton: {
    width: 18,
    marginRight: 4,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerRowSelected: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 4,
  },
  checkboxContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  customerIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 4,
  },
  customerDetails: {
    gap: 2,
  },
  customerDetailText: {
    fontSize: 12,
    color: '#636E72',
    lineHeight: 16,
  },
  aiBadge: {
    backgroundColor: '#E8F4FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  customerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingTop: 2,
  },
  addCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addCustomerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  iconButton: {
    padding: 4,
  },
  editRow: {
    flexDirection: 'column',
    gap: 8,
  },
  editInputInline: {
    width: '100%',
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
    padding: 8,
    fontSize: 15,
    color: '#2D3436',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginBottom: 8,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  editButtonsInline: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    alignItems: 'center',
  },
  cancelButtonInline: {
    backgroundColor: '#E9ECEF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  confirmButtonInline: {
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButtonTextInline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#636E72',
  },
  confirmButtonTextInline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    gap: 8,
  },
  toggleButtonText: {
    flex: 1,
    fontSize: 14,
    color: '#636E72',
  },
  toggleButtonTextActive: {
    color: '#6C5CE7',
    fontWeight: '600',
  },
  toggleButtonDisabled: {
    opacity: 0.85,
  },
  toggleButtonTextWrap: {
    flex: 1,
  },
  toggleHint: {
    fontSize: 11,
    color: '#636E72',
    marginTop: 2,
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F4FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  linkedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    flexDirection: 'row',
    gap: 12,
  },
  bottomBarMergeMode: {
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  bottomBarCleanWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBarMergeActions: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomBarCleanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 220,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E67E22',
  },
  bottomBarCleanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E67E22',
  },
  bottomBarAddButton: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    ...(Platform.OS === 'android' ? { elevation: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' } : { elevation: 4 }),
  },
  bottomBarAddButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  bottomBarMergeButton: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    ...(Platform.OS === 'android' ? { elevation: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' } : { elevation: 4 }),
  },
  bottomBarMergeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  bottomBarCancelButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.11,
    shadowRadius: 10,
    ...(Platform.OS === 'android' ? { elevation: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' } : { elevation: 3 }),
  },
  bottomBarCancelButtonText: {
    fontSize: 16,
    color: '#636E72',
    fontWeight: '600',
  },
  bottomBarConfirmButton: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    ...(Platform.OS === 'android' ? { elevation: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' } : { elevation: 4 }),
  },
  bottomBarConfirmButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  bottomBarDeleteButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E74C3C',
  },
  bottomBarDeleteButtonText: {
    fontSize: 16,
    color: '#E74C3C',
    fontWeight: '600',
  },
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionModalContentContainer: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    alignItems: 'center',
  },
  actionModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  actionModalHeader: {
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 20,
    paddingTop: 4,
  },
  actionModalHeaderIconWrap: {
    marginBottom: 8,
  },
  actionModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A2E',
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  actionModalSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A2E',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  actionModalList: {
    width: '100%',
    minHeight: 180,
    maxHeight: 360,
    marginTop: 8,
    marginBottom: 20,
  },
  actionModalRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  actionModalRowTappable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  actionModalRowSelected: {
    backgroundColor: '#E8F4FD',
    borderLeftWidth: 3,
    borderLeftColor: '#6C5CE7',
  },
  actionModalRowText: {
    fontSize: 16,
    color: '#2D3436',
    flex: 1,
  },
  actionModalButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    justifyContent: 'flex-end',
  },
  actionModalButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  actionModalButtonSecondary: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  actionModalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#636E72',
  },
  actionModalButtonPrimary: {
    backgroundColor: '#6C5CE7',
  },
  actionModalButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionModalButtonWarning: {
    backgroundColor: '#FFF5F0',
    borderWidth: 1,
    borderColor: '#E67E22',
  },
  actionModalButtonWarningText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E67E22',
  },
  actionModalButtonDanger: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#E74C3C',
  },
  actionModalButtonDangerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E74C3C',
  },
  duplicateModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  duplicateModalContentContainer: { width: '100%', maxWidth: 400, alignItems: 'center' },
  duplicateModalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  duplicateModalHeader: { alignItems: 'center', marginBottom: 16 },
  duplicateModalTitle: { fontSize: 22, fontWeight: '600', color: '#2D3436', marginTop: 12, marginBottom: 0 },
  duplicateModalMessageBlock: { marginBottom: 24, paddingHorizontal: 8, alignItems: 'center', width: '100%' },
  duplicateModalNameContainer: { marginTop: 8, marginBottom: 20, alignSelf: 'stretch', borderBottomWidth: 1, borderBottomColor: '#E0E7FF', paddingBottom: 8 },
  duplicateModalNameText: { fontSize: 18, fontWeight: '800', color: '#6C5CE7', textAlign: 'center', letterSpacing: 0.3 },
  duplicateModalMessage: { fontSize: 15, color: '#636E72', textAlign: 'center', marginTop: 4 },
  duplicateModalButtons: { flexDirection: 'column', width: '100%', gap: 10 },
  duplicateModalButton: { width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 52, flexDirection: 'row' },
  duplicateModalButtonReplace: { backgroundColor: '#27AE60', shadowColor: '#27AE60', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  duplicateModalButtonReplaceText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  duplicateModalButtonMerge: { backgroundColor: '#FFF5F5', borderWidth: 2, borderColor: '#E74C3C' },
  duplicateModalButtonMergeText: { fontSize: 16, fontWeight: '600', color: '#E74C3C' },
  duplicateModalButtonDontChange: { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E9ECEF' },
  duplicateModalButtonDontChangeText: { fontSize: 15, fontWeight: '500', color: '#95A5A6' },
});
