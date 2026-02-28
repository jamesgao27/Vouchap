/**
 * Firm - Engagement 详情页（订单/项目详情）
 * 已确认：项目信息卡片 + 树形任务列表（aim.link 风格）；待确认：SKU 信息 + 扁平 WBS 表。
 */
import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getOrderById,
  getProjectDetail,
  getProjectTodosTree,
  createProjectTodo,
  getSkuById,
  getSkuItems,
} from '@/lib/firm';
import type { ProjectTodoNode } from '@/lib/firm';
import {
  ProjectSkuDetail,
  ProjectInfoCard,
  withWbsCodes,
  type ProjectSkuInfo,
  type TodoRow,
} from '@/components/ProjectSkuDetail';
import { ProjectTodoTreeView } from '@/components/ProjectTodoTreeView';

export default function FirmEngagementDetailScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ProjectSkuInfo | null>(null);
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [tree, setTree] = useState<ProjectTodoNode[]>([]);
  const [mode, setMode] = useState<'sku' | 'project'>('project');
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskCompleted, setTaskCompleted] = useState(0);
  const [clientName, setClientName] = useState<string | undefined>();
  const [projectStatus, setProjectStatus] = useState<string | undefined>();

  const loadProject = useCallback(async () => {
    if (!orderId) return;
    const detail = await getProjectDetail(orderId);
    if (!detail?.project) return;
    const newTree = await getProjectTodosTree(orderId);
    setInfo({
      name: detail.project.name,
      description: detail.project.description,
      imageUrl: detail.project.imageUrl,
    });
    setTree(newTree);
    setTaskTotal(detail.taskTotal);
    setTaskCompleted(detail.taskCompleted);
    setClientName(detail.clientName);
    setProjectStatus(detail.project.status);
  }, [orderId]);

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
          await loadProject();
          if (cancelled) return;
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
  }, [orderId, loadProject]);

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
      {mode === 'project' && (clientName != null || projectStatus != null || taskTotal > 0) && (
        <View style={styles.metaRow}>
          {clientName ? <Text style={styles.metaText}>{clientName}</Text> : null}
          {projectStatus ? <Text style={styles.metaText}> · {projectStatus}</Text> : null}
          <Text style={styles.metaText}> · {taskCompleted}/{taskTotal} tasks</Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {mode === 'project' ? (
          <>
            <ProjectInfoCard info={info} sectionTitle="Project info" />
            <View style={styles.treeSection}>
              <ProjectTodoTreeView
                orderId={orderId!}
                tree={tree}
                onRefresh={loadProject}
                createProjectTodo={createProjectTodo}
              />
            </View>
          </>
        ) : (
          <ProjectSkuDetail
            info={info}
            mode="sku"
            todos={todos}
            infoSectionTitle="Service info"
            todosSectionTitle="Work breakdown (WBS)"
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  treeSection: { marginTop: 24 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 20 },
  errorText: { fontSize: 16, color: '#636E72', marginBottom: 16 },
  headerBack: { padding: 16, paddingTop: 48 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, paddingBottom: 8 },
  metaText: { fontSize: 13, color: '#636E72' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  backBtnText: { fontSize: 16, color: '#6C5CE7', fontWeight: '500' },
});
