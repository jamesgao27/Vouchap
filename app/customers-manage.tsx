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
  createCustomer,
  updateCustomer,
  deleteCustomer,
  mergeCustomer,
} from '@/lib/customers';
import { updateSupplier, mergeSupplier } from '@/lib/suppliers';
import { getCustomerListForManage, type CustomerListItem } from '@/lib/customer-supplier-list';
import { GradientText } from '@/lib/GradientText';

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
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <GradientText
            text="Customers for invoices and outbound, Keep collecting and connecting."
            style={styles.headerTitle}
            containerStyle={styles.gradientTextContainer}
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Customers List */}
        <View style={styles.customersList}>
          {/* Add New Customer Button */}
          {!showAddForm && (
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

          {list.map((item) => (
            <View key={`${item.source}-${item.id}`} style={styles.customerCard}>
              {editingId === item.id && editingSource === item.source ? (
                // Edit Mode
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
                    <TouchableOpacity
                      style={styles.toggleButton}
                      onPress={() => setEditIsSupplier(!editIsSupplier)}
                    >
                      <Ionicons name={editIsSupplier ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={editIsSupplier ? '#6C5CE7' : '#95A5A6'} />
                      <Text style={[styles.toggleButtonText, editIsSupplier && styles.toggleButtonTextActive]}>Also a supplier</Text>
                    </TouchableOpacity>
                  )}
                  {editingSource === 'supplier' && (
                    <TouchableOpacity
                      style={styles.toggleButton}
                      onPress={() => setEditIsCustomer(!editIsCustomer)}
                    >
                      <Ionicons name={editIsCustomer ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={editIsCustomer ? '#6C5CE7' : '#95A5A6'} />
                      <Text style={[styles.toggleButtonText, editIsCustomer && styles.toggleButtonTextActive]}>Also a customer</Text>
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
                <View style={styles.customerRow}>
                  <View style={styles.customerIndicator}>
                    <Ionicons name="person-outline" size={16} color="#6C5CE7" />
                  </View>
                  <View style={styles.customerInfo}>
                    <View style={styles.customerNameRow}>
                      <Text style={styles.customerName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.source === 'customer' && item.isSupplier && (
                        <View style={styles.linkedBadge}>
                          <Ionicons name="storefront-outline" size={12} color="#6C5CE7" />
                          <Text style={styles.linkedBadgeText}>Supplier</Text>
                        </View>
                      )}
                    </View>
                    {(item.taxNumber || item.phone || item.address) && (
                      <View style={styles.customerDetails}>
                        {item.taxNumber && (
                          <Text style={styles.customerDetailText} numberOfLines={1}>Tax: {item.taxNumber}</Text>
                        )}
                        {item.phone && (
                          <Text style={styles.customerDetailText} numberOfLines={1}>Phone: {item.phone}</Text>
                        )}
                        {item.address && (
                          <Text style={styles.customerDetailText} numberOfLines={1}>Address: {item.address}</Text>
                        )}
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
          ))}
        </View>
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
  customersList: {
    gap: 12,
  },
  customerCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
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
