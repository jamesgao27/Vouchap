/**
 * 项目/订单详情统一界面：client 的 project 详情与 firm 的 order 详情共用。
 * 同一套布局与样式，仅根据 viewerRole 做少量差异（header 副标题/状态 pill、操作栏右侧按钮、onboarding 内容）。
 */
import { useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TaxFilingTodosView } from '@/components/TaxFilingTodosView';
import { ProjectInfoTab, type ProjectInfoTabHandle } from '../app/tax-filing/project/[projectId]/info';
import type { ProjectTodoNode } from '@/lib/firm';
import type { FirmSkuItem } from '@/types';
import type { ProjectSkuInfo, TodoRow } from '@/components/ProjectSkuDetail';

/** 将 sku_items 转为 TaxFilingTodosView 所需的 ProjectTodoNode 树（与 firm/sku/[skuId] 一致） */
function skuItemsToProjectTodoTree(items: FirmSkuItem[]): ProjectTodoNode[] {
  const byParent = new Map<string | null, FirmSkuItem[]>();
  items.forEach((it) => {
    const k = it.parentId ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(it);
  });
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  function build(parentKey: string | null, depth: number): ProjectTodoNode[] {
    const list = byParent.get(parentKey) ?? [];
    return list.map((it) => ({
      id: it.id,
      orderId: '',
      parentId: it.parentId ?? null,
      type: it.type,
      initialResponsibleSide: it.type,
      title: it.title,
      description: it.description ?? null,
      status: 'in_progress' as const,
      sortOrder: it.sortOrder,
      depth,
      itemKind: it.itemKind,
      dependsOnId: it.dependsOnId ?? null,
      children: build(it.id, depth + 1),
    }));
  }
  return build(null, 0);
}

const TAX_SEASON_COLORS = [
  '#6C5CE7', '#E17055', '#00B894', '#0984E3', '#FDCB6E',
  '#E84393', '#00CEC9', '#74B9FF', '#A29BFE', '#FD79A8',
];
function getTaxSeasonColor(year: number): string {
  return TAX_SEASON_COLORS[Math.abs(year) % 10] ?? TAX_SEASON_COLORS[0];
}

export interface ProjectDetailHeader {
  title: string;
  subtitle: string;
  taxSeasonYear: number | null;
  status?: { label: string; color: string; bg: string };
}

/** 订单状态配置（client/firm 顶栏状态标签共用） */
export const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  onboarding:  { label: 'Onboarding',  color: '#6C5CE7', bg: '#EDE9FD' },
  collecting:  { label: 'Collecting',  color: '#0984E3', bg: '#E3F2FD' },
  processing:  { label: 'Processing',  color: '#B07D00', bg: '#FFF8E1' },
  reviewing:   { label: 'Reviewing',   color: '#C0392B', bg: '#FEECEB' },
  filing:      { label: 'Filing',      color: '#00838F', bg: '#E0F7FA' },
  completed:   { label: 'Completed',   color: '#00875A', bg: '#E3FCEF' },
  cancelled:   { label: 'Cancelled',   color: '#636E72', bg: '#F0F2F5' },
};

