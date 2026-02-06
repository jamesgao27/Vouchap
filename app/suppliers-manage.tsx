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
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  createSupplier,
  updateSupplier,
  deleteSupplier,
  mergeSupplier,
} from '@/lib/suppliers';
import { updateCustomer, mergeCustomer } from '@/lib/customers';
import { getSupplierListForManage, type SupplierListItem } from '@/lib/customer-supplier-list';
import { GradientText } from '@/lib/GradientText';

export default function SuppliersManageScreen() {
  const router = useRouter();
  const [list, setList] = useState<SupplierListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<'supplier' | 'customer'>('supplier');
  const [editName, setEditName] = useState('');
  const [editTaxNumber, setEditTaxNumber] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editIsCustomer, setEditIsCustomer] = useState(false);
  const [editIsSupplier, setEditIsSupplier] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTaxNumber, setNewTaxNumber] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newIsCustomer, setNewIsCustomer] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());
  const editNameInputRef = useRef<TextInput>(null);
  const [showDuplicateNameModal, setShowDuplicateNameModal] = useState(false);
  const [duplicateNameModalPayload, setDuplicateNameModalPayload] = useState<{
    code: string;
    duplicateName: string;
    targetId?: string;
    targetSource?: 'supplier' | 'customer';
    editingId: string;
    editingSource: 'supplier' | 'customer';
  } | null>(null);

  useEffect(() => {
    loadList();
  }, []);

  const loadList = async () => {
    try {
      setLoading(true);
      const data = await getSupplierListForManage();
      setList(data);
    } catch (error) {
      console.error('Error loading supplier list:', error);
      Alert.alert('Error', 'Failed to load list');
    } finally {
      setLoading(false);
    }
  };


  const handleAddSupplier = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Please enter supplier name');
      return;
    }

    try {
      const newSupplier = await createSupplier(
        newName.trim(),
        false,
        newTaxNumber.trim() || undefined,
        newPhone.trim() || undefined,
        newAddress.trim() || undefined,
        newIsCustomer
      );
      setList(prev => [...prev, { ...newSupplier, source: 'supplier' as const }]);
      setNewName('');
      setNewTaxNumber('');
      setNewPhone('');
      setNewAddress('');
      setNewIsCustomer(false);
      setShowAddForm(false);
      Alert.alert('Success', 'Supplier created');
    } catch (error: any) {
      console.error('Error creating supplier:', error);
      Alert.alert('Error', error.message || 'Failed to create supplier');
      loadList();
    }
  };

  const handleUpdate = async (id: string, source: 'supplier' | 'customer') => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Please enter name');
      return;
    }
    try {
      if (source === 'supplier') {
        await updateSupplier(id, {
          name: editName.trim(),
          taxNumber: editTaxNumber.trim() || undefined,
          phone: editPhone.trim() || undefined,
          address: editAddress.trim() || undefined,
          isCustomer: editIsCustomer,
        });
      } else {
        await updateCustomer(id, {
          name: editName.trim(),
          taxNumber: editTaxNumber.trim() || undefined,
          phone: editPhone.trim() || undefined,
          address: editAddress.trim() || undefined,
          isSupplier: editIsSupplier,
        });
      }
      setList(prev => prev.map(it => (it.id === id && it.source === source ? { ...it, name: editName.trim(), taxNumber: editTaxNumber.trim() || undefined, phone: editPhone.trim() || undefined, address: editAddress.trim() || undefined, ...(source === 'supplier' ? { isCustomer: editIsCustomer } : { isSupplier: editIsSupplier }) } : it)));
      setEditingId(null);
      setEditName('');
      setEditTaxNumber('');
      setEditPhone('');
      setEditAddress('');
      setEditIsCustomer(false);
      setEditIsSupplier(false);
    } catch (error: any) {
      const code = error?.code;
      const targetId = error?.targetId as string | undefined;
      const targetSource = error?.targetSource as 'supplier' | 'customer' | undefined;
      if (code === 'SUPPLIER_NAME_EXISTS' || code === 'CUSTOMER_NAME_EXISTS') {
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
    setEditIsCustomer(false);
    setEditIsSupplier(false);
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
      if (payload.editingSource === 'supplier') {
        await mergeSupplier([payload.editingId], payload.targetId);
      } else {
        await mergeCustomer([payload.editingId], payload.targetId);
      }
      setEditingId(null);
      setEditName('');
      setEditTaxNumber('');
      setEditPhone('');
      setEditAddress('');
      setEditIsCustomer(false);
      setEditIsSupplier(false);
      loadList();
    } catch (e: any) {
      Alert.alert('Merge failed', e?.message ?? String(e));
      loadList();
    }
  };

  const handleDelete = (item: SupplierListItem) => {
    if (item.source === 'supplier') {
      Alert.alert('Delete Supplier', `Delete "${item.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSupplier(item.id);
              setList(prev => prev.filter(it => !(it.id === item.id && it.source === 'supplier')));
              Alert.alert('Success', 'Supplier deleted');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete');
              loadList();
            }
          },
        },
      ]);
    } else {
      Alert.alert('Remove from list', `Unmark "${item.name}" as supplier? It will stay in customer list.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: async () => {
            try {
              await updateCustomer(item.id, { isSupplier: false });
              setList(prev => prev.filter(it => !(it.id === item.id && it.source === 'customer')));
              Alert.alert('Success', 'Removed from supplier list');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed');
              loadList();
            }
          },
        },
      ]);
    }
  };

  const startEdit = (item: SupplierListItem) => {
    setEditingId(item.id);
    setEditingSource(item.source);
    setEditName(item.name);
    setEditTaxNumber(item.taxNumber || '');
    setEditPhone(item.phone || '');
    setEditAddress(item.address || '');
    setEditIsCustomer(item.source === 'supplier' ? (item.isCustomer ?? false) : false);
    setEditIsSupplier(item.source === 'customer' ? (item.isSupplier ?? false) : false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditTaxNumber('');
    setEditPhone('');
    setEditAddress('');
    setEditIsCustomer(false);
    setEditIsSupplier(false);
  };

  const toggleSupplierSelection = (supplierId: string) => {
    const newSelected = new Set(selectedSupplierIds);
    if (newSelected.has(supplierId)) {
      newSelected.delete(supplierId);
    } else {
      newSelected.add(supplierId);
    }
    setSelectedSupplierIds(newSelected);
  };

  const handleStartMerge = () => {
    setMergeMode(true);
    setSelectedSupplierIds(new Set());
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleCancelMerge = () => {
    setMergeMode(false);
    setSelectedSupplierIds(new Set());
  };

  const handleConfirmMerge = () => {
    if (selectedSupplierIds.size < 2) {
      Alert.alert('Error', 'Please select at least 2 suppliers to merge');
      return;
    }

    const selectedSuppliers = list.filter((it): it is SupplierListItem & { source: 'supplier' } => it.source === 'supplier' && selectedSupplierIds.has(it.id));
    const supplierNames = selectedSuppliers.map(sup => sup.name).join('\n');

    Alert.alert(
      'Select Target Supplier',
      `Select which supplier to keep (others will be merged into it):\n\n${supplierNames}`,
      [
        ...selectedSuppliers.map(supplier => ({
          text: supplier.name,
          onPress: () => {
            const sourceIds = Array.from(selectedSupplierIds).filter(id => id !== supplier.id);
            performMerge(sourceIds, supplier.id);
          },
        })),
        { text: 'Cancel', style: 'cancel' as const, onPress: handleCancelMerge },
      ]
    );
  };

  const performMerge = async (sourceSupplierIds: string[], targetSupplierId: string) => {
    try {
      await mergeSupplier(sourceSupplierIds, targetSupplierId);
      await loadList();
      setMergeMode(false);
      setSelectedSupplierIds(new Set());
      Alert.alert('Success', 'Suppliers merged successfully');
    } catch (error: any) {
      console.error('Error merging suppliers:', error);
      Alert.alert('Error', error.message || 'Failed to merge suppliers');
    }
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

      <Modal visible={showDuplicateNameModal} transparent animationType="fade" onRequestClose={handleDuplicateNameCloseOnly}>
        <TouchableOpacity style={styles.duplicateModalOverlay} activeOpacity={1} onPress={handleDuplicateNameCloseOnly}>
          <View style={styles.duplicateModalContentContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.duplicateModalContent}>
              <View style={styles.duplicateModalHeader}>
                <Ionicons name="business-outline" size={48} color="#6C5CE7" />
                <Text style={styles.duplicateModalTitle}>
                  {duplicateNameModalPayload?.code === 'SUPPLIER_NAME_EXISTS' ? 'Duplicate supplier name:' : 'Duplicate customer name:'}
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
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <GradientText
            text="Suppliers for receipts and inbound, AI-recognized and collected."
            style={styles.headerTitle}
            containerStyle={styles.gradientTextContainer}
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Suppliers List */}
        <View style={styles.suppliersList}>
          {/* Add New Supplier Button */}
          {!showAddForm && !mergeMode && (
            <TouchableOpacity
              style={styles.supplierCard}
              onPress={() => setShowAddForm(true)}
            >
              <View style={styles.addSupplierRow}>
                <Ionicons name="add-circle" size={20} color="#6C5CE7" />
                <Text style={styles.addSupplierText}>Add Supplier</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Merge Mode Header */}
          {mergeMode && (
            <View style={styles.mergeHeaderCard}>
              <Text style={styles.mergeHeaderText}>
                Select suppliers to merge ({selectedSupplierIds.size} selected)
              </Text>
              <View style={styles.mergeHeaderButtons}>
                <TouchableOpacity
                  style={styles.mergeCancelButton}
                  onPress={handleCancelMerge}
                >
                  <Text style={styles.mergeCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.mergeConfirmButton,
                    selectedSupplierIds.size < 2 && styles.mergeConfirmButtonDisabled,
                  ]}
                  onPress={handleConfirmMerge}
                  disabled={selectedSupplierIds.size < 2}
                >
                  <Text style={styles.mergeConfirmButtonText}>Merge</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Add Supplier Form */}
          {showAddForm && (
            <View style={styles.formCard}>
              <TextInput
                style={styles.editInputInline}
                value={newName}
                onChangeText={setNewName}
                placeholder="Supplier name *"
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
                onPress={() => setNewIsCustomer(!newIsCustomer)}
              >
                <Ionicons
                  name={newIsCustomer ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={newIsCustomer ? '#6C5CE7' : '#95A5A6'}
                />
                <Text style={[styles.toggleButtonText, newIsCustomer && styles.toggleButtonTextActive]}>
                  Also a customer
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
                    setNewIsCustomer(false);
                  }}
                >
                  <Text style={styles.cancelButtonTextInline}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButtonInline}
                  onPress={handleAddSupplier}
                >
                  <Text style={styles.confirmButtonTextInline}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {list.map((item) => (
            <View key={`${item.source}-${item.id}`} style={styles.supplierCard}>
              {editingId === item.id && editingSource === item.source ? (
                // Edit Mode
                <View style={styles.editRow}>
                  <TextInput
                    ref={editNameInputRef}
                    style={styles.editInputInline}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Supplier name *"
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
                  {editingSource === 'supplier' && (
                    <TouchableOpacity style={styles.toggleButton} onPress={() => setEditIsCustomer(!editIsCustomer)}>
                      <Ionicons name={editIsCustomer ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={editIsCustomer ? '#6C5CE7' : '#95A5A6'} />
                      <Text style={[styles.toggleButtonText, editIsCustomer && styles.toggleButtonTextActive]}>Also a customer</Text>
                    </TouchableOpacity>
                  )}
                  {editingSource === 'customer' && (
                    <TouchableOpacity style={styles.toggleButton} onPress={() => setEditIsSupplier(!editIsSupplier)}>
                      <Ionicons name={editIsSupplier ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={editIsSupplier ? '#6C5CE7' : '#95A5A6'} />
                      <Text style={[styles.toggleButtonText, editIsSupplier && styles.toggleButtonTextActive]}>Also a supplier</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.editButtonsInline}>
                    <TouchableOpacity
                      style={styles.cancelButtonInline}
                      onPress={cancelEdit}
                    >
                      <Text style={styles.cancelButtonTextInline}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmButtonInline}
                      onPress={() => handleUpdate(item.id, item.source)}
                    >
                      <Text style={styles.confirmButtonTextInline}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                // Display Mode
                <TouchableOpacity
                  style={[
                    styles.supplierRow,
                    mergeMode && item.source === 'supplier' && selectedSupplierIds.has(item.id) && styles.supplierRowSelected,
                  ]}
                  onPress={() => {
                    if (mergeMode && item.source === 'supplier') toggleSupplierSelection(item.id);
                  }}
                  disabled={mergeMode && item.source !== 'supplier'}
                >
                  {mergeMode && item.source === 'supplier' && (
                    <View style={styles.checkboxContainer}>
                      {selectedSupplierIds.has(item.id) ? (
                        <Ionicons name="checkbox" size={24} color="#6C5CE7" />
                      ) : (
                        <Ionicons name="checkbox-outline" size={24} color="#BDC3C7" />
                      )}
                    </View>
                  )}
                  <View style={styles.supplierIndicator}>
                    <Ionicons name="storefront-outline" size={16} color="#6C5CE7" />
                  </View>
                  <View style={styles.supplierInfo}>
                    <View style={styles.supplierNameRow}>
                      <Text style={styles.supplierName} numberOfLines={1}>{item.name}</Text>
                      {item.source === 'supplier' && item.isCustomer && (
                        <View style={styles.linkedBadge}>
                          <Ionicons name="person-outline" size={12} color="#6C5CE7" />
                          <Text style={styles.linkedBadgeText}>Customer</Text>
                        </View>
                      )}
                      {item.source === 'customer' && (
                        <View style={styles.linkedBadge}>
                          <Ionicons name="person-outline" size={12} color="#6C5CE7" />
                          <Text style={styles.linkedBadgeText}>From customer list</Text>
                        </View>
                      )}
                    </View>
                    {(item.taxNumber || item.phone || item.address) && (
                      <View style={styles.supplierDetails}>
                        {item.taxNumber && <Text style={styles.supplierDetailText} numberOfLines={1}>Tax: {item.taxNumber}</Text>}
                        {item.phone && <Text style={styles.supplierDetailText} numberOfLines={1}>Phone: {item.phone}</Text>}
                        {item.address && <Text style={styles.supplierDetailText} numberOfLines={1}>Address: {item.address}</Text>}
                      </View>
                    )}
                  </View>
                  {'isAiRecognized' in item && item.isAiRecognized && (
                    <View style={styles.aiBadge}>
                      <Text style={styles.aiBadgeText}>AI</Text>
                    </View>
                  )}
                  {!mergeMode && (
                    <View style={styles.supplierActions}>
                      <TouchableOpacity style={styles.iconButton} onPress={() => startEdit(item)}>
                        <Ionicons name="create-outline" size={18} color="#6C5CE7" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconButton} onPress={() => handleDelete(item)}>
                        <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Merge Suppliers Button */}
        {!mergeMode && !showAddForm && (
          <TouchableOpacity
            style={styles.mergeSupplierCard}
            onPress={handleStartMerge}
          >
            <View style={styles.addSupplierRow}>
              <Ionicons name="git-merge-outline" size={20} color="#FF9500" />
              <Text style={styles.mergeSupplierText}>Merge Suppliers</Text>
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
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
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  suppliersList: {
    gap: 12,
  },
  supplierCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
  },
  mergeSupplierCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  supplierIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  supplierInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 4,
  },
  supplierDetails: {
    gap: 2,
  },
  supplierDetailText: {
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
  supplierActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingTop: 2,
  },
  addSupplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addSupplierText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  mergeSupplierText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF9500',
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
  mergeHeaderCard: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#6C5CE7',
  },
  mergeHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 12,
    textAlign: 'center',
  },
  mergeHeaderButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  mergeCancelButton: {
    flex: 1,
    backgroundColor: '#E9ECEF',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  mergeCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#636E72',
  },
  mergeConfirmButton: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  mergeConfirmButtonDisabled: {
    backgroundColor: '#BDC3C7',
    opacity: 0.5,
  },
  mergeConfirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  checkboxContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  supplierRowSelected: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 4,
  },
  supplierNameRow: {
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
  linkedInfo: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  linkedInfoText: {
    fontSize: 12,
    color: '#6C5CE7',
    fontStyle: 'italic',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerBottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    maxHeight: '70%',
  },
  pickerHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#BDC3C7',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
    flex: 1,
  },
  pickerCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pickerCloseText: {
    fontSize: 16,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  pickerScrollView: {
    maxHeight: 400,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#F8F9FA',
    minHeight: 48,
  },
  pickerOptionSelected: {
    backgroundColor: '#E8F4FD',
  },
  pickerOptionContent: {
    flex: 1,
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#2D3436',
    fontWeight: '500',
  },
  pickerOptionTextSelected: {
    color: '#6C5CE7',
    fontWeight: '600',
  },
  pickerOptionSubtext: {
    fontSize: 12,
    color: '#636E72',
    marginTop: 2,
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
