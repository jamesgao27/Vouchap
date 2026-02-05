import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAllInbound } from '@/lib/inbound';
import { Inbound } from '@/types';
import { format } from 'date-fns';

export default function InboundScreen() {
  const router = useRouter();
  const [list, setList] = useState<Inbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await getAllInbound();
      setList(data);
    } catch (e) {
      console.error('Load inbound error:', e);
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

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading && list.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id!}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6C5CE7']} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="arrow-down-circle-outline" size={48} color="#BDC3C7" />
            <Text style={styles.emptyText}>暂无入库单</Text>
            <Text style={styles.emptyHint}>采购端入库在此查看</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => {}}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.docNo}>{item.documentNo || '入库单'}</Text>
              <Text style={styles.date}>{item.date ? format(new Date(item.date), 'yyyy-MM-dd') : ''}</Text>
              {item.supplierName ? <Text style={styles.supplier}>{item.supplierName}</Text> : null}
            </View>
            {item.totalAmount != null && (
              <Text style={styles.amount}>¥{Number(item.totalAmount).toFixed(2)}</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#636E72', marginTop: 12 },
  emptyHint: { fontSize: 14, color: '#95A5A6', marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  rowLeft: { flex: 1 },
  docNo: { fontSize: 16, fontWeight: '600', color: '#2D3436' },
  date: { fontSize: 14, color: '#636E72', marginTop: 4 },
  supplier: { fontSize: 14, color: '#636E72', marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '600', color: '#2D3436' },
});
