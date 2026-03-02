/**
 * 项目 - Todos 树形列表页（client 侧以 project 为主体的详情页）
 * 顶行用页面 Stack 顶栏（税季+项目名+Services from firm、设置）；展示区顶栏隐藏。状态/(n/m)/资料数跟随名称左对齐。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  TextInput,
  Pressable,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useChatPanel } from '../../../../contexts/ChatPanelContext';
import {
  getOrderById,
  getOrderHeaderForClient,
  getProjectTodosTree,
  getProjectById,
  getAttachmentsByProjectTodoIds,
  createProjectTodo,
  updateProjectTodo,
  createProjectTodoAttachment,
  deleteProjectTodoAttachment,
  type ProjectTodoNode,
  type ProjectTodoReceiptSummary,
} from '@/lib/firm';
import { TODO_STATUS_LABEL, TODO_STATUS_COLOR } from '@/lib/constants/project-todo-status';
import { uploadTaxFilingFile } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';

/** 税季标签颜色（与列表页一致） */
const TAX_SEASON_COLORS = [
  '#6C5CE7', '#E17055', '#00B894', '#0984E3', '#FDCB6E',
  '#E84393', '#00CEC9', '#74B9FF', '#A29BFE', '#FD79A8',
];
function getTaxSeasonColor(year: number): string {
  return TAX_SEASON_COLORS[Math.abs(year) % 10] ?? TAX_SEASON_COLORS[0];
}

