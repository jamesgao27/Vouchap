/**
 * Client - 订单/项目详情（与 Firm 项目详情同一套 UI）
 * 路由：/tax-filing/order/[orderId]。已确认展示 project + checklist；待确认展示 SKU + WBS 预览。
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getOrderById,
  getProjectByOrderId,
  getOrderProjects,
  getSkuById,
  getSkuItems,
} from '@/lib/firm';
import {
  ProjectSkuDetail,
  withWbsCodes,
  projectTodosWithWbs,
  type ProjectSkuInfo,
  type TodoRow,
} from '@/components/ProjectSkuDetail';

export default function TaxFilingOrderDetailScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ProjectSkuInfo | null>(null);
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [mode, setMode] = useState<'sku' | 'project'>('project');

  useEffect(() => {
    if (!orderId) {
      setError('Missing order ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const order = await getOrderById(orderId);
        if (cancelled) return;
        if (!order) {
          setError('Order not found');
          setLoading(false);
          return;
        }
        const isConfirmed = order.status !== 'pending';
        if (isConfirmed) {
          const [project, projectTodos] = await Promise.all([
            getProjectByOrderId(order.id),
            getOrderProjects(order.id),
          ]);
          if (cancelled) return;
          setInfo(project ? { name: project.name, description: project.description, imageUrl: project.imageUrl } : { name: 'Project' });
          setTodos(projectTodosWithWbs(projectTodos));
          setMode('project');
        } else {
          const [sku, items] = await Promise.all([
            getSkuById(order.skuId),
            getSkuItems(order.skuId),
          ]);
          if (cancelled) return;
          setInfo(sku ? { name: sku.name, description: sku.description, imageUrl: sku.imageUrl } : { name: 'Service' });
          setTodos(withWbsCodes(items));
          setMode('sku');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

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
        mode={mode}
        todos={todos}
        infoSectionTitle="Project info"
        todosSectionTitle={mode === 'sku' ? 'Work breakdown (WBS)' : 'Checklist'}
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
