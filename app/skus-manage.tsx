import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSkus, createSku, updateSku, deleteSku } from '@/lib/skus';
import { Sku } from '@/types';

export default function SkusManageScreen() {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('件');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await getSkus();
      setSkus(data);
    } catch (e) {
      console.error('Load skus error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [])
  );

  const openAdd = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setUnit('件');
    setModalVisible(true);
  };

  const openEdit = (sku: Sku) => {
    setEditingId(sku.id);
    setName(sku.name);
    setCode(sku.code || '');
    setUnit(sku.unit || '件');
    setModalVisible(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateSku(editingId, { name: name.trim(), code: code.trim() || undefined, unit: unit.trim() || '件' });
      } else {
        await createSku({ name: name.trim(), code: code.trim() || undefined, unit: unit.trim() || '件' });
      }
      setModalVisible(false);
      load();
    } catch (e) {
      console.error('Save sku error:', e);
      Alert.alert('保存失败', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = (sku: Sku) => {
    Alert.alert('删除商品', `确定删除「${sku.name}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSku(sku.id);
            load();
          } catch (e) {
            Alert.alert('删除失败', (e as Error).message);
          }
        },
      },
    ]);
  };

  if (loading && skus.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={skus}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#6C5CE7']} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color="#BDC3C7" />
            <Text style={styles.emptyText}>暂无商品 SKU</Text>
            <Text style={styles.emptyHint}>入库/出库明细可关联标准商品</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity style={styles.rowContent} onPress={() => openEdit(item)} activeOpacity={0.7}>
              <Text style={styles.skuName}>{item.name}</Text>
              <View style={styles.rowMeta}>
                {item.code ? <Text style={styles.skuCode}>{item.code}</Text> : null}
                <Text style={styles.skuUnit}>{item.unit}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => remove(item)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={22} color="#E74C3C" />
            </TouchableOpacity>
          </View>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{editingId ? '编辑商品' : '新增商品'}</Text>
            <TextInput style={styles.input} placeholder="名称 *" placeholderTextColor="#95A5A6" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="编码（可选）" placeholderTextColor="#95A5A6" value={code} onChangeText={setCode} />
            <TextInput style={styles.input} placeholder="单位" placeholderTextColor="#95A5A6" value={unit} onChangeText={setUnit} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModalVisible(false)} disabled={saving}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={save} disabled={saving || !name.trim()}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>保存</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#636E72', marginTop: 12 },
  emptyHint: { fontSize: 14, color: '#95A5A6', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF' },
  rowContent: { flex: 1, padding: 16 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 12 },
  skuName: { fontSize: 16, fontWeight: '600', color: '#2D3436' },
  skuCode: { fontSize: 14, color: '#636E72' },
  skuUnit: { fontSize: 14, color: '#95A5A6' },
  deleteBtn: { padding: 16 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#6C5CE7', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#2D3436', marginBottom: 20 },
  input: { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#2D3436', marginBottom: 12, borderWidth: 1, borderColor: '#E9ECEF' },
  modalButtons: { flexDirection: 'row', marginTop: 8, gap: 12 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#E9ECEF' },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#636E72' },
  saveBtn: { backgroundColor: '#6C5CE7' },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
