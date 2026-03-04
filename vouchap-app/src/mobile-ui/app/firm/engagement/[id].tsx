/**
 * Firm – Engagement（订单/项目）详情页
 *
 * 布局与 client 侧 tax-filing/project/[projectId]/index.tsx 对齐：
 *   - 顶行：返回 + 订单标题 + 客户名
 *   - 操作行：Tabs (Todos | Info) + 操作按钮
 *   - onboarding 态：展示 SKU WBS 预览 + 确认按钮
 *   - 已确认态：Todos tab（树形任务）+ Info tab（ProjectInfoTab）
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getOrderById,
  getProjectDetail,
  getProjectTodosTree,
  getProjectById,
  createProjectTodo,
  updateOrderStatus,
  getSkuById,
  getSkuItems,
  getClientDisplayName,
  type ProjectTodoNode,
  type FirmOrderById,
} from '@/lib/firm';
import { withWbsCodes, type ProjectSkuInfo, type TodoRow } from '@/components/ProjectSkuDetail';
import { ProjectDetailView, type ProjectDetailHeader } from '@/components/ProjectDetailView';
import { ProjectInfoTab, type ProjectInfoTabHandle } from '../../tax-filing/project/[projectId]/info';
import { useChatPanel } from '../../../contexts/ChatPanelContext';
import { showToast } from '@/lib/toast';

// ── 订单状态显示配置 ──
const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  onboarding:  { label: 'Onboarding',  color: '#6C5CE7', bg: '#EDE9FD' },
  collecting:  { label: 'Collecting',  color: '#0984E3', bg: '#E3F2FD' },
  processing:  { label: 'Processing',  color: '#B07D00', bg: '#FFF8E1' },
  reviewing:   { label: 'Reviewing',   color: '#C0392B', bg: '#FEECEB' },
  filing:      { label: 'Filing',      color: '#00838F', bg: '#E0F7FA' },
  completed:   { label: 'Completed',   color: '#00875A', bg: '#E3FCEF' },
  cancelled:   { label: 'Cancelled',   color: '#636E72', bg: '#F0F2F5' },
};

export default function FirmEngagementDetailScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const chatPanel = useChatPanel();

  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [order, setOrder]               = useState<FirmOrderById | null>(null);
  const [projectId, setProjectId]       = useState<string | null>(null);
  const [clientName, setClientName]     = useState('');
  const [clientSpaceId, setClientSpaceId] = useState<string>('');
  const [skuInfo, setSkuInfo]           = useState<ProjectSkuInfo | null>(null);
  const [skuTodos, setSkuTodos]         = useState<TodoRow[]>([]);
  const [tree, setTree]                 = useState<ProjectTodoNode[]>([]);
  const [confirming, setConfirming]     = useState(false);

  // Tabs
  const [activeTab, setActiveTab]       = useState<'todos' | 'info'>('todos');
  const [infoEditing, setInfoEditing]   = useState(false);
  const infoTabRef                      = useRef<ProjectInfoTabHandle>(null);

  const loadData = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const ord = await getOrderById(orderId);
      if (!ord) { setError('Order not found'); setLoading(false); return; }
      setOrder(ord);
      setClientSpaceId(ord.clientSpaceId ?? '');

      if (ord.status === 'onboarding') {
        const [sku, items, clientDisplayName] = await Promise.all([
          getSkuById(ord.skuId),
          getSkuItems(ord.skuId),
          ord.clientSpaceId && ord.firmSpaceId
            ? getClientDisplayName(ord.clientSpaceId, ord.firmSpaceId)
            : Promise.resolve(null),
        ]);
        setSkuInfo(sku ? { name: sku.name, description: sku.description, imageUrl: sku.imageUrl } : { name: 'Service' });
        setSkuTodos(withWbsCodes(items));
        setClientName(clientDisplayName ?? '');
      } else {
        const detail = await getProjectDetail(orderId);
        if (detail) {
          setClientName(detail.clientName ?? '');
          if (detail.project) {
            setProjectId(detail.project.id);
            const todosTree = await getProjectTodosTree(orderId);
            setTree(todosTree);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── 进入订单详情：自动打开 chat-to-log（tax-filing 类型），只显示 firm 提交的该 project 记录 ──
  const openPanel = chatPanel?.openPanel;
  const setType = chatPanel?.setType;
  const setAttachmentContext = chatPanel?.setAttachmentContext;
  const closePanel = chatPanel?.closePanel;

  useEffect(() => {
    if (!projectId || !openPanel || !setType || !setAttachmentContext) return;
    setType('tax-filing');
    setAttachmentContext({ projectId, clientSpaceId: clientSpaceId || undefined });
    openPanel('tax-filing');
    return () => {
      setAttachmentContext({});
      closePanel?.();
    };
  }, [projectId, clientSpaceId, openPanel, setType, setAttachmentContext, closePanel]);

  // 同步 infoEditing → child forwardRef
  useEffect(() => {
    if (activeTab === 'info' && infoEditing) {
      const timer = setTimeout(() => infoTabRef.current?.startEditing(), 80);
      return () => clearTimeout(timer);
    }
  }, [activeTab, infoEditing]);

  // ── 确认订单（onboarding → collecting） ──
  const handleConfirm = useCallback(async () => {
    if (!orderId) return;
    Alert.alert(
      'Confirm Order',
      'This will activate the project and create all tasks from the service template.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            setConfirming(true);
            try {
              const { error: err } = await updateOrderStatus(orderId, 'collecting');
              if (err) throw err;
              showToast('Order confirmed', 'success');
              await loadData();
            } catch {
              showToast('Failed to confirm order', 'error');
            } finally {
              setConfirming(false);
            }
          },
        },
      ]
    );
  }, [orderId, loadData]);

  // ── Loading / Error ──
  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }
  if (error || !order) {
    return (
      <View style={s.centered}>
        <Text style={s.errorText}>{error ?? 'Not found'}</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#6C5CE7" />
          <Text style={s.backBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOnboarding = order.status === 'onboarding';
  const statusCfg = ORDER_STATUS_CONFIG[order.status] ?? ORDER_STATUS_CONFIG.onboarding;
  const dateForYear = order.dueAt || order.createdAt;
  const taxYear = dateForYear ? new Date(dateForYear).getFullYear() : null;
  const detailHeader: ProjectDetailHeader = {
    title: order.skuName ?? 'Order',
    subtitle: clientName ? `Service for ${clientName}` : '',
    taxSeasonYear: taxYear,
    status: statusCfg,
  };

  return (
    <ProjectDetailView
      viewerRole="firm"
      header={detailHeader}
      isOnboarding={isOnboarding}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      infoEditing={infoEditing}
      setInfoEditing={setInfoEditing}
      infoTabRef={infoTabRef}
      tree={tree}
      orderId={orderId!}
      projectId={projectId}
      clientSpaceId={clientSpaceId}
      onRefresh={async () => {
        const todosTree = await getProjectTodosTree(orderId!);
        setTree(todosTree);
      }}
      createProjectTodo={createProjectTodo}
      skuInfo={skuInfo}
      skuTodos={skuTodos}
      onConfirmOrder={handleConfirm}
      confirming={confirming}
    />
  );
}

const s = StyleSheet.create({
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 15, color: '#636E72', marginBottom: 16 },
  backBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  backBtnText: { fontSize: 16, color: '#6C5CE7', fontWeight: '500' },
});
