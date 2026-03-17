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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getOrderById,
  getProjectDetail,
  getProjectTodosTree,
  getProjectById,
  createProjectTodo,
  getSkuById,
  getSkuItems,
  getClientDisplayName,
  updateOrderStatus,
  confirmOrderAndCreateProjectTodos,
  type ProjectTodoNode,
  type FirmOrderById,
} from '@/lib/firm';
import type { FirmSkuItem } from '@/types';
import { withWbsCodes, type ProjectSkuInfo, type TodoRow } from '@/components/ProjectSkuDetail';
import { ProjectDetailView, type ProjectDetailHeader } from '@/components/ProjectDetailView';
import { ProjectInfoTab, type ProjectInfoTabHandle } from '../../tax-filing/project/[projectId]/info';
import { useChatPanel } from '../../../contexts/ChatPanelContext';
import { showToast } from '@/lib/toast';

// ── 订单状态：与 firm.orders.status（4 态）及类型 FirmOrderStatus 一致 ──
const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  onboarding:  { label: 'Onboarding',  color: '#E67E22', bg: '#FFF3E0' },
  processing:  { label: 'Processing',  color: '#0288D1', bg: '#E1F5FE' },
  completed:   { label: 'Completed',   color: '#00875A', bg: '#E3FCEF' },
  cancelled:   { label: 'Cancelled',   color: '#636E72', bg: '#F0F2F5' },
};

/** Status where Firm can show Terminate + Complete (active, not onboarding/cancelled/completed). */
const ACTIVE_ORDER_STATUSES = ['processing'] as const;

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
  const [skuItems, setSkuItems]         = useState<FirmSkuItem[]>([]);
  const [tree, setTree]                 = useState<ProjectTodoNode[]>([]);
  const [skuDetailForInfo, setSkuDetailForInfo] = useState<{ taxCountry?: string | null; taxScenario?: string | null } | null>(null);

  // Tabs
  const [activeTab, setActiveTab]       = useState<'todos' | 'info'>('todos');
  const [infoEditing, setInfoEditing]   = useState(false);
  const infoTabRef                      = useRef<ProjectInfoTabHandle>(null);
  // Onboarding: Terminal / Start
  const [rejectLoading, setRejectLoading] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const ord = await getOrderById(orderId);
      if (!ord) { setError('Engagement not found'); setLoading(false); return; }
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
        setSkuDetailForInfo(sku ? { taxCountry: sku.taxCountry ?? null, taxScenario: sku.taxScenario ?? null } : null);
        setSkuTodos(withWbsCodes(items));
        setSkuItems(items);
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

  const handleTerminal = useCallback(async () => {
    if (!orderId) return;
    setRejectLoading(true);
    try {
      const { error } = await updateOrderStatus(orderId, 'cancelled');
      if (error) return;
      await loadData();
    } finally {
      setRejectLoading(false);
    }
  }, [orderId, loadData]);

  const handleStart = useCallback(async () => {
    if (!orderId) return;
    setAcceptLoading(true);
    try {
      const { error } = await confirmOrderAndCreateProjectTodos(orderId);
      if (error) return;
      await loadData();
    } finally {
      setAcceptLoading(false);
    }
  }, [orderId, loadData]);

  const [abortLoading, setAbortLoading] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const handleAbort = useCallback(async () => {
    if (!orderId) return;
    setAbortLoading(true);
    try {
      const { error } = await updateOrderStatus(orderId, 'cancelled');
      if (error) return;
      await loadData();
    } finally {
      setAbortLoading(false);
    }
  }, [orderId, loadData]);
  const handleComplete = useCallback(async () => {
    if (!orderId) return;
    setCompleteLoading(true);
    try {
      const { error } = await updateOrderStatus(orderId, 'completed');
      if (error) {
        showToast(error.message, 'error');
        return;
      }
      await loadData();
    } finally {
      setCompleteLoading(false);
    }
  }, [orderId, loadData]);
  const handleRestart = useCallback(async () => {
    if (!orderId) return;
    setRestartLoading(true);
    try {
      const nextStatus = projectId ? 'processing' : 'onboarding';
      const { error } = await updateOrderStatus(orderId, nextStatus);
      if (error) return;
      await loadData();
    } finally {
      setRestartLoading(false);
    }
  }, [orderId, projectId, loadData]);

  // ── 进入订单详情：自动打开 chat-to-log（tax-filing 类型），onboarding 与已确认态统一体验 ──
  const openPanel = chatPanel?.openPanel;
  const setType = chatPanel?.setType;
  const setAttachmentContext = chatPanel?.setAttachmentContext;
  const closePanel = chatPanel?.closePanel;

  useEffect(() => {
    if (!orderId || !openPanel || !setType || !setAttachmentContext) return;
    setType('tax-filing');
    setAttachmentContext({
      ...(projectId ? { projectId } : {}),
      clientSpaceId: clientSpaceId || undefined,
    });
    openPanel('tax-filing');
    return () => {
      setAttachmentContext({});
      closePanel?.();
    };
  }, [orderId, projectId, clientSpaceId, openPanel, setType, setAttachmentContext, closePanel]);

  // 同步 infoEditing → child forwardRef
  useEffect(() => {
    if (activeTab === 'info' && infoEditing) {
      const timer = setTimeout(() => infoTabRef.current?.startEditing(), 80);
      return () => clearTimeout(timer);
    }
  }, [activeTab, infoEditing]);

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
  const explicitTaxSeasonYear = (order as any).taxSeasonYear ?? null;
  const taxYear = explicitTaxSeasonYear != null
    ? explicitTaxSeasonYear
    : (dateForYear ? new Date(dateForYear).getFullYear() : null);
  const detailHeader: ProjectDetailHeader = {
    title: order.skuName ?? 'Engagement',
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
      onReject={isOnboarding ? handleTerminal : undefined}
      rejectLoading={rejectLoading}
      onAcceptAndStart={isOnboarding ? handleStart : undefined}
      acceptAndStartLoading={acceptLoading}
      headerRejectLabel="Terminate"
      headerAcceptLabel="Start service"
      orderStatus={order.status}
      onAbort={ACTIVE_ORDER_STATUSES.includes(order.status) ? handleAbort : undefined}
      abortLoading={abortLoading}
      onComplete={ACTIVE_ORDER_STATUSES.includes(order.status) ? handleComplete : undefined}
      completeLoading={completeLoading}
      onRestart={order.status === 'cancelled' ? handleRestart : undefined}
      restartLoading={restartLoading}
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
      skuItems={skuItems}
      skuDetailForInfo={skuDetailForInfo}
    />
  );
}

const s = StyleSheet.create({
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 15, color: '#636E72', marginBottom: 16 },
  backBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  backBtnText: { fontSize: 16, color: '#6C5CE7', fontWeight: '500' },
});
