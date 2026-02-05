import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getWarehouses,
  getLocationsByWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  createLocation,
  updateLocation,
  deleteLocation,
} from '@/lib/warehouse';
import { Warehouse, Location } from '@/types';

export default function WarehouseManageScreen() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locationsByWh, setLocationsByWh] = useState<Record<string, Location[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [whModal, setWhModal] = useState<'add' | 'edit' | null>(null);
  const [locModal, setLocModal] = useState<{ whId: string } | null>(null);
  const [whId, setWhId] = useState<string | null>(null);
  const [whName, setWhName] = useState('');
  const [whCode, setWhCode] = useState('');
  const [whAddress, setWhAddress] = useState('');
  const [locName, setLocName] = useState('');
  const [locCode, setLocCode] = useState('');
  const [locEditId, setLocEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const list = await getWarehouses();
      setWarehouses(list);
      const map: Record<string, Location[]> = {};
      for (const w of list) {
        map[w.id] = await getLocationsByWarehouse(w.id);
      }
      setLocationsByWh(map);
    } catch (e) {
      console.error('Load warehouse error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  const openAddWh = () => {
    setWhId(null);
    setWhName('');
    setWhCode('');
    setWhAddress('');
    setWhModal('add');
  };

  const openEditWh = (w: Warehouse) => {
    setWhId(w.id);
    setWhName(w.name);
    setWhCode(w.code || '');
    setWhAddress(w.address || '');
    setWhModal('edit');
  };

  const saveWh = async () => {
    if (!whName.trim()) return;
    setSaving(true);
    try {
      if (whId) {
        await updateWarehouse(whId, { name: whName.trim(), code: whCode.trim() || undefined, address: whAddress.trim() || undefined });
      } else {
        await createWarehouse({ name: whName.trim(), code: whCode.trim() || undefined, address: whAddress.trim() || undefined });
      }
      setWhModal(null);
      load();
    } catch (e) {
      Alert.alert('保存失败', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeWh = (w: Warehouse) => {
    Alert.alert('删除仓库', `确定删除「${w.name}」？其下仓位将一并删除。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { await deleteWarehouse(w.id); load(); } },
    ]);
  };

  const openAddLoc = (warehouseId: string) => {
    setLocModal({ whId: warehouseId });
    setLocEditId(null);
    setLocName('');
    setLocCode('');
  };

  const openEditLoc = (warehouseId: string, loc: Location) => {
    setLocModal({ whId: warehouseId });
    setLocEditId(loc.id);
    setLocName(loc.name);
    setLocCode(loc.code || '');
  };

  const saveLoc = async () => {
    if (!locModal?.whId || !locName.trim()) return;
    setSaving(true);
    try {
      if (locEditId) {
        await updateLocation(locEditId, { name: locName.trim(), code: locCode.trim() || undefined });
      } else {
        await createLocation({ warehouseId: locModal.whId, name: locName.trim(), code: locCode.trim() || undefined });
      }
      setLocModal(null);
      load();
    } catch (e) {
      Alert.alert('保存失败', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeLoc = (loc: Location) => {
    Alert.alert('删除仓位', `确定删除「${loc.name}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { await deleteLocation(loc.id); load(); } },
    ]);
  };

  if (loading && warehouses.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#6C5CE7']} />}
    >
      <TouchableOpacity style={styles.addCard} onPress={openAddWh}>
        <Ionicons name="add-circle-outline" size={22} color="#6C5CE7" />
        <Text style={styles.addCardText}>新增仓库</Text>
      </TouchableOpacity>

      {warehouses.map((w) => (
        <View key={w.id} style={styles.warehouseCard}>
          <TouchableOpacity
            style={styles.warehouseRow}
            onPress={() => setExpandedId(expandedId === w.id ? null : w.id)}
            activeOpacity={0.7}
          >
            <Ionicons name={expandedId === w.id ? 'chevron-down' : 'chevron-forward'} size={20} color="#95A5A6" />
            <Text style={styles.warehouseName}>{w.name}</Text>
            {w.code ? <Text style={styles.warehouseCode}>{w.code}</Text> : null}
            <TouchableOpacity onPress={() => openEditWh(w)} style={styles.iconBtn}>
              <Ionicons name="create-outline" size={18} color="#6C5CE7" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeWh(w)} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={18} color="#E74C3C" />
            </TouchableOpacity>
          </TouchableOpacity>

          {expandedId === w.id && (
            <View style={styles.locations}>
              <TouchableOpacity style={styles.addLocRow} onPress={() => openAddLoc(w.id)}>
                <Ionicons name="add" size={18} color="#6C5CE7" />
                <Text style={styles.addLocText}>新增仓位</Text>
              </TouchableOpacity>
              {(locationsByWh[w.id] || []).map((loc) => (
                <View key={loc.id} style={styles.locRow}>
                  <Text style={styles.locName}>{loc.name}</Text>
                  {loc.code ? <Text style={styles.locCode}>{loc.code}</Text> : null}
                  <TouchableOpacity onPress={() => openEditLoc(w.id, loc)} style={styles.iconBtn}>
                    <Ionicons name="create-outline" size={16} color="#6C5CE7" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeLoc(loc)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={16} color="#E74C3C" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}

      <Modal visible={whModal !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{whModal === 'add' ? '新增仓库' : '编辑仓库'}</Text>
            <TextInput style={styles.input} placeholder="仓库名称 *" placeholderTextColor="#95A5A6" value={whName} onChangeText={setWhName} />
            <TextInput style={styles.input} placeholder="编码（可选）" placeholderTextColor="#95A5A6" value={whCode} onChangeText={setWhCode} />
            <TextInput style={[styles.input, styles.inputArea]} placeholder="地址（可选）" placeholderTextColor="#95A5A6" value={whAddress} onChangeText={setWhAddress} multiline />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setWhModal(null)} disabled={saving}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={saveWh} disabled={saving || !whName.trim()}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>保存</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={locModal !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{locEditId ? '编辑仓位' : '新增仓位'}</Text>
            <TextInput style={styles.input} placeholder="仓位名称 *" placeholderTextColor="#95A5A6" value={locName} onChangeText={setLocName} />
            <TextInput style={styles.input} placeholder="编码（可选）" placeholderTextColor="#95A5A6" value={locCode} onChangeText={setLocCode} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setLocModal(null)} disabled={saving}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={saveLoc} disabled={saving || !locName.trim()}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>保存</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  addCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E9ECEF' },
  addCardText: { fontSize: 16, fontWeight: '600', color: '#6C5CE7' },
  warehouseCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  warehouseRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8 },
  warehouseName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#2D3436' },
  warehouseCode: { fontSize: 14, color: '#636E72' },
  iconBtn: { padding: 4 },
  locations: { paddingHorizontal: 16, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  addLocRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  addLocText: { fontSize: 14, fontWeight: '500', color: '#6C5CE7' },
  locRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 16, gap: 8 },
  locName: { flex: 1, fontSize: 15, color: '#2D3436' },
  locCode: { fontSize: 13, color: '#95A5A6' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#2D3436', marginBottom: 20 },
  input: { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#2D3436', marginBottom: 12, borderWidth: 1, borderColor: '#E9ECEF' },
  inputArea: { minHeight: 60 },
  modalButtons: { flexDirection: 'row', marginTop: 8, gap: 12 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#E9ECEF' },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#636E72' },
  saveBtn: { backgroundColor: '#6C5CE7' },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
