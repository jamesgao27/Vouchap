/**
 * 项目 - Todos 树形列表页（client 侧以 project 为主体的详情页）
 * 顶行用页面 Stack 顶栏（税季+项目名+Services from firm、设置）；展示区顶栏隐藏。状态/(n/m)/资料数跟随名称左对齐。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useChatPanel } from '../../../../contexts/ChatPanelContext';
import {
  getOrderById,
  getOrderHeaderForClient,
  getProjectTodosTree,
  getProjectById,
  createProjectTodo,
  type ProjectTodoNode,
} from '@/lib/firm';
import { ProjectInfoTab, type ProjectInfoTabHandle } from './info';
import { ProjectDetailView, type ProjectDetailHeader, ORDER_STATUS_CONFIG } from '@/components/ProjectDetailView';

export default function ProjectTodosScreen() {
  const { projectId, tab, edit } = useLocalSearchParams<{ projectId: string; tab?: string; edit?: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 由 project 解析出的 orderId，用于 API（getProjectTodosTree 等） */
  const [orderId, setOrderId] = useState<string | null>(null);
  const [header, setHeader] = useState<{ projectName: string; firmName: string; dueAt: string | null; createdAt: string | null; status: string } | null>(null);
  /** 当前订单的 client space_id，用于税表上传路径 tax-filing/{clientSpaceId}/... */
  const [clientSpaceId, setClientSpaceId] = useState<string>('');
  const [tree, setTree] = useState<ProjectTodoNode[]>([]);
  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const project = await getProjectById(projectId);
      if (!project) {
        setError('Project not found');
        setLoading(false);
        return;
      }
      const orderIdVal = project.orderId;
      setOrderId(orderIdVal);
      const order = await getOrderById(orderIdVal);
      if (!order) {
        setError('Order not found');
        setLoading(false);
        return;
      }
      setClientSpaceId(order.clientSpaceId ?? '');
      const headerData = await getOrderHeaderForClient(orderIdVal);
      setHeader(headerData ?? null);
      if (order.status === 'onboarding') {
        setTree([]);
        setLoading(false);
        return;
      }
      const todosTree = await getProjectTodosTree(orderIdVal);
      setTree(todosTree);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const chatPanel = useChatPanel();
  // 进入/切换报税项目时：仅更新附件上下文，不再自动打开/关闭 chat-to-log
  // 注意：依赖 setAttachmentContext（稳定的 useState setter）而非整个 chatPanel 对象，
  // 避免因 context value 对象每次渲染都重建而导致 effect 无限重触发（render 死循环）。
  const setAttachmentContext = chatPanel?.setAttachmentContext;
  useEffect(() => {
    if (!projectId || !setAttachmentContext) return;
    setAttachmentContext({ projectId, todoId: undefined });
    return () => {
      setAttachmentContext({});
    };
  }, [projectId, setAttachmentContext]);

  const [activeTab, setActiveTab] = useState<'todos' | 'info'>('todos');
  const [infoEditing, setInfoEditing] = useState(false);
  const infoTabRef = useRef<ProjectInfoTabHandle>(null);

  // 根据路由参数初始化：从列表卡片的 Edit 进入时，直接落在 Info 页签并进入编辑态
  useEffect(() => {
    if (tab === 'info') {
      setActiveTab('info');
      if (edit === '1' || edit === 'true') {
        setInfoEditing(true);
      }
    }
  }, [tab, edit]);

  // 当需要编辑且 Info Tab 已激活时，通知子组件进入编辑态
  useEffect(() => {
    if (activeTab === 'info' && infoEditing && infoTabRef.current) {
      infoTabRef.current.startEditing();
    }
  }, [activeTab, infoEditing]);

  const dateForYear = header?.dueAt || header?.createdAt || null;
  const taxSeasonYear = dateForYear ? new Date(dateForYear).getFullYear() : null;
  const detailHeader: ProjectDetailHeader = {
    title: header?.projectName ?? '',
    subtitle: header?.firmName ? `Services from ${header.firmName}` : '',
    taxSeasonYear: taxSeasonYear ?? null,
    status: ORDER_STATUS_CONFIG[header?.status ?? ''] ?? ORDER_STATUS_CONFIG.onboarding,
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#6C5CE7" />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ProjectDetailView
      viewerRole="client"
      header={detailHeader}
      isOnboarding={header?.status === 'onboarding'}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      infoEditing={infoEditing}
      setInfoEditing={setInfoEditing}
      infoTabRef={infoTabRef}
      showHeaderTabToggle
      tree={tree}
      orderId={orderId ?? ''}
      projectId={projectId}
      clientSpaceId={clientSpaceId}
      onRefresh={async () => {
        if (!orderId) return;
        const todosTree = await getProjectTodosTree(orderId);
        setTree(todosTree);
      }}
      createProjectTodo={createProjectTodo}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 20 },
  errorText: { fontSize: 16, color: '#636E72', marginBottom: 16 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  backBtnText: { fontSize: 16, color: '#6C5CE7', fontWeight: '500' },
});