/** Stack 顶栏标题：税季 pill 占两行凸显；项目名与 Services from 左端对齐 */
function OrderTodosHeaderTitle({
  projectName,
  firmName,
  taxSeasonYear,
}: {
  projectName: string;
  firmName: string;
  taxSeasonYear: number | null;
}) {
  return (
    <View style={headerStyles.wrap}>
      {taxSeasonYear != null ? (
        <View style={[headerStyles.taxPillWrap, { backgroundColor: getTaxSeasonColor(taxSeasonYear) }]}>
          <Text style={headerStyles.taxPillText}>{taxSeasonYear}</Text>
        </View>
      ) : null}
      <View style={headerStyles.textCol}>
        <Text style={headerStyles.title} numberOfLines={1} ellipsizeMode="tail">{projectName}</Text>
        {firmName ? (
          <Text style={headerStyles.firmName} numberOfLines={1} ellipsizeMode="tail">
            Services from {firmName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
const headerStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 16,
    overflow: 'visible',
    gap: 8,
  },
  taxPillWrap: {
    minWidth: 60,
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taxPillText: { fontSize: 17, color: '#FFF', fontWeight: '700', lineHeight: 22 },
  textCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: '#2D3436', lineHeight: 20 },
  firmName: { fontSize: 12, color: '#95A5A6', lineHeight: 16, marginTop: 4 },
});

/** 状态优先级：越前越优先（收起时显示“最差”的那个） */
const STATUS_PRIORITY = ['action_required', 'missing_info', 'under_review', 'flagged', 'success'] as const;

function worstStatus(a: string, b: string): string {
  const ia = STATUS_PRIORITY.indexOf(a as any);
  const ib = STATUS_PRIORITY.indexOf(b as any);
  if (ia === -1) return b;
  if (ib === -1) return a;
  return ia <= ib ? a : b;
}

function collectTaskIds(nodes: ProjectTodoNode[]): string[] {
  const ids: string[] = [];
  function walk(list: ProjectTodoNode[]) {
    list.forEach((n) => {
      if (n.itemKind === 'task') ids.push(n.id);
      walk(n.children);
    });
  }
  walk(nodes);
  return ids;
}

/** 为整棵树预计算：每节点的 task 总数、success 数、收起时显示的有效状态（子集最优先） */
function useNodeStats(nodes: ProjectTodoNode[]) {
  return useMemo(() => {
    const taskTotal: Record<string, number> = {};
    const taskSuccess: Record<string, number> = {};
    const effectiveStatus: Record<string, string> = {};

    function walk(list: ProjectTodoNode[]): { total: number; success: number; status: string } {
      let total = 0;
      let success = 0;
      let status: string = 'success';
      list.forEach((n) => {
        if (n.itemKind === 'task') {
          taskTotal[n.id] = 1;
          effectiveStatus[n.id] = n.status;
          if (n.status === 'canceled') {
            taskSuccess[n.id] = 0;
            // 已终止 task 不参与父级统计，状态不传导
          } else {
            total += 1;
            if (n.status === 'success') success += 1;
            status = worstStatus(status, n.status);
            taskSuccess[n.id] = n.status === 'success' ? 1 : 0;
          }
        } else {
          const sub = walk(n.children);
          total += sub.total;
          success += sub.success;
          status = worstStatus(status, sub.status);
          taskTotal[n.id] = sub.total;
          taskSuccess[n.id] = sub.success;
          effectiveStatus[n.id] = sub.status;
        }
      });
      return { total, success, status };
    }
    walk(nodes);

    return { taskTotal, taskSuccess, effectiveStatus };
  }, [nodes]);
}

export default function ProjectTodosScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 由 project 解析出的 orderId，用于 API（getProjectTodosTree 等） */
  const [orderId, setOrderId] = useState<string | null>(null);
  const [header, setHeader] = useState<{ projectName: string; firmName: string; dueAt: string | null; createdAt: string | null; status: string } | null>(null);
  /** 当前订单的 client space_id，用于税表上传路径 tax-filing/{clientSpaceId}/... */
  const [clientSpaceId, setClientSpaceId] = useState<string>('');
  const [tree, setTree] = useState<ProjectTodoNode[]>([]);
  /** 默认全部展开；点击切换展开/收起 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** task 展开时显示关联文件；key = todoId，value = 是否展开 */
  const [taskFilesExpanded, setTaskFilesExpanded] = useState<Set<string>>(new Set());
  /** 每个 task 关联的文件列表（receipt 摘要），点击行进入 receipt 详情 */
  const [taskFilesMap, setTaskFilesMap] = useState<Record<string, ProjectTodoReceiptSummary[]>>({});

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
      const taskIds = collectTaskIds(todosTree);
      const filesMap = await getAttachmentsByProjectTodoIds(taskIds);
      setTaskFilesMap(filesMap);
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
  useEffect(() => {
    if (!projectId || !chatPanel) return;
    chatPanel.setAttachmentContext({ projectId, todoId: undefined });
    return () => {
      chatPanel.setAttachmentContext({});
    };
  }, [projectId, chatPanel]);

  const nodeStats = useNodeStats(tree);

  /** (n/m) 与文件计数合并为一列，保证两类指示器同列对齐 */
  const PROGRESS_FILES_COL_WIDTH = 52;

  /** 根据整棵树中最长「名称」估算标题区宽度 */
  const maxLeftBlockWidth = useMemo(() => {
    let maxW = 0;
    function walk(nodes: ProjectTodoNode[], d: number) {
      nodes.forEach((n) => {
        const indent = 12 + d * 14;
        const titleLen = (n.title ?? '').length;
        const titleApprox = titleLen * 8;
        const w = indent + 28 + 36 + titleApprox + 16;
        if (w > maxW) maxW = w;
        walk(n.children, d + 1);
      });
    }
    walk(tree, 0);
    const minW = 160;
    const cap = Math.floor(Dimensions.get('window').width * 0.82 - 32) - PROGRESS_FILES_COL_WIDTH;
    return Math.min(Math.max(maxW, minW), cap);
  }, [tree]);

  const [rowIdShowingAdd, setRowIdShowingAdd] = useState<string | null>(null);
  const [addIconHighlightedRowId, setAddIconHighlightedRowId] = useState<string | null>(null);
  const [pendingParentId, setPendingParentId] = useState<string | null>(null);
  const hideAddTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (id === pendingParentId) setPendingParentId(null);
      }
      return next;
    });
  }, [pendingParentId]);

  const toggleTaskFiles = useCallback((id: string) => {
    setTaskFilesExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onStartAddChild = useCallback((parentId: string) => {
    if (hideAddTimeoutRef.current) {
      clearTimeout(hideAddTimeoutRef.current);
      hideAddTimeoutRef.current = null;
    }
    setRowIdShowingAdd(null);
    setAddIconHighlightedRowId(null);
    setPendingParentId(parentId);
  }, []);

  const onConfirmAddChild = useCallback(
    async (parentId: string, parentType: ProjectTodoNode['type'], title: string) => {
      if (!orderId) return;
      const trimmed = (title ?? '').trim();
      if (!trimmed) {
        setPendingParentId(null);
        return;
      }
      try {
        const { error: err } = await createProjectTodo({
          orderId,
          parentId,
          type: parentType,
          title: trimmed,
        });
        if (err) {
          const msg = err.message ?? 'Could not create item.';
          if (Platform.OS === 'web') {
            window.alert('Save failed: ' + msg);
          } else {
            Alert.alert('Save failed', msg);
          }
          return;
        }
        setPendingParentId(null);
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
        const todosTree = orderId ? await getProjectTodosTree(orderId) : [];
        setTree(todosTree);
        const taskIds = collectTaskIds(todosTree);
        const filesMap = await getAttachmentsByProjectTodoIds(taskIds);
        setTaskFilesMap(filesMap);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (Platform.OS === 'web') {
          window.alert('Save failed: ' + msg);
        } else {
          Alert.alert('Save failed', msg);
        }
      }
    },
    [orderId]
  );

  const onCancelAddChild = useCallback(() => {
    setPendingParentId(null);
  }, []);

  const onCancelTask = useCallback(
    async (todoId: string) => {
      if (!orderId) return;
      const { error: err } = await updateProjectTodo(todoId, { status: 'canceled' });
      if (err) {
        if (Platform.OS === 'web') window.alert('Cancel failed: ' + (err.message ?? ''));
        else Alert.alert('Cancel failed', err.message ?? '');
        return;
      }
      const todosTree = await getProjectTodosTree(orderId);
      setTree(todosTree);
      const taskIds = collectTaskIds(todosTree);
      const filesMap = await getAttachmentsByProjectTodoIds(taskIds);
      setTaskFilesMap(filesMap);
    },
    [orderId]
  );

  const onRestoreTask = useCallback(
    async (todoId: string) => {
      if (!orderId) return;
      const { error: err } = await updateProjectTodo(todoId, { status: 'action_required' });
      if (err) {
        if (Platform.OS === 'web') window.alert('Restore failed: ' + (err.message ?? ''));
        else Alert.alert('Restore failed', err.message ?? '');
        return;
      }
      const todosTree = await getProjectTodosTree(orderId);
      setTree(todosTree);
      const taskIds = collectTaskIds(todosTree);
      const filesMap = await getAttachmentsByProjectTodoIds(taskIds);
      setTaskFilesMap(filesMap);
    },
    [orderId]
  );

  const onUploadFile = useCallback(
    async (todoId: string) => {
      if (!orderId) return;
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
        if (status !== 'granted' && status !== 'undetermined') {
          if (Platform.OS === 'web') window.alert('Need photo library permission to upload.');
          else Alert.alert('Permission', 'Need photo library permission to upload.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.9,
        });
        if (result.canceled || !result.assets?.[0]?.uri) return;
        const imageUri = result.assets[0].uri;
        const tempFileName = `order-task-${Date.now()}`;
        const imageUrl = await uploadTaxFilingFile(imageUri, tempFileName, clientSpaceId);
        const createResult = await createProjectTodoAttachment(todoId, imageUrl, { status: 'PENDING_AI' });
        if ('error' in createResult) {
          const errMsg = createResult.error instanceof Error ? createResult.error.message : String(createResult.error);
          if (Platform.OS === 'web') window.alert('Link failed: ' + errMsg);
          else Alert.alert('Link failed', errMsg);
          return;
        }
        const todosTree = await getProjectTodosTree(orderId);
        setTree(todosTree);
        const taskIds = collectTaskIds(todosTree);
        const filesMap = await getAttachmentsByProjectTodoIds(taskIds);
        setTaskFilesMap(filesMap);
        setTaskFilesExpanded((prev) => new Set(prev).add(todoId));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (Platform.OS === 'web') window.alert('Upload failed: ' + msg);
        else Alert.alert('Upload failed', msg);
      }
    },
    [orderId, clientSpaceId]
  );

  const goToInfo = useCallback(() => {
    if (projectId) router.push(`/tax-filing/project/${projectId}/info`);
  }, [projectId, router]);

  const goToFileDetail = useCallback(
    (attachmentId: string) => {
      if (projectId) router.push(`/tax-filing/project/${projectId}/attachment/${attachmentId}`);
    },
    [projectId, router]
  );

  const onRemoveFile = useCallback(
    async (todoId: string, attachmentId: string) => {
      if (!orderId) return;
      const { error } = await deleteProjectTodoAttachment(attachmentId);
      if (error) {
        if (Platform.OS === 'web') window.alert('Remove failed: ' + (error.message ?? ''));
        else Alert.alert('Remove failed', error.message ?? '');
        return;
      }
      const taskIds = collectTaskIds(tree);
      const filesMap = await getAttachmentsByProjectTodoIds(taskIds);
      setTaskFilesMap(filesMap);
    },
    [orderId, tree]
  );

  const dateForYear = header?.dueAt || header?.createdAt || null;
  const taxSeasonYear = dateForYear ? new Date(dateForYear).getFullYear() : null;
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <OrderTodosHeaderTitle
          projectName={header?.projectName ?? ''}
          firmName={header?.firmName ?? ''}
          taxSeasonYear={taxSeasonYear ?? null}
        />
      ),
      headerRight: () => (
        <TouchableOpacity onPress={goToInfo} style={{ padding: 8 }} hitSlop={8}>
          <Ionicons name="settings-outline" size={22} color="#636E72" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, header, taxSeasonYear, goToInfo]);

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
    <View style={styles.container}>
      {header?.status === 'onboarding' ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Accept the order to see checklist</Text>
        </View>
      ) : (
        <>
          <View style={styles.operationBar}>
            <TouchableOpacity style={styles.operationBtn} onPress={() => {}} activeOpacity={0.7}>
              <Ionicons name="download-outline" size={18} color="#6C5CE7" />
              <Text style={styles.operationBtnText}>Download all files</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {tree.length === 0 ? (
              <View style={styles.treeCard}>
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyRowText}>No tasks yet</Text>
                </View>
              </View>
            ) : (
              <View style={styles.phaseBlocksWrap}>
                {tree.map((phaseNode, phaseIndex) => (
                  <View key={phaseNode.id} style={styles.phaseBlock}>
                    <TodoTree
                      nodes={[phaseNode]}
                      depth={0}
                      wbsPrefix=""
                      blockIndex={phaseIndex}
                      collapsed={collapsed}
                      taskFilesExpanded={taskFilesExpanded}
                      taskFilesMap={taskFilesMap}
                      nodeStats={nodeStats}
                      maxLeftBlockWidth={maxLeftBlockWidth}
                      onToggleCollapse={toggleCollapse}
                      onToggleTaskFiles={toggleTaskFiles}
                      onFilePress={goToFileDetail}
                      rowIdShowingAdd={rowIdShowingAdd}
                      setRowIdShowingAdd={setRowIdShowingAdd}
                      addIconHighlightedRowId={addIconHighlightedRowId}
                      setAddIconHighlightedRowId={setAddIconHighlightedRowId}
                      hideAddTimeoutRef={hideAddTimeoutRef}
                      pendingParentId={pendingParentId}
                      onStartAddChild={onStartAddChild}
                      onConfirmAddChild={onConfirmAddChild}
                      onCancelAddChild={onCancelAddChild}
                      onCancelTask={onCancelTask}
                      onRestoreTask={onRestoreTask}
                      onUploadFile={onUploadFile}
                      onRemoveFile={onRemoveFile}
                    />
                  </View>
                ))}
              </View>
            )}
        </ScrollView>
        </>
      )}
    </View>
  );
}

