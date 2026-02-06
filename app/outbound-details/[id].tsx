import { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getOutboundById, saveOutbound, deleteOutbound } from '@/lib/outbound';
import { Outbound, OutboundItem, VoucherStatus } from '@/types';
import { format } from 'date-fns';

export default function OutboundDetailsScreen() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const router = useRouter();
  const [outbound, setOutbound] = useState<Outbound | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedOutbound, setEditedOutbound] = useState<Outbound | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    loadOutbound();
  }, [id]);

  const loadOutbound = async () => {
    if (!id) return;
    try {
      const data = await getOutboundById(id);
      setOutbound(data);
      setEditedOutbound(data);
      if (isNew === 'true') setEditing(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to load outbound');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editedOutbound || !id) return;
    try {
      await saveOutbound({
        ...editedOutbound,
        id,
        status: 'confirmed' as VoucherStatus,
      });
      Alert.alert('Success', 'Outbound saved');
      setEditing(false);
      loadOutbound();
    } catch (error) {
      Alert.alert('Error', 'Failed to save');
      console.error(error);
    }
  };

  const handleDelete = () => {
    if (!id) return;
    Alert.alert(
      'Delete Outbound',
      'Are you sure you want to delete this outbound?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOutbound(id);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  const parseLocalDate = (dateString: string): Date => {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseLocalDate(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  const handleDateChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate && editedOutbound) {
      setEditedOutbound({ ...editedOutbound, date: selectedDate.toISOString().split('T')[0] });
    }
  };

  const calculateItemsTotal = (items: OutboundItem[]) => {
    return items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unitPrice ?? 0), 0);
  };

  const handleItemChange = (index: number, field: keyof OutboundItem, value: any) => {
    if (!editedOutbound) return;
    const newItems = [...editedOutbound.items];
    const item = { ...newItems[index], [field]: value } as OutboundItem;
    newItems[index] = item;
    const totalAmount = calculateItemsTotal(newItems);
    setEditedOutbound({ ...editedOutbound, items: newItems, totalAmount: totalAmount > 0 ? totalAmount : undefined });
  };

  const handleAddItem = () => {
    if (!editedOutbound) return;
    const newItem: OutboundItem = {
      outboundId: editedOutbound.id || '',
      productName: '',
      quantity: 1,
      unit: '件',
      unitPrice: undefined,
    };
    const newItems = [...editedOutbound.items, newItem];
    setEditedOutbound({ ...editedOutbound, items: newItems });
  };

  const handleDeleteItem = (index: number) => {
    if (!editedOutbound) return;
    const newItems = editedOutbound.items.filter((_, i) => i !== index);
    const totalAmount = calculateItemsTotal(newItems);
    setEditedOutbound({ ...editedOutbound, items: newItems, totalAmount: totalAmount > 0 ? totalAmount : undefined });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  if (!outbound) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Outbound not found</Text>
      </View>
    );
  }

  const current = editing ? (editedOutbound || outbound) : outbound;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Document No</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={editedOutbound?.documentNo ?? ''}
                onChangeText={(t) => setEditedOutbound(editedOutbound ? { ...editedOutbound, documentNo: t } : null)}
                placeholder="Optional"
              />
            ) : (
              <Text style={styles.value}>{current.documentNo || '—'}</Text>
            )}
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Customer</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={editedOutbound?.customerName ?? ''}
                onChangeText={(t) => setEditedOutbound(editedOutbound ? { ...editedOutbound, customerName: t } : null)}
                placeholder="Customer name"
              />
            ) : (
              <Text style={styles.value}>{current.customerName || '—'}</Text>
            )}
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date</Text>
            {editing ? (
              <TouchableOpacity style={styles.dateTouchable} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateText}>{editedOutbound?.date ? formatDate(editedOutbound.date) : 'Select date'}</Text>
                <Ionicons name="chevron-down" size={14} color="#6C5CE7" />
              </TouchableOpacity>
            ) : (
              <Text style={styles.value}>{formatDate(current.date)}</Text>
            )}
          </View>
          {(current.totalAmount != null && current.totalAmount > 0) && (
            <View style={styles.row}>
              <Text style={styles.label}>Total</Text>
              <Text style={styles.value}>
                {current.currency || ''} {Number(current.totalAmount).toFixed(2)}
              </Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <View style={[styles.statusBadge, { backgroundColor: current.status === 'confirmed' ? '#00B894' : '#FF9500' }]}>
              <Text style={styles.statusText}>{current.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.itemsSection}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Items</Text>
            {editing && (
              <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
                <Ionicons name="add-circle-outline" size={24} color="#6C5CE7" />
                <Text style={styles.addItemText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {current.items.length === 0 && !editing && (
            <Text style={styles.emptyItems}>No items</Text>
          )}
          {current.items.map((item, index) => (
            <View key={index} style={[styles.itemCard, index < current.items.length - 1 && styles.itemCardBorder]}>
              {editing && (
                <TouchableOpacity style={styles.deleteItemBtn} onPress={() => handleDeleteItem(index)}>
                  <Ionicons name="close-circle" size={20} color="#E74C3C" />
                </TouchableOpacity>
              )}
              {editing ? (
                <>
                  <TextInput
                    style={styles.itemNameInput}
                    value={item.productName}
                    onChangeText={(t) => handleItemChange(index, 'productName', t)}
                    placeholder="Product name"
                  />
                  <View style={styles.itemRow}>
                    <TextInput
                      style={styles.itemQtyInput}
                      value={String(item.quantity)}
                      onChangeText={(t) => handleItemChange(index, 'quantity', parseFloat(t) || 0)}
                      keyboardType="decimal-pad"
                      placeholder="Qty"
                    />
                    <TextInput
                      style={styles.itemUnitInput}
                      value={item.unit}
                      onChangeText={(t) => handleItemChange(index, 'unit', t)}
                      placeholder="Unit"
                    />
                    <TextInput
                      style={styles.itemPriceInput}
                      value={item.unitPrice != null ? String(item.unitPrice) : ''}
                      onChangeText={(t) => handleItemChange(index, 'unitPrice', t ? parseFloat(t) : undefined)}
                      keyboardType="decimal-pad"
                      placeholder="Unit price"
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.itemName}>{item.productName}</Text>
                  <View style={styles.itemRow}>
                    <Text style={styles.itemMeta}>{item.quantity} {item.unit}</Text>
                    {item.unitPrice != null && (
                      <Text style={styles.itemPrice}>{Number(item.unitPrice).toFixed(2)}</Text>
                    )}
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={editedOutbound?.date ? parseLocalDate(editedOutbound.date) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          onTouchCancel={() => Platform.OS === 'ios' && setShowDatePicker(false)}
        />
      )}
      {Platform.OS === 'ios' && showDatePicker && (
        <TouchableOpacity style={styles.datePickerClose} onPress={() => setShowDatePicker(false)}>
          <Text style={styles.datePickerCloseText}>Done</Text>
        </TouchableOpacity>
      )}

      {editing && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => { setEditing(false); setEditedOutbound(outbound); }}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmButton} onPress={handleSave}>
            <Ionicons name="checkmark" size={24} color="#fff" />
            <Text style={styles.confirmButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      )}

      {!editing && (
        <>
          <TouchableOpacity
            style={[styles.fab, styles.editFab]}
            onPress={() => { setEditedOutbound({ ...outbound }); setEditing(true); }}
          >
            <Ionicons name="create" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.fab, styles.deleteFab]} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={28} color="#fff" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E9ECEF' },
  row: { marginBottom: 12 },
  label: { fontSize: 12, color: '#636E72', marginBottom: 4, fontWeight: '600' },
  value: { fontSize: 16, color: '#2D3436' },
  input: { fontSize: 16, color: '#2D3436', borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingVertical: 8 },
  dateTouchable: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  dateText: { fontSize: 16, color: '#2D3436', marginRight: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  errorText: { fontSize: 16, color: '#636E72', textAlign: 'center', marginTop: 24 },
  itemsSection: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E9ECEF' },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2D3436' },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addItemText: { fontSize: 14, color: '#6C5CE7', fontWeight: '600' },
  emptyItems: { fontSize: 14, color: '#95A5A6', marginTop: 8 },
  itemCard: { paddingVertical: 12 },
  itemCardBorder: { borderBottomWidth: 1, borderBottomColor: '#E9ECEF' },
  deleteItemBtn: { position: 'absolute', right: 0, top: 8, zIndex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#2D3436', marginBottom: 4 },
  itemNameInput: { fontSize: 16, color: '#2D3436', borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingVertical: 6, marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemMeta: { fontSize: 14, color: '#636E72' },
  itemPrice: { fontSize: 14, fontWeight: '600', color: '#2D3436', marginLeft: 'auto' },
  itemQtyInput: { width: 70, fontSize: 14, borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingVertical: 4 },
  itemUnitInput: { width: 56, fontSize: 14, borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingVertical: 4 },
  itemPriceInput: { flex: 1, fontSize: 14, borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingVertical: 4 },
  bottomBar: { flexDirection: 'row', padding: 16, gap: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E9ECEF' },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F0F0F0', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#636E72' },
  confirmButton: { flex: 1, flexDirection: 'row', paddingVertical: 14, borderRadius: 12, backgroundColor: '#6C5CE7', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  fab: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  editFab: { bottom: 80, backgroundColor: '#6C5CE7' },
  deleteFab: { bottom: 16, backgroundColor: '#E74C3C' },
  datePickerClose: { padding: 16, alignItems: 'flex-end', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E9ECEF' },
  datePickerCloseText: { fontSize: 16, color: '#6C5CE7', fontWeight: '600' },
});
