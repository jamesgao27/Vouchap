/**
 * TaxFilingTodosView — 与 client 侧 tax-filing/project/[projectId]/index.tsx 完全一致的
 * Todos 树形列表。可被 client 和 firm 两侧共同复用。
 *
 * 调用方只需提供：
 *   - tree / orderId / clientSpaceId
 *   - createProjectTodo（创建子节点）
 *   - onFilePress（点击附件详情时跳转）
 *   - onRefresh（任何操作后告知父级树已更新）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Pressable,
  Alert,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getProjectTodosTree,
  getAttachmentsByProjectTodoIds,
  createProjectTodoAttachment,
  deleteProjectTodoAttachment,
  updateProjectTodo,
  updateProjectTodoDependsOn,
  changeProjectTodoResponsibleSide,
  type ProjectTodoNode,
  type ProjectTodoReceiptSummary,
} from '@/lib/firm';
import {
  TODO_STATUS_COLOR,
  getStatusLabel,
  getStatusColor,
} from '@/lib/constants/project-todo-status';
import { uploadTaxFilingFile } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';

// ──────────────────────────────────────────────────
// 常量 & 工具函数
// ──────────────────────────────────────────────────

const TREE_ROW_BG_EVEN = '#FFFFFF';
const TREE_ROW_BG_ODD = '#F8F9FA';

const STATUS_PRIORITY = ['to_submit', 'missing_info', 'reviewing', 'in_progress', 'completed'] as const;

function worstStatus(a: string, b: string): string {
  const ia = STATUS_PRIORITY.indexOf(a as any);
  const ib = STATUS_PRIORITY.indexOf(b as any);
  if (ia === -1) return b;
  if (ib === -1) return a;
  return ia <= ib ? a : b;
}

/** 前置依赖小标签用色：红橙蓝绿灰，文字用实色、底色 20% 透明度 */
function getDepStatusColor(status: string): { text: string; bg: string } {
  const R = (r: number, g: number, b: number) => ({ text: `rgb(${r},${g},${b})`, bg: `rgba(${r},${g},${b},0.2)` });
  switch (status) {
    case 'missing_info': return R(231, 76, 60);
    case 'to_submit':    return R(230, 126, 34);
    case 'reviewing':
    case 'in_progress':  return R(52, 152, 219);
    case 'completed':    return R(39, 174, 96);
    case 'canceled':
    default:             return R(127, 140, 141);
  }
}