const TREE_ROW_BG_EVEN = '#FFFFFF';
const TREE_ROW_BG_ODD = '#F8F9FA';

/** 临时“新增子节点”行：名称输入框 + 确认 ✅，仅确认时落库 */
function PendingAddRow({
  parentId,
  parentType,
  nextWbsCode,
  depth,
  rowBg,
  maxLeftBlockWidth,
  onConfirm,
  onCancel,
}: {
  parentId: string;
  parentType: ProjectTodoNode['type'];
  nextWbsCode: string;
  depth: number;
  rowBg: string;
  maxLeftBlockWidth: number;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<TextInput>(null);
  const titleRef = useRef(title);
  titleRef.current = title;
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(titleRef.current);
  }, [onConfirm]);

  const indent = depth * 14;
  const titleFontSize = depth === 0 ? 15 : depth === 1 ? 14 : 13;
  return (
    <View style={styles.treeRowWrap}>
      <View style={[styles.treeRow, styles.pendingAddRow, { backgroundColor: rowBg }]}>
        <View style={[styles.treeRowLeftBlock, { width: maxLeftBlockWidth }]}>
          <View style={{ width: 12 + indent }} />
          <View style={styles.chevronWrap} />
          <View style={styles.wbsHotzone}>
            <Text style={styles.wbsColText} numberOfLines={1}>{nextWbsCode}</Text>
          </View>
          <View style={styles.pendingAddInputRow}>
            <TextInput
              ref={inputRef}
              style={[styles.pendingAddInput, { fontSize: titleFontSize }]}
              value={title}
              onChangeText={setTitle}
              placeholder="New item name"
              placeholderTextColor="#95A5A6"
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
              blurOnSubmit
            />
            <Pressable
              style={styles.cancelAddBtn}
              onPress={onCancel}
              hitSlop={8}
            >
              <Ionicons name="close-circle-outline" size={16} color="#95A5A6" />
            </Pressable>
            <Pressable
              style={styles.confirmAddBtn}
              onPress={() => {
                const t = (titleRef.current ?? '').trim();
                if (t) onConfirm(t);
              }}
              hitSlop={8}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#95A5A6" />
            </Pressable>
          </View>
        </View>
        <View style={styles.progressFilesCol} />
        <View style={styles.statusCol} />
      </View>
    </View>
  );
}

