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
} from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TaxFilingTodosView } from '@/components/TaxFilingTodosView';
import { ProjectInfoTab, type ProjectInfoTabHandle } from '../app/tax-filing/project/[projectId]/info';
import type { ProjectTodoNode } from '@/lib/firm';
import type { ProjectSkuInfo, TodoRow } from '@/components/ProjectSkuDetail';

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
  /** Client 时在顶栏显示 info/list 切换图标 */
  showHeaderTabToggle?: boolean;
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
  onConfirmOrder?: () => void;
  confirming?: boolean;
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
  showHeaderTabToggle = false,
  tree,
  orderId,
  projectId,
  clientSpaceId,
  onRefresh,
  createProjectTodo,
  skuInfo,
  skuTodos = [],
  onConfirmOrder,
  confirming = false,
}: ProjectDetailViewProps) {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackButtonVisible: true,
      headerTitle: () => <ProjectDetailHeaderTitle header={header} />,
    });
  }, [navigation, header.title, header.subtitle, header.taxSeasonYear, header.status?.label]);

  const toggleTab = useCallback(() => {
    setActiveTab(activeTab === 'info' ? 'todos' : 'info');
  }, [activeTab, setActiveTab]);

  useLayoutEffect(() => {
    if (!showHeaderTabToggle) return;
    navigation.setOptions({
      headerBackButtonVisible: true,
      headerRight: () => (
        <TouchableOpacity
          onPress={toggleTab}
          style={{ padding: 8, marginRight: 2 }}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'info' ? 'list-outline' : 'information-circle-outline'}
            size={22}
            color={activeTab === 'info' ? '#6C5CE7' : '#636E72'}
          />
        </TouchableOpacity>
      ),
    });
    return () => {
      navigation.setOptions({ headerBackButtonVisible: true, headerRight: undefined });
    };
  }, [navigation, showHeaderTabToggle, activeTab, toggleTab]);

  return (
    <View style={sharedStyles.container}>
      {/* 操作行 */}
      <View style={sharedStyles.operationBar}>
        {isOnboarding && viewerRole === 'firm' ? (
          <TouchableOpacity
            style={[sharedStyles.opBtn, sharedStyles.opBtnPrimary, confirming && sharedStyles.opBtnDisabled]}
            onPress={onConfirmOrder}
            disabled={confirming}
            activeOpacity={0.8}
          >
            {confirming ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
            )}
            <Text style={sharedStyles.opBtnPrimaryText}>{confirming ? 'Confirming…' : 'Confirm order'}</Text>
          </TouchableOpacity>
        ) : (
          <>
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

            {activeTab === 'todos' && (
              <TouchableOpacity style={sharedStyles.operationBtn} onPress={() => {}} activeOpacity={0.7}>
                <Ionicons name="download-outline" size={16} color="#6C5CE7" />
                <Text style={sharedStyles.operationBtnText}>Download all</Text>
              </TouchableOpacity>
            )}
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
        )}
      </View>

      {/* 内容区 */}
      {isOnboarding && viewerRole === 'client' ? (
        <View style={sharedStyles.emptyWrap}>
          <Text style={sharedStyles.emptyText}>Accept the order to see checklist</Text>
        </View>
      ) : isOnboarding && viewerRole === 'firm' ? (
        <ScrollView style={sharedStyles.scroll} contentContainerStyle={sharedStyles.scrollContent}>
          {skuInfo && (
            <View style={sharedStyles.skuInfoCard}>
              <Text style={sharedStyles.skuInfoName}>{skuInfo.name}</Text>
              {skuInfo.description ? (
                <Text style={sharedStyles.skuInfoDesc}>{skuInfo.description}</Text>
              ) : null}
            </View>
          )}
          <Text style={sharedStyles.sectionTitle}>Work breakdown (WBS)</Text>
          <SkuWbsPreview todos={skuTodos} />
          <View style={sharedStyles.confirmNote}>
            <Ionicons name="information-circle-outline" size={16} color="#636E72" />
            <Text style={sharedStyles.confirmNoteText}>
              Confirming the order will activate the project and generate all tasks for the client.
            </Text>
          </View>
        </ScrollView>
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