/** 统一顶栏标题：税季 pill | 标题+副标题 | 状态 pill（样式与税季一致，放大占两行，与税季对齐） */
export function ProjectDetailHeaderTitle({
  header,
}: {
  header: ProjectDetailHeader;
}) {
  const { title, subtitle, taxSeasonYear, status } = header;
  return (
    <View style={headerStyles.wrap}>
      {taxSeasonYear != null ? (
        <View style={[headerStyles.pill, { backgroundColor: getTaxSeasonColor(taxSeasonYear) }]}>
          <Text style={[headerStyles.pillText, { color: '#FFF' }]}>{taxSeasonYear}</Text>
        </View>
      ) : null}
      <View style={headerStyles.textCol}>
        <Text style={headerStyles.title} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
        {subtitle ? (
          <Text style={headerStyles.sub} numberOfLines={1} ellipsizeMode="tail">{subtitle}</Text>
        ) : null}
      </View>
      {status ? (
        <View style={[headerStyles.pill, { backgroundColor: status.bg }]}>
          <Text style={[headerStyles.pillText, { color: status.color }]}>{status.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 10,
    paddingRight: 8,
    overflow: 'visible',
    gap: 8,
    minHeight: 56,
  },
  /** 税季 / 状态 pill 统一样式：占两行、与税季同大，位置跟随两行较高者 */
  pill: {
    minWidth: 56,
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillText: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  textCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: '#2D3436', lineHeight: 20 },
  sub: { fontSize: 12, color: '#95A5A6', lineHeight: 16, marginTop: 4 },
});

/** Firm onboarding：WBS 预览表格 */
function SkuWbsPreview({ todos }: { todos: TodoRow[] }) {
  return (
    <View style={sharedStyles.skuTable}>
      <View style={sharedStyles.skuTableHeader}>
        <Text style={[sharedStyles.skuTh, sharedStyles.colWbs]}>#</Text>
        <Text style={[sharedStyles.skuTh, sharedStyles.colKind]}>Kind</Text>
        <Text style={[sharedStyles.skuTh, { flex: 1 }]}>Task</Text>
      </View>
      {todos.map((row) => (
        <View key={row.id} style={sharedStyles.skuTr}>
          <Text style={[sharedStyles.skuTd, sharedStyles.colWbs]}>{row.wbsCode}</Text>
          <Text style={[sharedStyles.skuTd, sharedStyles.colKind]} numberOfLines={1}>
            {'itemKind' in row ? row.itemKind : ''}
          </Text>
          <Text style={[sharedStyles.skuTd, { flex: 1 }]} numberOfLines={2}>{row.title}</Text>
        </View>
      ))}
      {todos.length === 0 && (
        <View style={sharedStyles.skuEmpty}>
          <Text style={sharedStyles.emptyText}>No work items defined for this service.</Text>
        </View>
      )}
    </View>
  );
}

export interface ProjectDetailViewProps {
  viewerRole: 'client' | 'firm';
  header: ProjectDetailHeader;
  isOnboarding: boolean;
  activeTab: 'todos' | 'info';
  setActiveTab: (t: 'todos' | 'info') => void;
  infoEditing: boolean;
  setInfoEditing: (v: boolean) => void;
  infoTabRef: React.RefObject<ProjectInfoTabHandle | null>;
  /** Client/Firm onboarding 时顶栏右端显示左侧按钮 + 右侧主按钮；Firm 侧文案为 Terminal / Start */
  onReject?: () => Promise<void>;
  rejectLoading?: boolean;
  onAcceptAndStart?: () => Promise<void>;
  acceptAndStartLoading?: boolean;
  /** 左侧按钮文案，默认 Reject；Firm onboarding 传 "Terminal" */
  headerRejectLabel?: string;
  /** 右侧主按钮文案，默认 Accept and Start；Firm onboarding 传 "Start" */
  headerAcceptLabel?: string;
  /** Collecting 态：Terminate（警告色）；Firm 还可显示完成（绿色） */
  orderStatus?: 'onboarding' | 'collecting' | 'cancelled';
  onAbort?: () => Promise<void>;
  abortLoading?: boolean;
  onComplete?: () => Promise<void>;
  completeLoading?: boolean;
  /** Cancelled 态：重启（主色） */
  onRestart?: () => Promise<void>;
  restartLoading?: boolean;
  /** 内容：Todos */
  tree: ProjectTodoNode[];
  orderId: string;
  projectId: string | null;
  clientSpaceId: string;
  onRefresh: () => Promise<void>;
  createProjectTodo: typeof import('@/lib/firm').createProjectTodo;
  /** Firm onboarding */
  skuInfo?: ProjectSkuInfo | null;
  skuTodos?: TodoRow[];
  /** Firm onboarding：SKU 项树，用于与 SKU 详情一致的树形展示（优先于 skuTodos 表格） */
  skuItems?: FirmSkuItem[];
  /** Firm onboarding Info 页只读：Classification 用（与 SKU 详情一致） */
  skuDetailForInfo?: { taxCountry?: string | null; taxScenario?: string | null } | null;
}

export function ProjectDetailView({
  viewerRole,
  header,
  isOnboarding,
  activeTab,
  setActiveTab,
  infoEditing,
  setInfoEditing,
  infoTabRef,
  onReject,
  rejectLoading = false,
  onAcceptAndStart,
  acceptAndStartLoading = false,
  headerRejectLabel = 'Reject',
  headerAcceptLabel = 'Accept and Start',
  orderStatus,
  onAbort,
  abortLoading = false,
  onComplete,
  completeLoading = false,
  onRestart,
  restartLoading = false,
  tree,
  orderId,
  projectId,
  clientSpaceId,
  onRefresh,
  createProjectTodo,
  skuInfo,
  skuTodos = [],
  skuItems,
  skuDetailForInfo,
}: ProjectDetailViewProps) {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackButtonVisible: true,
      headerTitle: () => <ProjectDetailHeaderTitle header={header} />,
    });
  }, [navigation, header.title, header.subtitle, header.taxSeasonYear, header.status?.label]);

  const showOnboardingActions = Boolean(isOnboarding && onAcceptAndStart && (viewerRole === 'client' || viewerRole === 'firm'));
  const showCollectingActions = orderStatus === 'collecting' && onAbort;
  const showCancelledActions = orderStatus === 'cancelled' && onRestart;
  const showHeaderActions = showOnboardingActions || showCollectingActions || showCancelledActions;

  useLayoutEffect(() => {
    if (!showHeaderActions) {
      navigation.setOptions({ headerBackButtonVisible: true, headerRight: undefined });
      return;
    }
    navigation.setOptions({
      headerBackButtonVisible: true,
      headerRight: () => {
        if (showCancelledActions) {
          return (
            <View style={sharedStyles.headerActionsWrap}>
              <TouchableOpacity
                onPress={onRestart}
                disabled={restartLoading}
                style={sharedStyles.headerRestartBtn}
                activeOpacity={0.85}
              >
                {restartLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="play-circle" size={18} color="#fff" />
                    <Text style={sharedStyles.headerRestartBtnText}>Restart</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        }
        if (showCollectingActions) {
          return (
            <View style={sharedStyles.headerActionsWrap}>
              <TouchableOpacity
                onPress={onAbort}
                disabled={abortLoading || completeLoading}
                style={sharedStyles.headerAbortBtn}
                activeOpacity={0.85}
              >
                {abortLoading ? (
                  <ActivityIndicator size="small" color="#D35400" />
                ) : (
                  <Text style={sharedStyles.headerAbortBtnText}>Terminate</Text>
                )}
              </TouchableOpacity>
              {onComplete ? (
                <TouchableOpacity
                  onPress={onComplete}
                  disabled={completeLoading || abortLoading}
                  style={sharedStyles.headerCompleteBtn}
                  activeOpacity={0.85}
                >
                  {completeLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={sharedStyles.headerCompleteBtnText}>Complete</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }
        return (
          <View style={sharedStyles.headerActionsWrap}>
            {onReject ? (
              <TouchableOpacity
                onPress={onReject}
                disabled={rejectLoading || acceptAndStartLoading}
                style={sharedStyles.headerRejectBtn}
                activeOpacity={0.85}
              >
                {rejectLoading ? (
                  <ActivityIndicator size="small" color="#C0392B" />
                ) : (
                  <Text style={sharedStyles.headerRejectBtnText}>{headerRejectLabel}</Text>
                )}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={onAcceptAndStart}
              disabled={acceptAndStartLoading || rejectLoading}
              style={sharedStyles.headerAcceptBtn}
              activeOpacity={0.85}
            >
              {acceptAndStartLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={sharedStyles.headerAcceptBtnText}>{headerAcceptLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        );
      },
    });
    return () => {
      navigation.setOptions({ headerBackButtonVisible: true, headerRight: undefined });
    };
  }, [navigation, showHeaderActions, showOnboardingActions, showCollectingActions, showCancelledActions, onReject, rejectLoading, onAcceptAndStart, acceptAndStartLoading, headerRejectLabel, headerAcceptLabel, onAbort, abortLoading, onComplete, completeLoading, onRestart, restartLoading]);

  return (
    <View style={sharedStyles.container}>
      {/* 操作行：Firm onboarding 与已确认态一致，仅 Todos | Info 双 tab，无 Confirm/Edit */}
      <View style={sharedStyles.operationBar}>
        <View style={sharedStyles.tabGroup}>
          <TouchableOpacity
            style={[sharedStyles.tabChip, activeTab === 'todos' && sharedStyles.tabChipActive]}
            onPress={() => { setActiveTab('todos'); setInfoEditing(false); }}
            activeOpacity={0.8}
          >
            <Text style={[sharedStyles.tabChipText, activeTab === 'todos' && sharedStyles.tabChipTextActive]}>Todos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[sharedStyles.tabChip, activeTab === 'info' && sharedStyles.tabChipActive]}
            onPress={() => setActiveTab('info')}
            activeOpacity={0.8}
          >
            <Text style={[sharedStyles.tabChipText, activeTab === 'info' && sharedStyles.tabChipTextActive]}>Info</Text>
          </TouchableOpacity>
        </View>

        {!(isOnboarding && (viewerRole === 'firm' || (viewerRole === 'client' && (skuItems?.length ?? 0) > 0))) ? (
          <>
            {activeTab === 'info' && !infoEditing && (
              <TouchableOpacity
                style={sharedStyles.operationBtn}
                onPress={() => { infoTabRef.current?.startEditing(); setInfoEditing(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={16} color="#6C5CE7" />
                <Text style={sharedStyles.operationBtnText}>Edit info</Text>
              </TouchableOpacity>
            )}
            {activeTab === 'info' && infoEditing && (
              <View style={sharedStyles.operationEditGroup}>
                <TouchableOpacity
                  style={[sharedStyles.operationBtn, sharedStyles.operationBtnSmall]}
                  onPress={() => { infoTabRef.current?.cancelEditing(); setInfoEditing(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={sharedStyles.operationBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sharedStyles.operationBtn, sharedStyles.operationBtnPrimary, sharedStyles.operationBtnSmall]}
                  onPress={async () => {
                    const ok = await infoTabRef.current?.saveEditing();
                    if (ok) setInfoEditing(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[sharedStyles.operationBtnText, { color: '#FFF' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : null}
      </View>

      {/* 内容区：client onboarding 无 sku 数据时仅提示接受订单；有 sku 或 firm onboarding 时展示只读 Todos + Info */}
      {isOnboarding && viewerRole === 'client' && !(skuItems && skuItems.length > 0) ? (
        <View style={sharedStyles.emptyWrap}>
          <Text style={sharedStyles.emptyText}>Accept the order to see checklist</Text>
        </View>
      ) : isOnboarding && (viewerRole === 'firm' || (viewerRole === 'client' && (skuItems?.length ?? 0) > 0)) ? (
        activeTab === 'todos' ? (
          skuItems && skuItems.length > 0 ? (
            <TaxFilingTodosView
              tree={skuItemsToProjectTodoTree(skuItems)}
              orderId=""
              clientSpaceId=""
              viewerRole={viewerRole}
              onRefresh={async () => {}}
              createProjectTodo={async () => ({ id: null, error: null })}
              catalogMode
              catalogPreviewReadOnly
            />
          ) : (
            <ScrollView style={sharedStyles.scroll} contentContainerStyle={sharedStyles.scrollContent}>
              <Text style={sharedStyles.sectionTitle}>Work breakdown (WBS)</Text>
              <SkuWbsPreview todos={skuTodos} />
            </ScrollView>
          )
        ) : (
          <ScrollView style={sharedStyles.scroll} contentContainerStyle={sharedStyles.scrollContent}>
            {skuInfo && (
              <View style={sharedStyles.skuInfoCard}>
                <View style={sharedStyles.skuInfoHeroRow}>
                  {skuInfo.imageUrl ? (
                    <Image source={{ uri: skuInfo.imageUrl }} style={sharedStyles.skuInfoCover} resizeMode="cover" />
                  ) : (
                    <View style={sharedStyles.skuInfoCoverPlaceholder}>
                      <Ionicons name="image-outline" size={30} color="#BDC3C7" />
                    </View>
                  )}
                  <View style={sharedStyles.skuInfoHeroMeta}>
                    <Text style={sharedStyles.skuInfoName} numberOfLines={3}>{skuInfo.name}</Text>
                    {skuInfo.description ? (
                      <Text style={sharedStyles.skuInfoDesc} numberOfLines={5}>{skuInfo.description}</Text>
                    ) : (
                      <Text style={sharedStyles.skuInfoDescEmpty}>No description</Text>
                    )}
                  </View>
                </View>
              </View>
            )}
            <View style={sharedStyles.skuInfoCard}>
              <Text style={sharedStyles.skuInfoCardTitle}>Classification</Text>
              <View style={sharedStyles.skuInfoCfRow}>
                <View style={sharedStyles.skuInfoCfTagCol}><Text style={sharedStyles.skuInfoCfLabel}>Jurisdiction</Text></View>
                <View style={sharedStyles.skuInfoCfValueCol}>
                  {skuDetailForInfo?.taxCountry ? (
                    <View style={[sharedStyles.skuInfoValuePill, { backgroundColor: '#EDE9FD' }]}>
                      <Text style={[sharedStyles.skuInfoValuePillText, { color: '#6C5CE7' }]}>{skuDetailForInfo.taxCountry}</Text>
                    </View>
                  ) : <Text style={sharedStyles.skuInfoCfEmpty}>—</Text>}
                </View>
              </View>
              <View style={sharedStyles.skuInfoDivider} />
              <View style={sharedStyles.skuInfoCfRow}>
                <View style={sharedStyles.skuInfoCfTagCol}><Text style={sharedStyles.skuInfoCfLabel}>Scenario</Text></View>
                <View style={sharedStyles.skuInfoCfValueCol}>
                  {skuDetailForInfo?.taxScenario ? (
                    <View style={[sharedStyles.skuInfoValuePill, { backgroundColor: '#E3F2FD' }]}>
                      <Text style={[sharedStyles.skuInfoValuePillText, { color: '#1E88E5' }]}>{skuDetailForInfo.taxScenario}</Text>
                    </View>
                  ) : <Text style={sharedStyles.skuInfoCfEmpty}>—</Text>}
                </View>
              </View>
            </View>
          </ScrollView>
        )
      ) : activeTab === 'info' ? (
        projectId ? (
          <ProjectInfoTab
            ref={infoTabRef}
            projectId={projectId}
            mode={viewerRole === 'firm' ? 'firm' : undefined}
          />
        ) : (
          <View style={sharedStyles.centered}>
            <Text style={sharedStyles.emptyText}>Project not yet created.</Text>
          </View>
        )
      ) : (
        <TaxFilingTodosView
          tree={tree}
          orderId={orderId}
          clientSpaceId={clientSpaceId}
          viewerRole={viewerRole}
          onRefresh={onRefresh}
          createProjectTodo={createProjectTodo}
        />
      )}
    </View>
  );
}

const sharedStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: '#636E72' },

  operationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  tabGroup: {
    flexDirection: 'row',
    backgroundColor: '#F0F2F5',
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  tabChip: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 6 },
  tabChipActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabChipText: { fontSize: 13, fontWeight: '600', color: '#95A5A6' },
  tabChipTextActive: { color: '#2D3436' },
  operationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    gap: 5,
  },
  operationBtnText: { fontSize: 13, color: '#6C5CE7', fontWeight: '500' },
  operationEditGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  operationBtnSmall: { paddingHorizontal: 10, paddingVertical: 6 },
  operationBtnPrimary: { backgroundColor: '#6C5CE7' },
  /** 顶栏操作区：Reject 次按钮 + Accept 主按钮，右端留白 */
  headerActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 14,
  },
  /** 顶栏 Reject 次按钮：规范次按钮 + 阴影 */
  headerRejectBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#FFE5E5',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' || Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.12,
          shadowRadius: 3,
        }
      : {}),
    ...(Platform.OS === 'android' ? { elevation: 2 } : {}),
  },
  headerRejectBtnText: { color: '#C0392B', fontWeight: '600', fontSize: 15 },
  /** 顶栏 Abort（收集态）：警告色 */
  headerAbortBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' || Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3 }
      : {}),
    ...(Platform.OS === 'android' ? { elevation: 2 } : {}),
  },
  headerAbortBtnText: { color: '#D35400', fontWeight: '600', fontSize: 15 },
  /** 顶栏 Complete（收集态 firm）：绿色 */
  headerCompleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#00B894',
    ...(Platform.OS === 'web' || Platform.OS === 'ios'
      ? { shadowColor: '#00B894', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }
      : {}),
    ...(Platform.OS === 'android' ? { elevation: 4 } : {}),
  },
  headerCompleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  /** 顶栏 Restart（取消态）：主按钮色 */
  headerRestartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#6C5CE7',
    ...(Platform.OS === 'web' || Platform.OS === 'ios'
      ? { shadowColor: '#6C5CE7', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }
      : {}),
    ...(Platform.OS === 'android' ? { elevation: 4 } : {}),
  },
  headerRestartBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  /** 顶栏「Accept and Start」主按钮：规范主按钮样式 + 阴影 */
  headerAcceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#6C5CE7',
    ...(Platform.OS === 'web' || Platform.OS === 'ios'
      ? {
          shadowColor: '#6C5CE7',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
        }
      : {}),
    ...(Platform.OS === 'android' ? { elevation: 4 } : {}),
  },
  headerAcceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  opBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F0F2F5',
  },
  opBtnText: { fontSize: 13, fontWeight: '500', color: '#636E72' },
  opBtnPrimary: { backgroundColor: '#6C5CE7' },
  opBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  opBtnSecondary: { backgroundColor: '#EDE9FD' },
  opBtnSecondaryText: { fontSize: 13, fontWeight: '600', color: '#6C5CE7' },
  opBtnDisabled: { opacity: 0.6 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  skuInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    padding: 16,
    marginBottom: 20,
  },
  skuInfoName: { fontSize: 18, fontWeight: '700', color: '#2D3436', marginBottom: 6 },
  skuInfoDesc: { fontSize: 14, color: '#636E72', lineHeight: 20 },
  skuInfoHeroRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 8 },
  skuInfoCover: { width: 88, height: 88, borderRadius: 10, backgroundColor: '#E9ECEF' },
  skuInfoCoverPlaceholder: { width: 88, height: 88, borderRadius: 10, backgroundColor: '#E9ECEF', justifyContent: 'center', alignItems: 'center' },
  skuInfoHeroMeta: { flex: 1, gap: 6, paddingTop: 2 },
  skuInfoDescEmpty: { fontSize: 13, color: '#B2BEC3', fontStyle: 'italic' },
  skuInfoCardTitle: { fontSize: 11, fontWeight: '700', color: '#95A5A6', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 },
  skuInfoCfRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 4, gap: 16 },
  skuInfoCfTagCol: { width: 90, alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
  skuInfoCfLabel: { fontSize: 13, fontWeight: '500', color: '#636E72' },
  skuInfoCfValueCol: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },
  skuInfoValuePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  skuInfoValuePillText: { fontSize: 12, fontWeight: '600' },
  skuInfoCfEmpty: { fontSize: 13, color: '#B2BEC3' },
  skuInfoDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E9ECEF' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#636E72', marginBottom: 10 },
  skuTable: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    overflow: 'hidden',
  },
  skuTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F3F5',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  skuTh: { fontSize: 12, fontWeight: '600', color: '#495057' },
  skuTr: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  skuTd: { fontSize: 13, color: '#2D3436' },
  colWbs: { width: 36 },
  colKind: { width: 60 },
  skuEmpty: { padding: 24, alignItems: 'center' },
  confirmNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 20,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  confirmNoteText: { flex: 1, fontSize: 13, color: '#636E72', lineHeight: 18 },
});