export function collectTaskIds(nodes: ProjectTodoNode[]): string[] {
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

function useNodeStats(nodes: ProjectTodoNode[]) {
  return useMemo(() => {
    const taskTotal: Record<string, number> = {};
    const taskSuccess: Record<string, number> = {};
    const effectiveStatus: Record<string, string> = {};

    function walk(list: ProjectTodoNode[]): { total: number; success: number; status: string } {
      let total = 0;
      let success = 0;
      let status: string = 'completed';
      list.forEach((n) => {
        if (n.itemKind === 'task') {
          taskTotal[n.id] = 1;
          effectiveStatus[n.id] = n.status;
          if (n.status === 'canceled') {
            taskSuccess[n.id] = 0;
          } else {
            total += 1;
            if (n.status === 'completed') success += 1;
            status = worstStatus(status, n.status);
            taskSuccess[n.id] = n.status === 'completed' ? 1 : 0;
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

// ──────────────────────────────────────────────────
// PendingAddRow
// ──────────────────────────────────────────────────

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
    <View style={ts.treeRowWrap}>
      <View style={[ts.treeRow, ts.pendingAddRow, { backgroundColor: rowBg }]}>
        <View style={[ts.treeRowLeftBlock, { width: maxLeftBlockWidth }]}>
          <View style={{ width: 12 + indent }} />
          <View style={ts.chevronWrap} />
          <View style={ts.wbsHotzone}>
            <Text style={ts.wbsColText} numberOfLines={1}>{nextWbsCode}</Text>
          </View>
          <View style={ts.pendingAddInputRow}>
            <TextInput
              ref={inputRef}
              style={[ts.pendingAddInput, { fontSize: titleFontSize }]}
              value={title}
              onChangeText={setTitle}
              placeholder="New item name"
              placeholderTextColor="#95A5A6"
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
              blurOnSubmit
            />
            <Pressable style={ts.cancelAddBtn} onPress={onCancel} hitSlop={8}>
              <Ionicons name="close-outline" size={16} color="#95A5A6" />
            </Pressable>
            <Pressable style={ts.confirmAddBtn} onPress={handleConfirm} hitSlop={8}>
              <Ionicons name="checkmark-outline" size={16} color="#6C5CE7" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────
// TodoTree (recursive)
// ──────────────────────────────────────────────────

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
  viewerRole,
  blockedNodes,
  isBlocked = false,
  allNodesFlat,
  depsPanelNodeId,
  setDepsPanelNodeId,
  onSetDependsOn,
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
  onHandoffTask,
  phaseAndSectionWithWbs,
  rowFileColHoverId,
  setRowFileColHoverId,
  hideFileColTimeoutRef,
  rowIdShowingStatusVerb,
  setRowIdShowingStatusVerb,
}: {
  nodes: ProjectTodoNode[];
  depth: number;
  wbsPrefix: string;
  blockIndex?: number;
  collapsed: Set<string>;
  taskFilesExpanded: Set<string>;
  taskFilesMap: Record<string, ProjectTodoReceiptSummary[]>;
  nodeStats: { taskTotal: Record<string, number>; taskSuccess: Record<string, number>; effectiveStatus: Record<string, string> };
  maxLeftBlockWidth: number;
  parentRowBg?: string;
  viewerRole: 'client' | 'firm';
  /** 通过 depends_on_id 计算得出的全部被锁节点 ID 集合（含传递性扩展） */
  blockedNodes: Set<string>;
  /** 父级已被锁定时为 true，子节点直接继承 */
  isBlocked?: boolean;
  /** 扁平化的全树节点（供依赖候选列表 / 状态计算使用） */
  allNodesFlat: ProjectTodoNode[];
  /** 当前展开依赖选择浮窗的节点 id（null=无） */
  depsPanelNodeId: string | null;
  setDepsPanelNodeId: (id: string | null) => void;
  onSetDependsOn: (nodeId: string, dependsOnIds: string[] | null) => void;
  /** 所有 phase / section 节点及其 WBS 编号，供任务前置依赖选单使用 */
  phaseAndSectionWithWbs: { id: string; wbs: string; title: string }[];
  onToggleCollapse: (id: string) => void;
  onToggleTaskFiles: (id: string) => void;
  onFilePress?: (attachmentId: string) => void;
  rowIdShowingAdd?: string | null;
  setRowIdShowingAdd?: (id: string | null) => void;
  addIconHighlightedRowId?: string | null;
  setAddIconHighlightedRowId?: (id: string | null) => void;
  hideAddTimeoutRef?: { current: ReturnType<typeof setTimeout> | null };
  /** zone2：文件计数列 hover，显示 Upload */
  rowFileColHoverId?: string | null;
  setRowFileColHoverId?: (id: string | null) => void;
  hideFileColTimeoutRef?: { current: ReturnType<typeof setTimeout> | null };
  /** zone3：状态标签点击后，该行状态 pill 变为动词按钮 */
  rowIdShowingStatusVerb?: string | null;
  setRowIdShowingStatusVerb?: (id: string | null) => void;
  pendingParentId?: string | null;
  onStartAddChild?: (parentId: string) => void;
  onConfirmAddChild?: (parentId: string, parentType: ProjectTodoNode['type'], title: string) => void;
  onCancelAddChild?: () => void;
  onCancelTask?: (todoId: string) => void;
  onRestoreTask?: (todoId: string) => void;
  onUploadFile?: (todoId: string) => void;
  onRemoveFile?: (todoId: string, attachmentId: string) => void;
  onHandoffTask?: (todoId: string, from: 'client' | 'firm', to: 'client' | 'firm', verb: string, newStatus?: ProjectTodoNode['status']) => void;
}) {
  const indent = depth * 14;
  const { taskTotal, taskSuccess, effectiveStatus } = nodeStats;
  const [activeDepChipId, setActiveDepChipId] = useState<string | null>(null);
  const [depsControlsNodeId, setDepsControlsNodeId] = useState<string | null>(null);

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

        // ── 节点锁定：父级锁定时继承，或本节点自身有未完成前置 ──
        const nodeIsBlocked = isBlocked || blockedNodes.has(node.id);

        // ── 角色权限 + 阶段锁定判断 ──
        const isSelfTodo = node.type === viewerRole;
        const canUpload        = !nodeIsBlocked && (isSelfTodo || viewerRole === 'firm');
        const canCancelRestore = !nodeIsBlocked && (isSelfTodo || viewerRole === 'firm');
        const canAddChild      = !nodeIsBlocked && !isTask;

        const titleStyle =
          depth === 0 ? ts.treeTitleL0 : depth === 1 ? ts.treeTitleL1 : ts.treeTitleL2;

        // row-level hover：用于显示 +（section/phase）或 -/restart / Upload / 提交按钮
        const showRowIconsOnTouch = (onStartAddChild && canAddChild) || (isTask && (canUpload || canCancelRestore));
        const showAddIcon = onStartAddChild && canAddChild && rowIdShowingAdd === node.id;
        const addIconInline = showAddIcon ? (
          <TouchableOpacity
            style={ts.addChildBtn}
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

        // zone2：文件计数列 + 右侧空白，单独控制 Upload 按钮显示
        const showUpload = rowFileColHoverId === node.id;

        // zone2：文件计数列 + 右侧空白，hover 时点亮 Upload（高度充满整行）
        const fileColHoverHandlers = setRowFileColHoverId
          ? {
              onMouseEnter: () => setRowFileColHoverId(node.id),
              onMouseLeave: () => setRowFileColHoverId(null),
              onTouchStart: () => setRowFileColHoverId(node.id),
              onTouchEnd: () => setRowFileColHoverId(null),
            }
          : undefined;

        const progressColContent = (
          <View style={ts.progressFilesCol} {...(fileColHoverHandlers as any)}>
            {showNm ? (
              <Text style={ts.nmText} numberOfLines={1}>{success}/{total}</Text>
            ) : isTask ? (
              <View style={ts.progressFilesColInner}>
                <TouchableOpacity
                  style={ts.filesToggle}
                  onPress={() => onToggleTaskFiles(node.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={filesExpanded ? 'document' : 'document-outline'} size={14} color="#6C5CE7" />
                  <Text style={ts.filesToggleText} numberOfLines={1}>{files.length}</Text>
                </TouchableOpacity>
                {showUpload && onUploadFile && !isCanceled && !nodeIsBlocked && canUpload ? (
                  <Pressable style={ts.uploadTaskBtnHotzone} onPress={() => onUploadFile(node.id)}>
                    <View style={ts.uploadTaskBtn}>
                      <Ionicons name="cloud-upload-outline" size={12} color="#FFF" />
                      <Text style={ts.uploadTaskBtnText}>Upload</Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );

        // 状态列：按附图「当前登录者 + 当前状态」决定按钮与流转后状态
        type HandoffButton = { verb: string; toSide: 'client' | 'firm'; newStatus?: ProjectTodoNode['status']; primary?: boolean };
        const handoffButtons: HandoffButton[] = [];

        if (!nodeIsBlocked && isTask && onHandoffTask) {
          if (viewerRole === 'client') {
            switch (status) {
              case 'to_submit':
              case 'missing_info':
                handoffButtons.push({ verb: 'Submit to firm', toSide: 'firm', newStatus: 'reviewing', primary: true });
                break;
              case 'reviewing':
              case 'in_progress':
                handoffButtons.push({ verb: 'Recall', toSide: 'client', newStatus: 'to_submit', primary: true });
                break;
              default:
                break;
            }
          } else {
            // firm 视角
            switch (status) {
              case 'to_submit':
              case 'missing_info':
                handoffButtons.push({ verb: 'Take over', toSide: 'firm', newStatus: 'in_progress', primary: true });
                break;
              case 'reviewing':
              case 'in_progress':
                handoffButtons.push({ verb: 'Confirm', toSide: 'firm', newStatus: 'completed', primary: true });
                handoffButtons.push({ verb: 'Return to client', toSide: 'client', newStatus: 'missing_info', primary: false });
                break;
              default:
                break;
            }
          }
        }

        const showStatusVerb = rowIdShowingStatusVerb === node.id && handoffButtons.length > 0;

        const statusColContent = nodeIsBlocked
          ? (
            // 锁定阶段：只显示 Pending 灰色 pill，不暴露内部状态
            isTask ? (
              <View style={[ts.statusPill, ts.statusPillPending]}>
                <Text style={ts.statusPillPendingText}>Pending</Text>
              </View>
            ) : null
          )
          : showStatusVerb
            ? (
              <View style={ts.statusActionsRow}>
                {handoffButtons.map((btn) => (
                  <TouchableOpacity
                    key={btn.verb}
                    style={btn.primary !== false ? ts.statusActionBtn : ts.statusActionBtnSecondary}
                    onPress={() => {
                      setRowIdShowingStatusVerb?.(null);
                      onHandoffTask?.(node.id, node.type, btn.toSide, btn.verb, btn.newStatus);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={ts.statusPillText} numberOfLines={1}>
                      {btn.verb}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )
            : showStatus
              ? (
              <View style={[ts.statusPill, { backgroundColor: getStatusColor(status, node.type, viewerRole) }]}>
                <Text style={ts.statusPillText} numberOfLines={1}>
                  {getStatusLabel(status, node.type, viewerRole)}
                </Text>
              </View>
              )
              : null;

        const onCollapsePress = hasChildren ? () => onToggleCollapse(node.id) : undefined;
        // 行级“显示操作”标记：仅由各自热区控制（Zone1 / Zone2 / Zone3），不再从标题点击透传
        const showRowIconsOnTouchStart = setRowIdShowingAdd
          ? () => {
              if (hideAddTimeoutRef?.current) {
                clearTimeout(hideAddTimeoutRef.current);
                hideAddTimeoutRef.current = null;
              }
              setRowIdShowingAdd(node.id);
            }
          : undefined;
        const showRowIconsOnTouchEnd = setRowIdShowingAdd && hideAddTimeoutRef
          ? () => {
              if (hideAddTimeoutRef.current) clearTimeout(hideAddTimeoutRef.current);
              hideAddTimeoutRef.current = setTimeout(() => setRowIdShowingAdd?.(null), 400);
            }
          : undefined;

        // collapse 行为只挂在 chevron 与 WBS / 标题点击，不再顺带点亮操作按钮
        const collapseHandlers = onCollapsePress
          ? { onPress: onCollapsePress, activeOpacity: 0.85 as const }
          : undefined;

        // 责任方标签放在任务名称前（与标题同一行），不再单独成列
        const roleBadgeInline = isTask && !isCanceled ? (
          <View
            style={[
              ts.roleBadgeInlineWrap,
              ts.roleBadge,
              nodeIsBlocked ? ts.roleBadgePending : (node.type === 'firm' ? ts.roleBadgeFirm : ts.roleBadgeClient),
            ]}
          >
            <Text style={ts.roleBadgeText}>{node.type === 'firm' ? 'Firm' : 'Client'}</Text>
          </View>
        ) : null;

        const titleContentOnly = (
          <View style={ts.treeTitleWrapAdaptive}>
            {roleBadgeInline}
            {nodeIsBlocked && (depth === 0 || depth === 1) ? (
              <Ionicons name="lock-closed-outline" size={11} color="#B2BEC3" style={{ marginRight: 5, marginTop: 1 }} />
            ) : null}
            <Text
              style={[
                ts.treeTitleAdaptive,
                titleStyle,
                isCanceled && ts.treeTitleCanceled,
                nodeIsBlocked && { color: '#B2BEC3' },
              ]}
              numberOfLines={1}
            >
              {node.title}
            </Text>
          </View>
        );

        const WbsCell = collapseHandlers ? (
          <TouchableOpacity style={ts.wbsHotzone} {...collapseHandlers}>
            <Text style={ts.wbsColText} numberOfLines={1}>{wbsCode}</Text>
          </TouchableOpacity>
        ) : (
          <View style={ts.wbsHotzone}>
            <Text style={ts.wbsColText} numberOfLines={1}>{wbsCode}</Text>
          </View>
        );

        const TitleCell = onCollapsePress ? (
          <TouchableOpacity
            style={ts.titleHotzone}
            {...(collapseHandlers as any)}
          >
            {titleContentOnly}
          </TouchableOpacity>
        ) : (
          <View style={ts.titleHotzone}>{titleContentOnly}</View>
        );

        const ADD_ICON_SLOT_WIDTH = 24;
        const AddIconSlot = onStartAddChild && !isTask ? (
          <View style={[ts.addIconSlot, { width: ADD_ICON_SLOT_WIDTH }]} pointerEvents="box-none">
            {addIconInline}
          </View>
        ) : null;

        // 任务前置依赖（仅 task 行）：多选列表，每项用该条目的状态色
        const isDepsOpen = depsPanelNodeId === node.id;
        const depIds = isTask ? ((node as any).dependsOnIds ?? (node.dependsOnId ? [node.dependsOnId] : [])) : [];
        const depChipInfos = depIds.map((depId: string) => {
          const item = phaseAndSectionWithWbs.find((p) => p.id === depId);
          const st = effectiveStatus[depId] ?? 'completed';
          return { depId, wbs: item?.wbs ?? '?', title: item?.title ?? '', status: st };
        });

        const CancelTaskSlot =
          isTask && !isCanceled && onCancelTask && showTaskIcons && !nodeIsBlocked && canCancelRestore ? (
            <Pressable style={ts.terminateTaskBtnHotzone} onPress={() => onCancelTask(node.id)}>
              <View style={ts.terminateTaskBtnIcon}>
                <Ionicons name="remove-circle-outline" size={14} color="#E67E22" />
              </View>
            </Pressable>
          ) : null;

        const RestoreTaskSlot =
          isTask && isCanceled && onRestoreTask && showTaskIcons && !nodeIsBlocked && canCancelRestore ? (
            <Pressable style={ts.restoreTaskBtnHotzone} onPress={() => onRestoreTask(node.id)}>
              <View style={ts.restoreTaskBtnIcon}>
                <Ionicons name="refresh-circle-outline" size={14} color="#7DCEA0" />
              </View>
            </Pressable>
          ) : null;

        const showAddHandlers = showRowIconsOnTouch
          ? {
              onTouchStart: showRowIconsOnTouchStart,
              onTouchEnd: showRowIconsOnTouchEnd,
              onMouseEnter: showRowIconsOnTouchStart,
              onMouseLeave: showRowIconsOnTouchEnd,
            }
          : undefined;

        // zone1：标题列（名称 + 名称右侧空白），整列高度可 hover，触发 + / - / restart
        const TitleColumnWrap = showAddHandlers ? (
          <View style={ts.titleColumnWrap} {...showAddHandlers}>
            {TitleCell}
            {AddIconSlot}
            {CancelTaskSlot}
            {RestoreTaskSlot}
          </View>
        ) : (
          <View style={ts.titleColumnWrap}>
            {TitleCell}
            {AddIconSlot}
            {CancelTaskSlot}
            {RestoreTaskSlot}
          </View>
        );

        // chevron 始终可点击以收起/展开（zone 0），不再依赖整行 hover
        const chevronBtn = hasChildren ? (
          onCollapsePress ? (
            <Pressable style={ts.chevronWrap} onPress={onCollapsePress} hitSlop={6}>
              <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={14} color="#636E72" />
            </Pressable>
          ) : (
            <View style={ts.chevronWrap}>
              <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={14} color="#636E72" />
            </View>
          )
        ) : (
          <View style={ts.chevronWrap} />
        );

        const IndentChevronShowAddArea = (
          <>
            <View style={{ width: 12 + indent }} />
            {chevronBtn}
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
          <View style={[ts.treeRowLeftBlock, { width: maxLeftBlockWidth }]}>
            {leftBlockContent}
          </View>
        );

        const ProgressCell = collapseHandlers ? (
          <TouchableOpacity style={ts.progressFilesCol} {...collapseHandlers}>
            {progressColContent}
          </TouchableOpacity>
        ) : (
          progressColContent
        );

        // 状态列（Zone3）：整列为 hover 热区，高度覆盖整行
        const statusHoverHandlers = handoffButtons.length > 0 && setRowIdShowingStatusVerb
          ? {
              onMouseEnter: () => setRowIdShowingStatusVerb(node.id),
              onMouseLeave: () => setRowIdShowingStatusVerb(null),
              onTouchStart: () => setRowIdShowingStatusVerb(node.id),
              onTouchEnd: () => setRowIdShowingStatusVerb(null),
            }
          : undefined;

        const StatusCell = (
          <View style={ts.statusColWithGap}>
            <View style={ts.statusCol} {...(statusHoverHandlers as any)}>{statusColContent}</View>
          </View>
        );

        // 当前登录方负责的 task：左侧 accent 线凸显（锁定 / 取消 状态不显示）
        const crossRoleAccent = !nodeIsBlocked && isSelfTodo && isTask && !isCanceled
          ? { borderLeftColor: node.type === 'firm' ? '#A29BFE' : '#74B9FF' }
          : {};
        const rowContainerStyle = [
          ts.treeRow,
          { backgroundColor: rowBg },
          node.itemKind === 'section' && { borderTopWidth: 1, borderTopColor: '#E9ECEF' },
          crossRoleAccent,
        ];

        // task 行前置依赖列：文案 "Depends on" + 多标签（每标签用该条目状态色）+ 入口
        const showDepsControls = depsControlsNodeId === node.id;
        const TaskDepsCol = isTask ? (
          <Pressable
            style={ts.taskDepsCol}
            onHoverIn={() => setDepsControlsNodeId(node.id)}
            onHoverOut={() => {
              setDepsControlsNodeId(null);
              setActiveDepChipId(null);
            }}
            onTouchStart={() => setDepsControlsNodeId(node.id)}
            onTouchEnd={() => {
              setDepsControlsNodeId(null);
              setActiveDepChipId(null);
            }}
            onPress={() => {
              if (depChipInfos.length > 0 || showDepsControls) {
                setDepsPanelNodeId(isDepsOpen ? null : node.id);
              }
            }}
          >
            {(depChipInfos.length > 0 || showDepsControls) && (
              <Text style={ts.taskDepsLabel}>Depends on</Text>
            )}
            {depChipInfos.length > 0 ? (
              <View style={ts.taskDepsChipsWrap}>
                {depChipInfos.map((info: { depId: string; wbs: string; title: string; status: string }) => {
                  const { text, bg } = getDepStatusColor(info.status);
                  return (
                    <View
                      key={info.depId}
                      style={[ts.taskDepsChip, { backgroundColor: bg }]}
                    >
                      <Text style={[ts.taskDepsChipText, { color: text }]}>{info.wbs}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {!nodeIsBlocked && showDepsControls && (
              <View style={ts.taskDepsTrigger}>
                <Ionicons name="add-circle-outline" size={12} color="#B2BEC3" />
              </View>
            )}
          </Pressable>
        ) : null;

        const rowContent = (
          <>
            {leftBlockFull}
            <View style={ts.treeRowRightColsWrap}>
              {ProgressCell}
              {StatusCell}
              {TaskDepsCol}
            </View>
          </>
        );

        return (
          <View key={node.id} style={ts.treeRowWrap}>
            <View style={rowContainerStyle}>
              {rowContent}
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
                viewerRole={viewerRole}
                blockedNodes={blockedNodes}
                isBlocked={nodeIsBlocked}
                allNodesFlat={allNodesFlat}
                depsPanelNodeId={depsPanelNodeId}
                setDepsPanelNodeId={setDepsPanelNodeId}
                onSetDependsOn={onSetDependsOn}
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
                onHandoffTask={onHandoffTask}
                phaseAndSectionWithWbs={phaseAndSectionWithWbs}
                rowFileColHoverId={rowFileColHoverId}
                setRowFileColHoverId={setRowFileColHoverId}
                hideFileColTimeoutRef={hideFileColTimeoutRef}
                rowIdShowingStatusVerb={rowIdShowingStatusVerb}
                setRowIdShowingStatusVerb={setRowIdShowingStatusVerb}
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
              <View style={[ts.filesBlock, { marginLeft: 12 + indent + 24 }]}>
                {files.length === 0 ? (
                  <Text style={ts.filesEmpty}>No files linked yet</Text>
                ) : (
                  <View style={ts.attachmentCardsWrap}>
                    {(files as ProjectTodoReceiptSummary[]).map((f) => (
                      <TouchableOpacity
                        key={f.id}
                        style={ts.attachmentCard}
                        onPress={() => onFilePress?.(f.id)}
                        activeOpacity={0.8}
                      >
                        <View style={ts.attachmentCardTop}>
                          {f.imageUrl ? (
                            <Image source={{ uri: f.imageUrl }} style={ts.attachmentCardThumb} resizeMode="cover" />
                          ) : (
                            <View style={[ts.attachmentCardThumb, ts.attachmentCardThumbPlaceholder]}>
                              <Ionicons name="document-outline" size={20} color="#95A5A6" />
                            </View>
                          )}
                          <View style={ts.attachmentCardBody}>
                            {f.docType ? (
                              <View style={ts.attachmentCardDocType}>
                                <Text style={ts.attachmentCardDocTypeText} numberOfLines={1}>{f.docType}</Text>
                              </View>
                            ) : f.status === 'PENDING_AI' ? (
                              <Text style={ts.attachmentCardPending}>Processing…</Text>
                            ) : null}
                            <Text style={ts.attachmentCardSummary} numberOfLines={2}>{f.name || 'Attachment'}</Text>
                            {(f.extractedPreview?.length ?? 0) > 0 && (
                              <View style={ts.attachmentCardPreview}>
                                {f.extractedPreview!.slice(0, 4).map((p, i) => (
                                  <Text key={i} style={ts.attachmentCardPreviewLine} numberOfLines={1}>
                                    {p.label}: {p.value}
                                  </Text>
                                ))}
                              </View>
                            )}
                          </View>
                          <View style={ts.attachmentCardTrailing}>
                            {onRemoveFile ? (
                              <Pressable
                                style={ts.fileRowRemoveBtn}
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

// ──────────────────────────────────────────────────
// Public Props & Wrapper
// ──────────────────────────────────────────────────

export interface TaxFilingTodosViewProps {
  /** 当前已加载的 todos 树（父组件持有） */
  tree: ProjectTodoNode[];
  orderId: string;
  /** 文件上传时的存储路径 space，firm 侧传 client 的 space_id */
  clientSpaceId: string;
  /**
   * 当前查看者角色：决定状态文案语义和操作权限。
   *   'client' — client 用户，只有自己归属(type=client)的 todo 可完整操作
   *   'firm'   — firm 用户，可操作全部，client todos 显示等待状态文案
   */
  viewerRole: 'client' | 'firm';
  /** 点击附件卡片时的跳转处理（留 undefined 则仅展示不可点击） */
  onFilePress?: (attachmentId: string) => void;
  /** 任何操作后父级刷新树（addChild / cancelTask 等） */
  onRefresh: () => Promise<void>;
  createProjectTodo: (params: {
    orderId: string;
    parentId?: string | null;
    type: 'client' | 'firm';
    title: string;
    description?: string | null;
    sortOrder?: number;
  }) => Promise<{ id: string | null; error: Error | null }>;
}

export function TaxFilingTodosView({
  tree,
  orderId,
  clientSpaceId,
  viewerRole,
  onFilePress,
  onRefresh,
  createProjectTodo,
}: TaxFilingTodosViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [taskFilesExpanded, setTaskFilesExpanded] = useState<Set<string>>(new Set());
  const [taskFilesMap, setTaskFilesMap] = useState<Record<string, ProjectTodoReceiptSummary[]>>({});

  const [rowIdShowingAdd, setRowIdShowingAdd] = useState<string | null>(null);
  const [addIconHighlightedRowId, setAddIconHighlightedRowId] = useState<string | null>(null);
  const [pendingParentId, setPendingParentId] = useState<string | null>(null);
  const hideAddTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // zone2：文件计数列 hover/触摸时显示 Upload 按钮
  const [rowFileColHoverId, setRowFileColHoverId] = useState<string | null>(null);
  const hideFileColTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // zone3：状态标签点击后，状态 pill 变为动词按钮
  const [rowIdShowingStatusVerb, setRowIdShowingStatusVerb] = useState<string | null>(null);
  const [depsPanelNodeId, setDepsPanelNodeId] = useState<string | null>(null);
  /** 前置多选浮窗内勾选的前置 ID 列表（None 外可多选；持久化仍用首项） */
  const [depsPickerSelectedIds, setDepsPickerSelectedIds] = useState<string[]>([]);
  const [handoffDraft, setHandoffDraft] = useState<{
    todoId: string;
    fromSide: 'client' | 'firm';
    toSide: 'client' | 'firm';
    verb: string;
    note: string;
    newStatus?: ProjectTodoNode['status'];
  } | null>(null);

  // 初始化/树变化时加载附件
  useEffect(() => {
    const taskIds = collectTaskIds(tree);
    if (taskIds.length === 0) { setTaskFilesMap({}); return; }
    getAttachmentsByProjectTodoIds(taskIds).then(setTaskFilesMap).catch(() => {});
  }, [tree]);

  const nodeStats = useNodeStats(tree);

  /** 扁平化全树节点，供状态计算 / 阻塞判断使用 */
  const allNodesFlat = useMemo<ProjectTodoNode[]>(() => {
    const result: ProjectTodoNode[] = [];
    const walk = (nodes: ProjectTodoNode[]) => {
      nodes.forEach((n) => { result.push(n); walk(n.children); });
    };
    walk(tree);
    return result;
  }, [tree]);

  /** 全树节点 id → WBS 编号（与表格列展示一致），供依赖浮窗标题等使用 */
  const allNodesWbsMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    tree.forEach((root, phaseIndex) => {
      const rootWbs = String(phaseIndex + 1);
      map[root.id] = rootWbs;
      const walk = (nodes: ProjectTodoNode[], prefix: string) => {
        nodes.forEach((node, idx) => {
          const wbs = `${prefix}.${idx + 1}`;
          map[node.id] = wbs;
          walk(node.children, wbs);
        });
      };
      walk(root.children, rootWbs);
    });
    return map;
  }, [tree]);

  /** 所有 phase / section 节点及其 WBS 编号，供任务前置依赖选单使用 */
  const phaseAndSectionWithWbs = useMemo<{ id: string; wbs: string; title: string }[]>(() => {
    const result: { id: string; wbs: string; title: string }[] = [];
    tree.forEach((phase, pi) => {
      const phaseWbs = String(pi + 1);
      result.push({ id: phase.id, wbs: phaseWbs, title: phase.title });
      phase.children.forEach((section, si) => {
        result.push({ id: section.id, wbs: `${phaseWbs}.${si + 1}`, title: section.title });
      });
    });
    return result;
  }, [tree]);

  /** 按 phase 分组的列表（浮窗内 section 缩进展示） */
  const depsPickerGrouped = useMemo(() => {
    const groups: { phase: { id: string; wbs: string; title: string }; sections: { id: string; wbs: string; title: string }[] }[] = [];
    phaseAndSectionWithWbs.forEach((item) => {
      if (item.wbs.indexOf('.') === -1) {
        groups.push({ phase: item, sections: [] });
      } else {
        if (groups.length > 0) groups[groups.length - 1].sections.push(item);
      }
    });
    return groups;
  }, [phaseAndSectionWithWbs]);

  // 打开前置浮窗时同步勾选状态（多选）；关闭时清空
  useEffect(() => {
    if (depsPanelNodeId) {
      const node = allNodesFlat.find((n) => n.id === depsPanelNodeId);
      const ids = (node as any)?.dependsOnIds ?? (node?.dependsOnId ? [node.dependsOnId] : []);
      setDepsPickerSelectedIds(Array.isArray(ids) ? ids : []);
    } else {
      setDepsPickerSelectedIds([]);
    }
  }, [depsPanelNodeId, allNodesFlat]);

  /**
   * 依赖锁定：当存在前置且任一前置的 effectiveStatus 非 completed/canceled 时为阻塞。
   * 被依赖项都 completed 或 canceled 则取消 pending，显示正常状态。
   */
  const blockedNodes = useMemo<Set<string>>(() => {
    const blocked = new Set<string>();
    const { effectiveStatus } = nodeStats;

    const allNodes = new Map<string, ProjectTodoNode>();
    function flattenAll(nodes: ProjectTodoNode[]) {
      nodes.forEach((n) => {
        allNodes.set(n.id, n);
        flattenAll(n.children);
      });
    }
    flattenAll(tree);

    const isBlocked = (nodeId: string, visited = new Set<string>()): boolean => {
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      const node = allNodes.get(nodeId);
      const depIds = (node as any)?.dependsOnIds ?? (node?.dependsOnId != null ? [node.dependsOnId!] : []);
      if (!depIds.length) return false;
      for (const depId of depIds) {
        const depStatus = effectiveStatus[depId];
        if (depStatus !== 'completed' && depStatus !== 'canceled') return true;
        if (isBlocked(depId, visited)) return true;
      }
      return false;
    };

    allNodes.forEach((_, id) => {
      if (isBlocked(id)) blocked.add(id);
    });

    return blocked;
  }, [tree, nodeStats]);

  // 被锁定的节点默认折叠（仅 phase/section 层）
  useEffect(() => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      tree.forEach((phase) => {
        if (blockedNodes.has(phase.id)) next.add(phase.id);
        phase.children.forEach((section) => {
          if (blockedNodes.has(section.id)) next.add(section.id);
        });
      });
      return next;
    });
  }, [blockedNodes, tree]);

  const maxLeftBlockWidth = useMemo(() => {
    let maxW = 0;
    function walk(nodes: ProjectTodoNode[], d: number) {
      nodes.forEach((n) => {
        const indent = 12 + d * 14;
        const titleLen = (n.title ?? '').length;
        // 预留：chevron(28) + WBS(36) + 责任方标签(≈60) + 标题 + 额外留白(24)
        const w = indent + 28 + 36 + 60 + titleLen * 8 + 24;
        if (w > maxW) maxW = w;
        walk(n.children, d + 1);
      });
    }
    walk(tree, 0);
    const minW = 190;
    const cap = Math.floor(Dimensions.get('window').width * 0.82 - 32) - 52;
    return Math.min(Math.max(maxW, minW), cap);
  }, [tree]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleTaskFiles = useCallback((id: string) => {
    setTaskFilesExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSetDependsOn = useCallback(async (nodeId: string, dependsOnIds: string[] | null) => {
    const ids = dependsOnIds?.length ? dependsOnIds : null;
    const { error } = await updateProjectTodoDependsOn(nodeId, ids);
    if (error) {
      if (Platform.OS === 'web') window.alert('Failed to update dependency: ' + error.message);
      else Alert.alert('Error', error.message);
      return;
    }
    setDepsPanelNodeId(null);
    await onRefresh();
  }, [onRefresh]);

  const refreshFiles = useCallback(async (currentTree: ProjectTodoNode[]) => {
    const taskIds = collectTaskIds(currentTree);
    if (taskIds.length > 0) {
      const filesMap = await getAttachmentsByProjectTodoIds(taskIds);
      setTaskFilesMap(filesMap);
    }
  }, []);

  const onStartAddChild = useCallback((parentId: string) => {
    if (hideAddTimeoutRef.current) { clearTimeout(hideAddTimeoutRef.current); hideAddTimeoutRef.current = null; }
    setRowIdShowingAdd(null);
    setAddIconHighlightedRowId(null);
    setPendingParentId(parentId);
  }, []);

  const onConfirmAddChild = useCallback(async (parentId: string, parentType: ProjectTodoNode['type'], title: string) => {
    const trimmed = (title ?? '').trim();
    if (!trimmed) { setPendingParentId(null); return; }
    try {
      const { error: err } = await createProjectTodo({ orderId, parentId, type: parentType, title: trimmed });
      if (err) {
        const msg = err.message ?? 'Could not create item.';
        if (Platform.OS === 'web') window.alert('Save failed: ' + msg);
        else Alert.alert('Save failed', msg);
        return;
      }
      setPendingParentId(null);
      setCollapsed((prev) => { const next = new Set(prev); next.delete(parentId); return next; });
      await onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (Platform.OS === 'web') window.alert('Save failed: ' + msg);
      else Alert.alert('Save failed', msg);
    }
  }, [orderId, createProjectTodo, onRefresh]);

  const onCancelAddChild = useCallback(() => setPendingParentId(null), []);

  const onCancelTask = useCallback(async (todoId: string) => {
    const { error: err } = await updateProjectTodo(todoId, { status: 'canceled' });
    if (err) {
      if (Platform.OS === 'web') window.alert('Cancel failed: ' + (err.message ?? ''));
      else Alert.alert('Cancel failed', err.message ?? '');
      return;
    }
    await onRefresh();
  }, [onRefresh]);

  const onRestoreTask = useCallback(async (todoId: string) => {
    const { error: err } = await updateProjectTodo(todoId, { status: 'to_submit' });
    if (err) {
      if (Platform.OS === 'web') window.alert('Restore failed: ' + (err.message ?? ''));
      else Alert.alert('Restore failed', err.message ?? '');
      return;
    }
    await onRefresh();
  }, [onRefresh]);

  /** 单任务责任人流转：按附图改责任方 + 状态；先弹浮窗收集可选 note */
  const onHandoffTask = useCallback(
    (todoId: string, fromSide: 'client' | 'firm', toSide: 'client' | 'firm', verb: string, newStatus?: ProjectTodoNode['status']) => {
      setHandoffDraft({
        todoId,
        fromSide,
        toSide,
        verb,
        note: '',
        newStatus,
      });
    },
    [],
  );

  const onUploadFile = useCallback(async (todoId: string) => {
    try {
      const { status } = await (ImagePicker.requestMediaLibraryPermissionsAsync?.() ?? Promise.resolve({ status: 'granted' }));
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
      const imageUrl = await uploadTaxFilingFile(imageUri, `order-task-${Date.now()}`, clientSpaceId);
      const createResult = await createProjectTodoAttachment(todoId, imageUrl, { status: 'PENDING_AI' });
      if ('error' in createResult) {
        const errMsg = createResult.error instanceof Error ? createResult.error.message : String(createResult.error);
        if (Platform.OS === 'web') window.alert('Link failed: ' + errMsg);
        else Alert.alert('Link failed', errMsg);
        return;
      }
      await onRefresh();
      setTaskFilesExpanded((prev) => new Set(prev).add(todoId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (Platform.OS === 'web') window.alert('Upload failed: ' + msg);
      else Alert.alert('Upload failed', msg);
    }
  }, [clientSpaceId, onRefresh]);

  const onRemoveFile = useCallback(async (todoId: string, attachmentId: string) => {
    const { error } = await deleteProjectTodoAttachment(attachmentId);
    if (error) {
      if (Platform.OS === 'web') window.alert('Remove failed: ' + (error.message ?? ''));
      else Alert.alert('Remove failed', error.message ?? '');
      return;
    }
    await refreshFiles(tree);
  }, [tree, refreshFiles]);

  if (tree.length === 0) {
    return (
      <View style={ts.root}>
        <View style={ts.emptyWrap}>
          <Text style={ts.emptyText}>No tasks yet</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={ts.root}>
      <ScrollView style={ts.scroll} contentContainerStyle={ts.scrollContent}>
        <View style={ts.phaseBlocksWrap}>
          {tree.map((phaseNode, phaseIndex) => (
            <View key={phaseNode.id} style={ts.phaseBlock}>
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
                viewerRole={viewerRole}
                blockedNodes={blockedNodes}
                isBlocked={blockedNodes.has(phaseNode.id)}
                allNodesFlat={allNodesFlat}
                depsPanelNodeId={depsPanelNodeId}
                setDepsPanelNodeId={setDepsPanelNodeId}
                onSetDependsOn={handleSetDependsOn}
                onToggleCollapse={toggleCollapse}
                onToggleTaskFiles={toggleTaskFiles}
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
                onHandoffTask={onHandoffTask}
                phaseAndSectionWithWbs={phaseAndSectionWithWbs}
                rowFileColHoverId={rowFileColHoverId}
                setRowFileColHoverId={setRowFileColHoverId}
                hideFileColTimeoutRef={hideFileColTimeoutRef}
                rowIdShowingStatusVerb={rowIdShowingStatusVerb}
                setRowIdShowingStatusVerb={setRowIdShowingStatusVerb}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 前置依赖选单浮窗：section 缩进列表，None 外可多选（持久化取首项） */}
      {depsPanelNodeId && (() => {
        const currentNode = allNodesFlat.find((n) => n.id === depsPanelNodeId);
        if (!currentNode) return null;
        const toggleSection = (id: string) => {
          setDepsPickerSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
          );
        };
        const togglePhase = (phaseId: string, sectionIds: string[]) => {
          setDepsPickerSelectedIds((prev) => {
            const hasPhase = prev.includes(phaseId);
            let next = prev.filter((x) => x !== phaseId && !sectionIds.includes(x));
            if (!hasPhase) next = [...next, phaseId];
            return next;
          });
        };
        const onConfirmDeps = () => {
          handleSetDependsOn(depsPanelNodeId, depsPickerSelectedIds.length > 0 ? depsPickerSelectedIds : null);
        };
        return (
          <View style={ts.depsPickerOverlay} pointerEvents="box-none">
            <Pressable
              style={ts.depsPickerBackdrop}
              onPress={() => setDepsPanelNodeId(null)}
            />
            <View style={ts.depsPickerCard}>
              <Text style={ts.depsPickerTitle} numberOfLines={2}>{allNodesWbsMap[currentNode.id] ?? ''}  {currentNode.title}</Text>
              <Text style={ts.depsPickerSubtitle} numberOfLines={2}>
                depends on the completion of following sections:
              </Text>
              <Pressable
                style={[ts.depsPickerRow, ts.depsPickerNoneRow, depsPickerSelectedIds.length === 0 && ts.depsPickerRowActive]}
                onPress={() => {
                  // 仅更新本地选择，为空表示「None」，实际提交仍走 Done 按钮
                  setDepsPickerSelectedIds([]);
                }}
              >
                <Text style={[ts.depsPickerRowText, depsPickerSelectedIds.length === 0 && ts.depsPickerRowTextActive]}>None</Text>
              </Pressable>
              <ScrollView style={ts.depsPickerList} nestedScrollEnabled>
                {depsPickerGrouped.map((group) => {
                  const phaseSelected = depsPickerSelectedIds.includes(group.phase.id);
                  const sectionIds = group.sections.map((s) => s.id);
                  return (
                  <View key={group.phase.id} style={ts.depsPickerGroup}>
                    <Pressable
                      style={[ts.depsPickerRow, ts.depsPickerPhaseRow, phaseSelected && ts.depsPickerRowActive]}
                      onPress={() => togglePhase(group.phase.id, sectionIds)}
                    >
                      <Text style={[ts.depsPickerPhaseText, phaseSelected && ts.depsPickerRowTextActive]}>
                        {group.phase.wbs}  {group.phase.title}
                      </Text>
                      {phaseSelected ? <Ionicons name="checkmark-circle" size={16} color="#6C5CE7" /> : null}
                    </Pressable>
                    {group.sections.map((sec) => {
                      const selected = depsPickerSelectedIds.includes(sec.id);
                      return (
                        <Pressable
                          key={sec.id}
                          style={[ts.depsPickerRow, ts.depsPickerSectionRow, selected && ts.depsPickerRowActive]}
                          onPress={() => toggleSection(sec.id)}
                        >
                          <Text style={[ts.depsPickerRowText, selected && ts.depsPickerRowTextActive]} numberOfLines={1}>
                            {sec.wbs}  {sec.title}
                          </Text>
                          {selected ? <Ionicons name="checkmark-circle" size={16} color="#6C5CE7" /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  );
                })}
              </ScrollView>
              <TouchableOpacity style={ts.depsPickerDoneBtn} onPress={onConfirmDeps}>
                <Text style={ts.depsPickerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {handoffDraft && (
        <View style={ts.handoffOverlay} pointerEvents="box-none">
          <Pressable
            style={ts.handoffOverlayBackdrop}
            onPress={() => setHandoffDraft(null)}
          />
          <View style={ts.handoffCard}>
            <Text style={ts.handoffTitle}>{handoffDraft.verb}</Text>
            <Text style={ts.handoffSubtitle}>Add a note (optional)</Text>
            <TextInput
              style={ts.handoffInput}
              value={handoffDraft.note}
              onChangeText={(text) =>
                setHandoffDraft((prev) => (prev ? { ...prev, note: text } : prev))
              }
              multiline
              placeholder="Say something..."
              placeholderTextColor="#B2BEC3"
            />
            <View style={ts.handoffActions}>
              <TouchableOpacity
                style={ts.handoffSecondaryBtn}
                onPress={() => setHandoffDraft(null)}
              >
                <Text style={ts.handoffSecondaryText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ts.handoffPrimaryBtn}
                onPress={async () => {
                  if (!handoffDraft) return;
                  const { error } = await changeProjectTodoResponsibleSide({
                    todoId: handoffDraft.todoId,
                    fromSide: handoffDraft.fromSide,
                    toSide: handoffDraft.toSide,
                    note: handoffDraft.note,
                    newStatus: handoffDraft.newStatus,
                  });
                  if (error) {
                    if (Platform.OS === 'web') window.alert(error.message ?? 'Update failed');
                    else Alert.alert('Update failed', error.message ?? '');
                    return;
                  }
                  setHandoffDraft(null);
                  await onRefresh();
                }}
              >
                <Text style={ts.handoffPrimaryText}>Confirm submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ──────────────────────────────────────────────────
// Styles（以 client 端 project-todos 为基准：tax-filing/project/[projectId]，与 index 完全一致）
// ──────────────────────────────────────────────────

const ts = StyleSheet.create({
  root: { flex: 1, position: 'relative' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
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
  treeRowWrap: {},
  treeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 4,
    paddingRight: 12,
    paddingLeft: 4,
    minHeight: 40,
    flexWrap: 'nowrap',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  rowShowAddWrap: { flex: 1, flexDirection: 'row', alignItems: 'stretch', minWidth: 0, cursor: 'pointer' } as any,
  rowShowAddInner: { flex: 1, flexDirection: 'row', alignItems: 'stretch', minWidth: 0 },
  treeRowLeftBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    minWidth: 0,
    marginRight: 24,
  },
  treeRowRightColsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
    flexShrink: 0,
  },
  statusColWithGap: {
    marginLeft: 12,
    marginRight: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  showAddTouchArea: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', cursor: 'pointer' } as any,
  chevronWrap: { width: 28, alignItems: 'center', justifyContent: 'center' },
  wbsHotzone: { width: 36, marginRight: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  titleColumnWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  titleColumnTrailing: { flex: 1, minWidth: 0, cursor: 'pointer' } as any,
  titleHotzone: { alignSelf: 'stretch', justifyContent: 'center', flexShrink: 0 },
  treeTitleWrapAdaptive: { flexDirection: 'row', alignItems: 'center' },
  treeTitleAdaptive: { fontSize: 15, color: '#2D3436' },
  treeTitleCanceled: { textDecorationLine: 'line-through', color: '#95A5A6' },
  terminateTaskBtnHotzone: { alignSelf: 'stretch', justifyContent: 'center', marginLeft: 2, cursor: 'pointer', minWidth: 20 } as any,
  restoreTaskBtnHotzone: { alignSelf: 'stretch', justifyContent: 'center', marginLeft: 2, cursor: 'pointer', minWidth: 20 } as any,
  terminateTaskBtnIcon: { height: 20, width: 20, justifyContent: 'center', alignItems: 'center', transform: [{ translateY: 1 }] },
  restoreTaskBtnIcon: { height: 20, width: 20, justifyContent: 'center', alignItems: 'center', transform: [{ translateY: 1 }] },
  addIconSlot: { width: 24, height: 20, justifyContent: 'center', alignItems: 'center' },
  wbsColText: { fontSize: 11, color: '#95A5A6', fontWeight: '500' },
  titleColumnTrailingInner: { flex: 1, minWidth: 0 },
  addChildBtn: { padding: 0, marginLeft: 0, marginTop: 2 },
  pendingAddRow: { minHeight: 40 },
  pendingAddInputRow: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0, gap: 6 },
  pendingAddInput: {
    flex: 1,
    fontSize: 14,
    color: '#2D3436',
    paddingVertical: 2,
    paddingHorizontal: 0,
    minHeight: 24,
    minWidth: 60,
    borderWidth: 0,
  },
  cancelAddBtn: { padding: 2, marginRight: 2, minWidth: 28, minHeight: 28, justifyContent: 'center', alignItems: 'center', cursor: 'pointer' } as any,
  confirmAddBtn: { padding: 2, minWidth: 28, minHeight: 28, justifyContent: 'center', alignItems: 'center', cursor: 'pointer' } as any,
  treeTitleL0: { fontWeight: '700', fontSize: 15, color: '#2D3436' },
  treeTitleL1: { fontWeight: '600', fontSize: 14, color: '#2D3436' },
  treeTitleL2: { fontWeight: '500', fontSize: 13, color: '#636E72' },
  progressFilesCol: {
    width: 80,
    minWidth: 80,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  progressFilesColInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 4 },
  uploadTaskBtnHotzone: { alignSelf: 'stretch', justifyContent: 'center', cursor: 'pointer' } as any,
  uploadTaskBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20, maxHeight: 20, paddingVertical: 0, paddingHorizontal: 5, backgroundColor: '#6C5CE7', borderRadius: 4, justifyContent: 'center' },
  uploadTaskBtnText: { fontSize: 10, color: '#FFF', fontWeight: '600' },
  nmText: { fontSize: 12, color: '#636E72' },
  statusCol: {
    width: 120,
    minWidth: 120,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  statusPillText: { fontSize: 11, color: '#FFF', fontWeight: '600' },
  statusPillPending: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: 'rgba(99,110,114,0.58)' },
  statusPillPendingText: { fontSize: 11, color: '#FFF', fontWeight: '700' },
  statusActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  statusActionBtn: {
    height: 30,
    paddingHorizontal: 12,
    paddingVertical: 0,
    borderRadius: 6,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.32,
    shadowRadius: 4,
    elevation: 4,
  },
  statusActionBtnSecondary: {
    height: 30,
    paddingHorizontal: 12,
    paddingVertical: 0,
    borderRadius: 6,
    backgroundColor: 'rgba(108, 92, 231, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.26,
    shadowRadius: 4,
    elevation: 4,
  },
  filesToggle: { flexDirection: 'row', alignItems: 'center' },
  filesToggleText: { fontSize: 12, color: '#6C5CE7', marginLeft: 2 },
  filesBlock: { paddingVertical: 8, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  filesEmpty: { fontSize: 13, color: '#95A5A6', fontStyle: 'italic' },
  attachmentCardsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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
  attachmentCardThumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#F1F5F9' },
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
  fileRowRemoveBtn: { width: 20, height: 20, justifyContent: 'center', alignItems: 'center', cursor: 'pointer' } as any,
  // ── task 行前置依赖列（状态标签之后，行内 WBS 标签 + 浮窗触发器）──
  depsIconBtn: { width: 20, height: 16, alignItems: 'center', justifyContent: 'center' },
  taskDepsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
    marginLeft: 12,
    minWidth: 100,
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
  },
  taskDepsLabel: {
    fontSize: 10,
    color: '#95A5A6',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  taskDepsChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
  },
  taskDepsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(108,92,231,0.09)',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    position: 'relative',
  },
  taskDepsChipText: {
    fontSize: 10,
    color: '#6C5CE7',
    fontWeight: '700',
    minWidth: 26, // ≈ 3 个字符宽度
    textAlign: 'center',
  },
  taskDepsChipRemoveBadge: {
    position: 'absolute',
    right: 1,
    top: '50%',
    marginTop: -7.5, // 让 14px 高度的圆形垂直居中
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E0E4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskDepsTrigger: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },

  // ── 前置依赖浮窗选单 ──
  depsPickerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  depsPickerBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  depsPickerCard: {
    maxWidth: 420,
    width: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  depsPickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2D3436',
    marginTop: 4,
    marginBottom: 10,
    lineHeight: 22,
  },
  depsPickerSubtitle: {
    fontSize: 12,
    color: '#95A5A6',
    fontWeight: '400',
    marginBottom: 14,
  },
  depsPickerList: { maxHeight: 460, marginBottom: 12 },
  depsPickerGroup: { marginBottom: 4 },
  // 统一 phase 行与普通行的高度和左右内距
  depsPickerPhaseRow: { paddingVertical: 8, paddingHorizontal: 10 },
  depsPickerPhaseText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: '#2D3436',
  },
  depsPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#F8F9FA',
    marginBottom: 2,
  },
  depsPickerNoneRow: { marginTop: 2, marginBottom: 8 },
  depsPickerSectionRow: { marginLeft: 16 },
  depsPickerRowActive: { borderColor: '#6C5CE7', backgroundColor: 'rgba(108,92,231,0.08)' },
  depsPickerRowText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#636E72',
    fontWeight: '500',
    flex: 1,
  },
  // 选中时仅改变颜色，不改变字号和行高
  depsPickerRowTextActive: {
    color: '#6C5CE7',
  },
  depsPickerDoneBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
  },
  depsPickerDoneText: { fontSize: 13, color: '#FFF', fontWeight: '600' },
  depsPickerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  depsPickerChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9B9F9',
    backgroundColor: '#fff',
    maxWidth: 240,
  },
  depsPickerChipActive: { borderColor: '#6C5CE7', backgroundColor: '#6C5CE7' },
  depsPickerChipText: { fontSize: 12, color: '#636E72', fontWeight: '500' },
  depsPickerChipTextActive: { color: '#fff', fontWeight: '700' },

  // ── 责任方标签（现放在任务名称前，与标题同行） ──
  roleBadgeInlineWrap: { marginRight: 4 },
  roleCol: {
    width: 80,
    minWidth: 80,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  roleBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 12,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    minWidth: 52,
    height: 20,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBadgeFirm:   { backgroundColor: 'rgba(162, 155, 254, 0.2)' },  // 紫色系（firm task）
  roleBadgeClient: { backgroundColor: 'rgba(116, 185, 255, 0.25)' }, // 蓝色系（client task）
  roleBadgePending: { backgroundColor: 'rgba(149, 165, 166, 0.35)' }, // 灰色系（pending 被依赖锁定）
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#636E72',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  handoffBtn: { paddingVertical: 6, paddingHorizontal: 8, minWidth: 44 },
  handoffBtnText: { fontSize: 10, color: '#6C5CE7', fontWeight: '600' },

  // ── 责任流转浮窗（收集可选 note） ──
  handoffOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  handoffOverlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  handoffCard: {
    maxWidth: 360,
    width: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  handoffTitle: { fontSize: 15, fontWeight: '600', color: '#2D3436', marginBottom: 6 },
  handoffSubtitle: { fontSize: 12, color: '#636E72', marginBottom: 10 },
  handoffInput: {
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E4F0',
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    color: '#2D3436',
    marginBottom: 12,
  },
  handoffActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  handoffSecondaryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  handoffSecondaryText: {
    fontSize: 13,
    color: '#636E72',
  },
  handoffPrimaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#6C5CE7',
  },
  handoffPrimaryText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