function TodoTree({
  nodes,
  depth,
  wbsPrefix,
  blockIndex,
  collapsed,
  taskFilesExpanded,
  taskFilesMap,
  nodeStats,
  maxLeftBlockWidth,
  parentRowBg,
  onToggleCollapse,
  onToggleTaskFiles,
  onFilePress,
  rowIdShowingAdd,
  setRowIdShowingAdd,
  addIconHighlightedRowId,
  setAddIconHighlightedRowId,
  hideAddTimeoutRef,
  pendingParentId,
  onStartAddChild,
  onConfirmAddChild,
  onCancelAddChild,
  onCancelTask,
  onRestoreTask,
  onUploadFile,
  onRemoveFile,
}: {
  nodes: ProjectTodoNode[];
  depth: number;
  wbsPrefix: string;
  /** 按 phase 拆块时传入，根行 WBS 用 blockIndex+idx+1，保证跨块连续 1,2,3... */
  blockIndex?: number;
  collapsed: Set<string>;
  taskFilesExpanded: Set<string>;
  taskFilesMap: Record<string, ProjectTodoReceiptSummary[]>;
  nodeStats: { taskTotal: Record<string, number>; taskSuccess: Record<string, number>; effectiveStatus: Record<string, string> };
  maxLeftBlockWidth: number;
  parentRowBg?: string;
  onToggleCollapse: (id: string) => void;
  onToggleTaskFiles: (id: string) => void;
  onFilePress: (receiptId: string) => void;
  rowIdShowingAdd?: string | null;
  setRowIdShowingAdd?: (id: string | null) => void;
  addIconHighlightedRowId?: string | null;
  setAddIconHighlightedRowId?: (id: string | null) => void;
  hideAddTimeoutRef?: { current: ReturnType<typeof setTimeout> | null };
  pendingParentId?: string | null;
  onStartAddChild?: (parentId: string) => void;
  onConfirmAddChild?: (parentId: string, parentType: ProjectTodoNode['type'], title: string) => void;
  onCancelAddChild?: () => void;
  onCancelTask?: (todoId: string) => void;
  onRestoreTask?: (todoId: string) => void;
  onUploadFile?: (todoId: string) => void;
  onRemoveFile?: (todoId: string, attachmentId: string) => void;
}) {
  const indent = depth * 14;
  const { taskTotal, taskSuccess, effectiveStatus } = nodeStats;

  return (
    <>
      {nodes.map((node, idx) => {
        const firstInGroupBg = parentRowBg === undefined ? TREE_ROW_BG_EVEN : (parentRowBg === TREE_ROW_BG_EVEN ? TREE_ROW_BG_ODD : TREE_ROW_BG_EVEN);
        const rowBg = idx % 2 === 0 ? firstInGroupBg : (firstInGroupBg === TREE_ROW_BG_EVEN ? TREE_ROW_BG_ODD : TREE_ROW_BG_EVEN);
        const hasChildren = node.children.length > 0;
        const isCollapsed = collapsed.has(node.id);
        const isTask = node.itemKind === 'task';
        const filesExpanded = taskFilesExpanded.has(node.id);
        const files = taskFilesMap[node.id] ?? [];

        const wbsCode = depth === 0 && blockIndex !== undefined
          ? String(blockIndex + idx + 1)
          : (wbsPrefix ? `${wbsPrefix}.${idx + 1}` : String(idx + 1));
        const total = taskTotal[node.id] ?? 0;
        const success = taskSuccess[node.id] ?? 0;
        const status = isTask ? node.status : effectiveStatus[node.id];
        const showStatus = isTask ? true : isCollapsed && total > 0;
        const showNm = isCollapsed && total > 0;
        const isCanceled = isTask && node.status === 'canceled';

        const titleStyle =
          depth === 0 ? styles.treeTitleL0 : depth === 1 ? styles.treeTitleL1 : styles.treeTitleL2;

        /** 仅 section/phase 行显示「+」；task 行不创建下级，触摸显示终止/恢复/上传 */
        const showRowIconsOnTouch = (onStartAddChild && !isTask) || isTask;
        const showAddIcon = onStartAddChild && !isTask && rowIdShowingAdd === node.id;
        const addIconInline = showAddIcon ? (
          <TouchableOpacity
            style={styles.addChildBtn}
            onPress={() => onStartAddChild(node.id)}
            onPressIn={() => setAddIconHighlightedRowId?.(node.id)}
            onPressOut={() => setAddIconHighlightedRowId?.(null)}
            activeOpacity={0.6}
            hitSlop={8}
          >
            <Ionicons
              name={addIconHighlightedRowId === node.id ? 'add-circle' : 'add-circle-outline'}
              size={14}
              color={addIconHighlightedRowId === node.id ? '#6C5CE7' : '#95A5A6'}
            />
          </TouchableOpacity>
        ) : null;

        const showTaskIcons = rowIdShowingAdd === node.id;
        const progressColContent = (
          <View style={styles.progressFilesCol}>
            {showNm ? (
              <Text style={styles.nmText} numberOfLines={1}>
                {success}/{total}
              </Text>
            ) : isTask ? (
              <View style={styles.progressFilesColInner}>
                <TouchableOpacity
                  style={styles.filesToggle}
                  onPress={() => onToggleTaskFiles(node.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={filesExpanded ? 'document' : 'document-outline'} size={14} color="#6C5CE7" />
                  <Text style={styles.filesToggleText} numberOfLines={1}>{files.length}</Text>
                </TouchableOpacity>
                {showTaskIcons && onUploadFile && !isCanceled ? (
                  <Pressable
                    style={styles.uploadTaskBtnHotzone}
                    onPress={() => onUploadFile(node.id)}
                  >
                    <View style={styles.uploadTaskBtn}>
                      <Ionicons name="cloud-upload-outline" size={12} color="#FFF" />
                      <Text style={styles.uploadTaskBtnText}>Upload</Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );

        const statusColContent = (
          <View style={styles.statusCol}>
            {showStatus ? (
              <View style={[styles.statusPill, { backgroundColor: TODO_STATUS_COLOR[status] ?? '#95A5A6' }]}>
                <Text style={styles.statusPillText} numberOfLines={1}>
                  {TODO_STATUS_LABEL[status] ?? status}
                </Text>
              </View>
            ) : null}
          </View>
        );

        const onCollapsePress = hasChildren ? () => onToggleCollapse(node.id) : undefined;
        const showRowIconsOnTouchStart = showRowIconsOnTouch && setRowIdShowingAdd
          ? () => {
              if (hideAddTimeoutRef?.current) {
                clearTimeout(hideAddTimeoutRef.current);
                hideAddTimeoutRef.current = null;
              }
              setRowIdShowingAdd(node.id);
            }
          : undefined;
        const showRowIconsOnTouchEnd = showRowIconsOnTouch && setRowIdShowingAdd && hideAddTimeoutRef
          ? () => {
              if (hideAddTimeoutRef.current) clearTimeout(hideAddTimeoutRef.current);
              hideAddTimeoutRef.current = setTimeout(() => setRowIdShowingAdd?.(null), 400);
            }
          : undefined;

        const collapseHandlers = onCollapsePress
          ? { onPress: onCollapsePress, onPressIn: showRowIconsOnTouchStart, onPressOut: showRowIconsOnTouchEnd, activeOpacity: 0.85 as const }
          : showRowIconsOnTouchStart
            ? { onPress: undefined, onPressIn: showRowIconsOnTouchStart, onPressOut: showRowIconsOnTouchEnd, activeOpacity: 0.85 as const }
            : undefined;

        /** 名称热区仅包裹名称文本；已终止 task 显示删除线 */
        const titleContentOnly = (
          <View style={styles.treeTitleWrapAdaptive}>
            <Text
              style={[
                styles.treeTitleAdaptive,
                titleStyle,
                isCanceled && styles.treeTitleCanceled,
              ]}
              numberOfLines={1}
            >
              {node.title}
            </Text>
          </View>
        );

        const WbsCell = collapseHandlers ? (
          <TouchableOpacity
            style={styles.wbsHotzone}
            {...collapseHandlers}
          >
            <Text style={styles.wbsColText} numberOfLines={1}>{wbsCode}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.wbsHotzone}>
            <Text style={styles.wbsColText} numberOfLines={1}>{wbsCode}</Text>
          </View>
        );

        const TitleCell = (onCollapsePress || showRowIconsOnTouch) ? (
          <TouchableOpacity
            style={styles.titleHotzone}
            onPress={collapseHandlers?.onPress}
            onPressIn={showRowIconsOnTouchStart ?? collapseHandlers?.onPressIn}
            onPressOut={showRowIconsOnTouchEnd ?? collapseHandlers?.onPressOut}
            activeOpacity={collapseHandlers?.activeOpacity ?? 0.85}
          >
            {titleContentOnly}
          </TouchableOpacity>
        ) : (
          <View style={styles.titleHotzone}>
            {titleContentOnly}
          </View>
        );

        const ADD_ICON_SLOT_WIDTH = 24;
        const AddIconSlot = onStartAddChild && !isTask ? (
          <View style={[styles.addIconSlot, { width: ADD_ICON_SLOT_WIDTH }]} pointerEvents="box-none">
            {addIconInline}
          </View>
        ) : null;

        const CancelTaskSlot =
          isTask && !isCanceled && onCancelTask && showTaskIcons ? (
            <Pressable
              style={styles.terminateTaskBtnHotzone}
              onPress={() => onCancelTask(node.id)}
            >
              <View style={styles.terminateTaskBtnIcon}>
                <Ionicons name="remove-circle-outline" size={14} color="#E67E22" />
              </View>
            </Pressable>
          ) : null;
        const RestoreTaskSlot =
          isTask && isCanceled && onRestoreTask && showTaskIcons ? (
            <Pressable
              style={styles.restoreTaskBtnHotzone}
              onPress={() => onRestoreTask(node.id)}
            >
              <View style={styles.restoreTaskBtnIcon}>
                <Ionicons name="refresh-circle-outline" size={14} color="#7DCEA0" />
              </View>
            </Pressable>
          ) : null;

        /** 名称+加号外层：section 有+；task 有终止/恢复；触摸整行显示对应图标。Web：指针进入即显示，离开延迟隐藏 */
        const showAddHandlers = showRowIconsOnTouch
          ? {
              onTouchStart: showRowIconsOnTouchStart,
              onTouchEnd: showRowIconsOnTouchEnd,
              onMouseDown: showRowIconsOnTouchStart,
              onMouseUp: showRowIconsOnTouchEnd,
              onMouseEnter: showRowIconsOnTouchStart,
              onMouseLeave: showRowIconsOnTouchEnd,
            }
          : undefined;

        const TitleTrailingShowAdd = showRowIconsOnTouch ? (
          <View style={styles.titleColumnTrailing} {...showAddHandlers} />
        ) : null;

        const TitleColumnWrap = (
          <View style={styles.titleColumnWrap}>
            {TitleCell}
            {AddIconSlot}
            {CancelTaskSlot}
            {RestoreTaskSlot}
            {TitleTrailingShowAdd}
          </View>
        );

        /** 缩进+箭头：section/task 行触摸热区，显示+或终止/恢复/上传 */
        const IndentChevronShowAddArea = showRowIconsOnTouch ? (
          <View style={styles.showAddTouchArea} {...showAddHandlers}>
            <View style={{ width: 12 + indent }} />
            <View style={styles.chevronWrap}>
              {hasChildren ? (
                <Ionicons
                  name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                  size={14}
                  color="#636E72"
                />
              ) : null}
            </View>
          </View>
        ) : (
          <>
            <View style={{ width: 12 + indent }} />
            <View style={styles.chevronWrap}>
              {hasChildren ? (
                <Ionicons
                  name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                  size={14}
                  color="#636E72"
                />
              ) : null}
            </View>
          </>
        );

        const leftBlockContent = (
          <>
            {IndentChevronShowAddArea}
            {WbsCell}
            {TitleColumnWrap}
          </>
        );

        const leftBlockFull = (
          <View style={[styles.treeRowLeftBlock, { width: maxLeftBlockWidth }]}>
            {leftBlockContent}
          </View>
        );

        const ProgressCell = collapseHandlers ? (
          <TouchableOpacity style={styles.progressFilesCol} {...collapseHandlers}>
            {progressColContent}
          </TouchableOpacity>
        ) : (
          <View style={styles.progressFilesCol}>
            {progressColContent}
          </View>
        );

        const StatusCell = collapseHandlers ? (
          <TouchableOpacity style={styles.statusCol} {...collapseHandlers}>
            {statusColContent}
          </TouchableOpacity>
        ) : (
          <View style={styles.statusCol}>
            {statusColContent}
          </View>
        );

        const rowContainerStyle = [
          styles.treeRow,
          { backgroundColor: rowBg },
          node.itemKind === 'section' && { borderTopWidth: 1, borderTopColor: '#E9ECEF' },
        ];

        const rowContent = (
          <>
            {leftBlockFull}
            {ProgressCell}
            {StatusCell}
          </>
        );

        /** 整行底层：section/task 触摸即显示对应图标（+ 或 终止/恢复/上传） */
        const rowWrapWithShowAdd = showRowIconsOnTouch ? (
          <View style={styles.rowShowAddWrap} {...showAddHandlers}>
            <View style={styles.rowShowAddInner}>{rowContent}</View>
          </View>
        ) : (
          rowContent
        );

        return (
          <View key={node.id} style={styles.treeRowWrap}>
            <View style={rowContainerStyle}>
              {rowWrapWithShowAdd}
            </View>
            {hasChildren && !isCollapsed && (
              <TodoTree
                nodes={node.children}
                depth={depth + 1}
                wbsPrefix={wbsCode}
                collapsed={collapsed}
                taskFilesExpanded={taskFilesExpanded}
                taskFilesMap={taskFilesMap}
                nodeStats={nodeStats}
                maxLeftBlockWidth={maxLeftBlockWidth}
                parentRowBg={rowBg}
                onToggleCollapse={onToggleCollapse}
                onToggleTaskFiles={onToggleTaskFiles}
                onFilePress={onFilePress}
                rowIdShowingAdd={rowIdShowingAdd}
                setRowIdShowingAdd={setRowIdShowingAdd}
                addIconHighlightedRowId={addIconHighlightedRowId}
                setAddIconHighlightedRowId={setAddIconHighlightedRowId}
                hideAddTimeoutRef={hideAddTimeoutRef}
                pendingParentId={pendingParentId}
                onStartAddChild={onStartAddChild}
                onConfirmAddChild={onConfirmAddChild}
                onCancelAddChild={onCancelAddChild}
                onCancelTask={onCancelTask}
                onRestoreTask={onRestoreTask}
                onUploadFile={onUploadFile}
                onRemoveFile={onRemoveFile}
              />
            )}
            {pendingParentId === node.id && onConfirmAddChild && onCancelAddChild && (
              <PendingAddRow
                parentId={node.id}
                parentType={node.type}
                nextWbsCode={node.children.length > 0 ? `${wbsCode}.${node.children.length + 1}` : `${wbsCode}.1`}
                depth={depth + 1}
                rowBg={
                  node.children.length % 2 === 0
                    ? (rowBg === TREE_ROW_BG_EVEN ? TREE_ROW_BG_ODD : TREE_ROW_BG_EVEN)
                    : rowBg
                }
                maxLeftBlockWidth={maxLeftBlockWidth}
                onConfirm={(t) => onConfirmAddChild(node.id, node.type, t)}
                onCancel={onCancelAddChild}
              />
            )}
            {isTask && filesExpanded && (
              <View style={[styles.filesBlock, { marginLeft: 12 + indent + 24 }]}>
                {files.length === 0 ? (
                  <Text style={styles.filesEmpty}>No files linked yet</Text>
                ) : (
                  <View style={styles.attachmentCardsWrap}>
                    {(files as ProjectTodoReceiptSummary[]).map((f) => (
                      <TouchableOpacity
                        key={f.id}
                        style={styles.attachmentCard}
                        onPress={() => onFilePress(f.id)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.attachmentCardTop}>
                          {f.imageUrl ? (
                            <Image source={{ uri: f.imageUrl }} style={styles.attachmentCardThumb} resizeMode="cover" />
                          ) : (
                            <View style={[styles.attachmentCardThumb, styles.attachmentCardThumbPlaceholder]}>
                              <Ionicons name="document-outline" size={20} color="#95A5A6" />
                            </View>
                          )}
                          <View style={styles.attachmentCardBody}>
                            {f.docType ? (
                              <View style={styles.attachmentCardDocType}>
                                <Text style={styles.attachmentCardDocTypeText} numberOfLines={1}>{f.docType}</Text>
                              </View>
                            ) : f.status === 'PENDING_AI' ? (
                              <Text style={styles.attachmentCardPending}>Processing…</Text>
                            ) : null}
                            <Text style={styles.attachmentCardSummary} numberOfLines={2}>{f.name || 'Attachment'}</Text>
                            {(f.extractedPreview?.length ?? 0) > 0 && (
                              <View style={styles.attachmentCardPreview}>
                                {f.extractedPreview!.slice(0, 4).map((p, i) => (
                                  <Text key={i} style={styles.attachmentCardPreviewLine} numberOfLines={1}>
                                    {p.label}: {p.value}
                                  </Text>
                                ))}
                              </View>
                            )}
                          </View>
                          <View style={styles.attachmentCardTrailing}>
                            {onRemoveFile ? (
                              <Pressable
                                style={styles.fileRowRemoveBtn}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  onRemoveFile(node.id, f.id);
                                }}
                                hitSlop={8}
                              >
                                <Ionicons name="close-circle-outline" size={18} color="#95A5A6" />
                              </Pressable>
                            ) : null}
                            <Ionicons name="chevron-forward" size={14} color="#95A5A6" />
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 20 },
  errorText: { fontSize: 16, color: '#636E72', marginBottom: 16 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  backBtnText: { fontSize: 16, color: '#6C5CE7', fontWeight: '500' },
  /** 与 Expenses (receipts) 页 toolbarSlot 一致：高度 52 */
  operationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  operationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    gap: 6,
  },
  operationBtnText: { fontSize: 14, color: '#6C5CE7', fontWeight: '500' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  treeCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    overflow: 'hidden',
  },
  phaseBlocksWrap: { gap: 12, backgroundColor: '#F8F9FA' },
  phaseBlock: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    overflow: 'hidden',
  },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: '#636E72' },
  emptyRow: { padding: 24, alignItems: 'center' },
  emptyRowText: { fontSize: 14, color: '#95A5A6' },
  treeRowWrap: {},
  treeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 10,
    paddingRight: 12,
    minHeight: 40,
    flexWrap: 'nowrap',
  },
  rowShowAddWrap: { flex: 1, flexDirection: 'row', alignItems: 'stretch', minWidth: 0, cursor: 'pointer' },
  rowShowAddInner: { flex: 1, flexDirection: 'row', alignItems: 'stretch', minWidth: 0 },
  treeRowTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', minWidth: 0 },
  /** 左侧整块宽度由 maxLeftBlockWidth 传入，保证状态列对齐且尽量靠近名称 */
  treeRowLeftBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    minWidth: 0,
    marginRight: 48,
  },
  treeRowLeftBlockCollapseOnly: { minWidth: 0 },
  showAddTouchArea: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', cursor: 'pointer' },
  chevronWrap: { width: 28, alignItems: 'center', justifyContent: 'center' },
  wbsHotzone: { width: 36, marginRight: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  titleColumnWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  titleColumnTrailing: { flex: 1, minWidth: 0, cursor: 'pointer' },
  titleHotzone: { alignSelf: 'stretch', justifyContent: 'center', flexShrink: 0 },
  treeTitleWrapAdaptive: { flexDirection: 'row', alignItems: 'center' },
  treeTitleAdaptive: { fontSize: 15, color: '#2D3436' },
  treeTitleCanceled: { textDecorationLine: 'line-through', color: '#95A5A6' },
  /** 终止/恢复：热区全行高，图标固定小高度不撑大行高 */
  terminateTaskBtnHotzone: { alignSelf: 'stretch', justifyContent: 'center', marginLeft: 2, cursor: 'pointer', minWidth: 20 },
  restoreTaskBtnHotzone: { alignSelf: 'stretch', justifyContent: 'center', marginLeft: 2, cursor: 'pointer', minWidth: 20 },
  /** 图标 20x20 不撑行高；translateY(1) 微调与文本对齐且不参与布局 */
  terminateTaskBtnIcon: { height: 20, width: 20, justifyContent: 'center', alignItems: 'center', transform: [{ translateY: 1 }] },
  restoreTaskBtnIcon: { height: 20, width: 20, justifyContent: 'center', alignItems: 'center', transform: [{ translateY: 1 }] },
  addIconSlot: { width: 24, height: 20, justifyContent: 'center', alignItems: 'center' },
  wbsCol: { width: 36, marginRight: 8, fontSize: 11, color: '#95A5A6', fontWeight: '500' },
  wbsColText: { fontSize: 11, color: '#95A5A6', fontWeight: '500' },
  treeTitleWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  treeTitle: { flex: 1, fontSize: 15, color: '#2D3436', minWidth: 0 },
  addChildBtn: { padding: 0, marginLeft: 0, marginTop: 2 },
  pendingAddRow: { minHeight: 40 },
  pendingAddInputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 6,
  },
  pendingAddInput: {
    flex: 1,
    fontSize: 14,
    color: '#2D3436',
    paddingVertical: 2,
    paddingHorizontal: 0,
    minHeight: 24,
    minWidth: 60,
    borderWidth: 0,
    outlineStyle: 'none',
  },
  cancelAddBtn: { padding: 2, marginRight: 2, minWidth: 28, minHeight: 28, justifyContent: 'center', alignItems: 'center', cursor: 'pointer' },
  confirmAddBtn: { padding: 2, minWidth: 28, minHeight: 28, justifyContent: 'center', alignItems: 'center', cursor: 'pointer' },
  treeTitleL0: { fontWeight: '700', fontSize: 15, color: '#2D3436' },
  treeTitleL1: { fontWeight: '600', fontSize: 14, color: '#2D3436' },
  treeTitleL2: { fontWeight: '500', fontSize: 13, color: '#636E72' },
  progressFilesCol: { width: 52, minWidth: 52, alignItems: 'flex-start', justifyContent: 'center', marginRight: 96, alignSelf: 'stretch' },
  progressFilesColInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 4 },
  uploadTaskBtnHotzone: { alignSelf: 'stretch', justifyContent: 'center', cursor: 'pointer' },
  uploadTaskBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20, maxHeight: 20, paddingVertical: 0, paddingHorizontal: 5, backgroundColor: '#6C5CE7', borderRadius: 4, justifyContent: 'center' },
  uploadTaskBtnText: { fontSize: 10, color: '#FFF', fontWeight: '600' },
  nmText: { fontSize: 12, color: '#636E72' },
  statusCol: { width: 120, minWidth: 120, alignItems: 'flex-start', justifyContent: 'center', alignSelf: 'stretch' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusPillText: { fontSize: 11, color: '#FFF', fontWeight: '600' },
  filesToggle: { flexDirection: 'row', alignItems: 'center' },
  filesToggleText: { fontSize: 12, color: '#6C5CE7', marginLeft: 2 },
  filesBlock: { paddingVertical: 8, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  filesEmpty: { fontSize: 13, color: '#95A5A6', fontStyle: 'italic' },
  attachmentCardsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  attachmentCard: {
    minWidth: 200,
    width: '48%',
    maxWidth: 320,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    padding: 10,
  },
  attachmentCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  attachmentCardThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  attachmentCardThumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  attachmentCardBody: { flex: 1, minWidth: 0 },
  attachmentCardDocType: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0EEFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  attachmentCardDocTypeText: { fontSize: 10, color: '#6C5CE7', fontWeight: '600' },
  attachmentCardPending: { fontSize: 11, color: '#95A5A6', fontStyle: 'italic', marginBottom: 2 },
  attachmentCardSummary: { fontSize: 12, color: '#2D3436', marginBottom: 4 },
  attachmentCardPreview: { gap: 2 },
  attachmentCardPreviewLine: { fontSize: 10, color: '#636E72', marginBottom: 0 },
  attachmentCardTrailing: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fileRowRemoveBtn: { width: 20, height: 20, justifyContent: 'center', alignItems: 'center', cursor: 'pointer' },
});
