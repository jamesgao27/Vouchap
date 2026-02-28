/**
 * Firm - SKU 详情页（与项目详情同一套 UI）
 * 路由：/firm/sku/[skuId]。展示 SKU 信息 + sku_items 树形 WBS 表格。
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSkuById, getSkuItems } from '@/lib/firm';
import {
  ProjectSkuDetail,
  withWbsCodes,
  type ProjectSkuInfo,
  type TodoRow,
} from '@/components/ProjectSkuDetail';

export default function FirmSkuDetailScreen() {
  const { skuId } = useLocalSearchParams<{ skuId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ProjectSkuInfo | null>(null);
  const [todos, setTodos] = useState<TodoRow[]>([]);

  useEffect(() => {
    if (!skuId) {
      setError('Missing SKU ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [sku, items] = await Promise.all([
          getSkuById(skuId),
          getSkuItems(skuId),
        ]);
        if (cancelled) return;
        if (!sku) {
          setError('SKU not found');
          setLoading(false);
          return;
        }
        setInfo({ name: sku.name, description: sku.description, imageUrl: sku.imageUrl });
        setTodos(withWbsCodes(items));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [skuId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }
  if (error || !info) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Not found'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#6C5CE7" />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.headerBack}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={24} color="#2D3436" />
      </TouchableOpacity>
      <ProjectSkuDetail
        info={info}
        mode="sku"
        todos={todos}
        infoSectionTitle="Service info"
        todosSectionTitle="Work breakdown (WBS)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 20 },
  errorText: { fontSize: 16, color: '#636E72', marginBottom: 16 },
  headerBack: { padding: 16, paddingTop: 48 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  backBtnText: { fontSize: 16, color: '#6C5CE7', fontWeight: '500' },
});
