/**
 * Firm - Engagements: table (客户、服务项年度+SKU、创建时间、来源、进展状态、负责人、更新时间).
 * Web: DataTable with group, filter, search, multi-select, batch (e.g. cancel). Mobile: card list.
 */
import { useEffect, useState, useMemo, useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SectionList,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getCurrentSpace } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  getFirmClientsWithDetails,
  getFirmOrdersWithDetails,
  getFirmSkus,
  createFirmOrder,
  updateOrderStatus,
  getFirmSpaceMembers,
  updateFirmOrderManager,
  type FirmClientWithDetails,
  type FirmSpaceMember,
  type FirmOrderWithDetails,
} from '@/lib/firm';
import DataTable, { type DataTableColumn, WEB_POPOVER } from '@/components/DataTable';
import { getTaxSeasonColor, getTaxSeasonBgColor } from '@/lib/tax-season-colors';
import CenterModal from '../../components/CenterModal';
import SkuPreview from '../../components/SkuPreview';
import type { FirmSku } from '@/types';
import { createPendingOrderForInvitee } from '@/lib/firm-clients';
import { showToast } from '@/lib/toast';

const STATUS_LABEL: Record<string, string> = {
  onboarding: 'Onboarding',
  processing: 'Processing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  onboarding: '#E67E22',
  processing: '#29B6F6',
  completed: '#00B894',
  cancelled: '#B2BEC3',
};

// Mobile 列表状态标签配色：与 client 侧 / 详情页保持“浅底色 + 深字色”规范
const STATUS_BG_SOFT: Record<string, string> = {
  onboarding: '#FFF3E0',
  processing: '#E1F5FE',
  completed: '#E3FCEF',
  cancelled: '#F0F2F5',
};
const STATUS_FG_SOFT: Record<string, string> = {
  onboarding: '#E67E22',
  processing: '#0288D1',
  completed: '#00875A',
  cancelled: '#636E72',
};

/** Client type dot: green = claimed (order has clientSpaceId), amber = pending firm.clients row (order.client_id, no space yet). */
const CLIENT_TYPE_DOT = { client: '#27AE60', pendingInvitee: '#F39C12' };
function isOrderPendingClaim(o: { clientSpaceId?: string | null; clientId?: string | null }): boolean {
  return !o.clientSpaceId && !!o.clientId;
}

// 与报税项目 Info 页相同的标签配色
const TAG_PALETTE: [string, string][] = [
  ['#E3F2FD', '#1E88E5'],  // blue
  ['#E8F5E9', '#2ECC71'],  // green
  ['#FFF3E0', '#E67E22'],  // amber
  ['#FCE4EC', '#E91E63'],  // rose
  ['#E0F7FA', '#00ACC1'],  // teal
  ['#FFF8E1', '#F9A825'],  // yellow
  ['#F3E5F5', '#9C27B0'],  // purple
];

function getTagColor(tag: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) & 0xffff;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return format(d, 'MMM dd, yyyy');
  } catch {
    return '—';
  }
}

function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins} minutes ago`;
    }
    if (diffHours < 24) return `${diffHours} hours ago`;
    const dateOnly = dateString.includes('T') ? dateString.split('T')[0] : dateString;
    return formatDate(dateOnly);
  } catch {
    return '—';
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return format(d, 'MMM dd, yyyy HH:mm');
  } catch {
    return '—';
  }
}

function getCategoryTags(row: FirmOrderWithDetails): string[] {
  const tags: string[] = [];
  const dateForYear = row.dueAt || row.createdAt || null;
  const explicitYear = row.taxSeasonYear != null ? row.taxSeasonYear : null;
  if (explicitYear != null) {
    tags.push(String(explicitYear));
  } else if (dateForYear) {
    try {
      const y = new Date(dateForYear).getFullYear();
      if (!Number.isNaN(y)) tags.push(String(y));
    } catch {
      // ignore
    }
  }
  if (row.taxCountry) tags.push(row.taxCountry);
  if (row.taxScenario) tags.push(row.taxScenario);
  if (Array.isArray(row.tags)) {
    for (const t of row.tags) {
      if (t && typeof t === 'string') tags.push(t);
    }
  }
  return tags;
}

function formatCategory(row: FirmOrderWithDetails): string {
  const parts = getCategoryTags(row);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/** 服务项名称 */
function serviceItemLabel(row: FirmOrderWithDetails): string {
  return row.skuName || '—';
}

/** 税季年份：优先显式 taxSeasonYear，其次 dueAt/createdAt 推断 */
// 税季年份：优先使用 project 上下发的 taxSeasonYear；
// onboarding（尚无 project）时则根据订单的 dueAt / createdAt 推算年份。
function getTaxSeasonYear(row: FirmOrderWithDetails): number | null {
  if (row.taxSeasonYear != null) return row.taxSeasonYear;
  const d = row.dueAt || row.createdAt || null;
  if (!d) return null;
  try {
    return new Date(d).getFullYear();
  } catch {
    return null;
  }
}

function matchQuery(q: string, row: FirmOrderWithDetails): boolean {
  const lower = q.trim().toLowerCase();
  if (!lower) return true;
  const client = (row.clientName || '').toLowerCase();
  const sku = (row.skuName || '').toLowerCase();
  const source = (row.source || '').toLowerCase();
  const status = (row.status || '').toLowerCase();
  const assignee = (row.assigneeName || '').toLowerCase();
  const category = formatCategory(row).toLowerCase();
  return (
    client.includes(lower) ||
    sku.includes(lower) ||
    source.includes(lower) ||
    status.includes(lower) ||
    assignee.includes(lower) ||
    category.includes(lower)
  );
}

type GroupByType = 'none' | 'byClient' | 'byStatus';
type FilterStatus = 'all' | 'onboarding' | 'processing' | 'completed' | 'cancelled';

const cellText = { fontSize: 14, color: '#2D3436' };

function getOrderColumns(): DataTableColumn<FirmOrderWithDetails>[] {
  return [
    {
      id: 'clientName',
      label: 'Client',
      minWidth: 140,
      getValue: (r) => {
        const isInvitee = isOrderPendingClaim(r);
        const dotColor = isInvitee ? CLIENT_TYPE_DOT.pendingInvitee : CLIENT_TYPE_DOT.client;
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
            <Text style={cellText} numberOfLines={1}>
              {r.clientName || '—'}
            </Text>
          </View>
        );
      },
      getSortValue: (r) => (r.clientName || '').toLowerCase(),
    },
    {
      id: 'serviceItem',
      label: 'Service',
      minWidth: 160,
      getValue: (r) => (
        <Text style={cellText} numberOfLines={1}>
          {serviceItemLabel(r)}
        </Text>
      ),
      getSortValue: (r) => serviceItemLabel(r).toLowerCase(),
    },
    {
      id: 'category',
      label: 'Classification',
      minWidth: 200,
      getValue: (r) => (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(() => {
            const tags = getCategoryTags(r);
            if (tags.length === 0) {
              return <Text style={[cellText, { color: '#95A5A6' }]}>—</Text>;
            }
            return tags.map((t) => {
              // 4 位纯数字的 tag 视为「税季年份」：同色系浅底色 + 深字色；其余标签走通用 TAG_PALETTE
              const isYearTag = /^\d{4}$/.test(t);
              const [tagBg, tagFg] = getTagColor(t);
              const year = isYearTag ? Number(t) : null;
              const bg = isYearTag ? getTaxSeasonBgColor(year) : tagBg;
              const fg = isYearTag ? getTaxSeasonColor(year) : tagFg;
              return (
                <View
                  key={t}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: bg,
                    alignSelf: 'flex-start',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '500',
                      color: fg,
                    }}
                    numberOfLines={1}
                  >
                    {t}
                  </Text>
                </View>
              );
            });
          })()}
        </View>
      ),
      getSortValue: (r) => formatCategory(r).toLowerCase(),
    },
    {
      id: 'status',
      label: 'Status',
      minWidth: 100,
      getValue: (r) => {
        const raw = r.status ?? '';
        const label = STATUS_LABEL[raw] ?? raw ?? '—';
        const color = STATUS_COLOR[raw] ?? '#636E72';
        return (
          <View style={{ flexDirection: 'row', alignSelf: 'flex-start' }}>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
                backgroundColor: color,
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          </View>
        );
      },
      getSortValue: (r) => r.status ?? '',
    },
    {
      id: 'updatedAt',
      label: 'Updated',
      minWidth: 120,
      getValue: (r) => <Text style={cellText}>{formatDateTime(r.updatedAt)}</Text>,
      getSortValue: (r) => r.updatedAt ?? '',
    },
    {
      id: 'assigneeName',
      label: 'Manager',
      minWidth: 100,
      getValue: (r) => (
        <Text style={cellText} numberOfLines={1}>
          {r.assigneeName ?? '—'}
        </Text>
      ),
      getSortValue: (r) => (r.assigneeName ?? '').toLowerCase(),
    },
    {
      id: 'createdAt',
      label: 'Created date',
      minWidth: 110,
      getValue: (r) => <Text style={cellText}>{formatDate(r.createdAt)}</Text>,
      getSortValue: (r) => r.createdAt ?? '',
    },
    {
      id: 'source',
      label: 'Source',
      minWidth: 90,
      visible: false,
      getValue: (r) => (
        <Text style={cellText} numberOfLines={1}>
          {r.source || '—'}
        </Text>
      ),
      getSortValue: (r) => (r.source || '').toLowerCase(),
    },
  ];
}

export default function FirmEngagementsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<FirmOrderWithDetails[]>([]);
  const [clientRows, setClientRows] = useState<FirmClientWithDetails[]>([]);
  const [skuList, setSkuList] = useState<FirmSku[]>([]);
  const [newEngagementModalVisible, setNewEngagementModalVisible] = useState(false);
  const [creatingEngagement, setCreatingEngagement] = useState(false);
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [clientNameInput, setClientNameInput] = useState('');
  const [contactNameInput, setContactNameInput] = useState('');
  const [contactEmailInput, setContactEmailInput] = useState('');
  const [activeClientField, setActiveClientField] = useState<'clientName' | 'contactName' | 'contactEmail'>('clientName');
  const [showClientMenu, setShowClientMenu] = useState(false);
  const [clientDropdownRect, setClientDropdownRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const clientNameRef = useRef<View>(null);
  const contactNameRef = useRef<View>(null);
  const contactEmailRef = useRef<View>(null);
  const [showSkuMenu, setShowSkuMenu] = useState(false);
  const [skuDropdownRect, setSkuDropdownRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const skuSelectRef = useRef<View>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupBy, setGroupBy] = useState<GroupByType>('none');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [bulkCancelling, setBulkCancelling] = useState(false);
  const [showAssignManagerPicker, setShowAssignManagerPicker] = useState(false);
  const [assignMembers, setAssignMembers] = useState<FirmSpaceMember[]>([]);
  const [assignSelectedMemberId, setAssignSelectedMemberId] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [groupPopoverRect, setGroupPopoverRect] = useState<{ left: number; top: number } | null>(null);
  const [filterPopoverRect, setFilterPopoverRect] = useState<{ left: number; top: number } | null>(null);

  const orderColumns = useMemo(() => getOrderColumns(), []);

  // Web: 计算分组 / 筛选浮窗位置（对齐 receipts 列表实现）
  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    if (showGroupMenu) {
      const measure = () => {
        const el = document.getElementById('firm-engagements-group-button');
        if (el) {
          const r = el.getBoundingClientRect();
          setGroupPopoverRect({ left: r.left, top: r.bottom + 6 });
        } else {
          setGroupPopoverRect(null);
        }
      };
      measure();
      const t = requestAnimationFrame(measure);
      return () => {
        cancelAnimationFrame(t);
        setGroupPopoverRect(null);
      };
    }
    setGroupPopoverRect(null);
  }, [showGroupMenu]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    if (showFilterMenu) {
      const measure = () => {
        const el = document.getElementById('firm-engagements-filter-button');
        if (el) {
          const r = el.getBoundingClientRect();
          setFilterPopoverRect({ left: r.left, top: r.bottom + 6 });
        } else {
          setFilterPopoverRect(null);
        }
      };
      measure();
      const t = requestAnimationFrame(measure);
      return () => {
        cancelAnimationFrame(t);
        setFilterPopoverRect(null);
      };
    }
    setFilterPopoverRect(null);
  }, [showFilterMenu]);

  // Web: 点击外部关闭（同时考虑按钮与浮窗）
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node;
      const groupBtn = document.getElementById('firm-engagements-group-button');
      const groupPopover = document.getElementById('firm-engagements-group-popover');
      const filterBtn = document.getElementById('firm-engagements-filter-button');
      const filterPopover = document.getElementById('firm-engagements-filter-popover');

      if (
        showGroupMenu &&
        groupBtn &&
        !groupBtn.contains(target) &&
        groupPopover &&
        !groupPopover.contains(target)
      ) {
        setShowGroupMenu(false);
      }
      if (
        showFilterMenu &&
        filterBtn &&
        !filterBtn.contains(target) &&
        filterPopover &&
        !filterPopover.contains(target)
      ) {
        setShowFilterMenu(false);
      }

      // Create engagement dropdowns: close when clicking outside anchors + menus
      const clientMenu = document.getElementById('create-engagement-client-menu');
      const skuMenu = document.getElementById('create-engagement-sku-menu');
      const anchors = [
        document.getElementById('create-engagement-clientName-anchor'),
        document.getElementById('create-engagement-contactName-anchor'),
        document.getElementById('create-engagement-contactEmail-anchor'),
        document.getElementById('create-engagement-sku-anchor'),
      ].filter(Boolean) as HTMLElement[];
      const clickedInAnchors = anchors.some((a) => a.contains(target));

      if (showClientMenu && clientMenu && !clientMenu.contains(target) && !clickedInAnchors) {
        setShowClientMenu(false);
        setClientDropdownRect(null);
      }
      if (showSkuMenu && skuMenu && !skuMenu.contains(target) && !clickedInAnchors) {
        setShowSkuMenu(false);
        setSkuDropdownRect(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showGroupMenu, showFilterMenu, showClientMenu, showSkuMenu]);

  const [firmSpaceId, setFirmSpaceId] = useState<string | null>(null);
  const loadData = useCallback(async (forceRefresh = false) => {
    const space = await getCurrentSpace(forceRefresh);
    if (!space?.id || space.kind !== 'firm') {
      router.replace('/');
      return;
    }
    setFirmSpaceId(space.id);
    const list = await getFirmOrdersWithDetails(space.id);
    setOrders(list);
  }, [router]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData(true);
      setLoading(false);
    })();
  }, [loadData]);

  useEffect(() => {
    if (!firmSpaceId) return;
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => loadData(true), 300);
    };
    const ch = supabase
      .channel(`firm-engagements-orders-${firmSpaceId}`)
      .on('postgres_changes', { event: '*', schema: 'firm', table: 'orders', filter: `firm_space_id=eq.${firmSpaceId}` }, debouncedRefresh)
      .subscribe();
    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      supabase.removeChannel(ch);
    };
  }, [firmSpaceId, loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  const selectableSkus = useMemo(
    () =>
      skuList.filter((s) =>
        s.templateStatus != null
          ? s.templateStatus !== 'draft'
          : s.isPublished === true || !!s.taxCountry || !!s.taxScenario
      ),
    [skuList]
  );

  const clientKey = useCallback((c: FirmClientWithDetails) => {
    return c.isPendingClaim ? `invitee-${c.id}` : `space-${c.clientSpaceId}`;
  }, []);

  const selectedClient = useMemo(() => {
    if (!selectedClientKey) return null;
    return clientRows.find((c) => clientKey(c) === selectedClientKey) ?? null;
  }, [clientRows, selectedClientKey, clientKey]);

  useEffect(() => {
    if (!selectedClient) {
      setClientNameInput('');
      setContactNameInput('');
      setContactEmailInput('');
      return;
    }
    setClientNameInput(selectedClient.name || '');
    setContactNameInput(selectedClient.contactName || '');
    setContactEmailInput(selectedClient.contactEmail || '');
  }, [selectedClient]);

  const handleOpenNewEngagementModal = useCallback(async () => {
    const space = await getCurrentSpace();
    if (!space?.id || space.kind !== 'firm') return;
    setFirmSpaceId(space.id);

    // 每次打开都重置上次选择/输入状态
    setActiveClientField('clientName');
    setClientNameInput('');
    setContactNameInput('');
    setContactEmailInput('');
    setShowClientMenu(false);
    setClientDropdownRect(null);
    setShowSkuMenu(false);
    setSkuDropdownRect(null);

    // 不自动选中 client；前三项由用户在列表中选择或输入过滤后选择（每次打开已清空输入）
    if (clientRows.length === 0) {
      const rows = await getFirmClientsWithDetails(space.id);
      setClientRows(rows);
    }
    setSelectedClientKey(null);
    if (skuList.length === 0) {
      const skus = await getFirmSkus(space.id);
      setSkuList(skus);
      const firstSku = (skus || []).find((s) =>
        s.templateStatus != null
          ? s.templateStatus !== 'draft'
          : s.isPublished === true || !!s.taxCountry || !!s.taxScenario
      );
      setSelectedSkuId(firstSku?.id ?? null);
    } else {
      const firstSku = selectableSkus[0] ?? null;
      setSelectedSkuId(firstSku?.id ?? null);
    }

    setNewEngagementModalVisible(true);
  }, [clientRows.length, skuList.length, selectableSkus]);

  const handleCreateEngagement = useCallback(async (): Promise<string | null> => {
    if (!firmSpaceId) return null;
    if (!selectedClient || !selectedSkuId) return null;
    setCreatingEngagement(true);
    let createdId: string | null = null;
    let error: Error | null = null;

    if (selectedClient.isPendingClaim) {
      const res = await createPendingOrderForInvitee(firmSpaceId, {
        clientName: selectedClient.name || '',
        contactName: selectedClient.contactName ?? '',
        contactEmail: selectedClient.contactEmail ?? '',
        skuId: selectedSkuId,
      });
      error = res.error;
      if (!error) createdId = res.result?.orderId ?? null;
    } else {
      const res = await createFirmOrder(firmSpaceId, selectedClient.clientSpaceId, selectedSkuId, null);
      error = res?.error ?? null;
      if (!error) createdId = res?.id ?? null;
    }

    setCreatingEngagement(false);
    if (error) {
      showToast(error.message ?? 'Failed to create engagement.', 'error');
      return null;
    }
    return createdId;
  }, [firmSpaceId, selectedClient, selectedSkuId]);

  const confirmCreateAndClose = useCallback(async () => {
    const orderId = await handleCreateEngagement();
    if (orderId) {
      setNewEngagementModalVisible(false);
      router.push(`/firm/engagement/${orderId}`);
    }
  }, [handleCreateEngagement, router]);

  const openClientMenu = useCallback((field: 'clientName' | 'contactName' | 'contactEmail') => {
    setActiveClientField(field);
    if (showClientMenu) {
      setShowClientMenu(false);
      return;
    }
    const ref =
      field === 'clientName' ? clientNameRef : field === 'contactName' ? contactNameRef : contactEmailRef;
    ref.current?.measureInWindow((x, y, w, h) => {
      setClientDropdownRect({ x, y, width: w, height: h });
      setShowClientMenu(true);
    });
  }, [showClientMenu]);

  const onClientFieldChange = useCallback((field: 'clientName' | 'contactName' | 'contactEmail', v: string) => {
    setActiveClientField(field);
    if (field === 'clientName') setClientNameInput(v);
    if (field === 'contactName') setContactNameInput(v);
    if (field === 'contactEmail') setContactEmailInput(v);
    const ref =
      field === 'clientName' ? clientNameRef : field === 'contactName' ? contactNameRef : contactEmailRef;
    ref.current?.measureInWindow((x, y, w, h) => {
      setClientDropdownRect({ x, y, width: w, height: h });
      setShowClientMenu(true);
    });
  }, []);

  const clientQuery = useMemo(() => {
    return activeClientField === 'clientName'
      ? clientNameInput
      : activeClientField === 'contactName'
        ? contactNameInput
        : contactEmailInput;
  }, [activeClientField, clientNameInput, contactNameInput, contactEmailInput]);

  const filteredClientsForMenu = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const list = clientRows.slice();
    const getPrimary = (c: FirmClientWithDetails) =>
      activeClientField === 'clientName'
        ? (c.name || '')
        : activeClientField === 'contactName'
          ? (c.contactName || '')
          : (c.contactEmail || '');
    list.sort((a, b) => getPrimary(a).localeCompare(getPrimary(b)));
    if (tokens.length === 0) return list;
    return list.filter((c) => {
      const hay = `${c.name || ''} ${c.contactName || ''} ${c.contactEmail || ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [clientRows, clientQuery, activeClientField]);

  const openSkuMenu = useCallback(() => {
    if (selectableSkus.length === 0) return;
    if (showSkuMenu) {
      setShowSkuMenu(false);
      return;
    }
    skuSelectRef.current?.measureInWindow((x, y, w, h) => {
      setSkuDropdownRect({ x, y, width: w, height: h });
      setShowSkuMenu(true);
    });
  }, [selectableSkus.length, showSkuMenu]);

  const filteredByStatus = useMemo(() => {
    if (filterStatus === 'all') return orders;
    return orders.filter((o) => o.status === filterStatus);
  }, [orders, filterStatus]);

  const searchedOrders = useMemo(
    () => filteredByStatus.filter((o) => matchQuery(searchQuery, o)),
    [filteredByStatus, searchQuery]
  );

  const sortRowsByColumn = useCallback(
    <T,>(
      rows: T[],
      col:
        | { getSortValue?: (row: T) => string | number | Date | null | undefined }
        | undefined,
      dir: 'asc' | 'desc'
    ): T[] => {
      if (!col?.getSortValue) return rows;
      return [...rows].sort((a, b) => {
        const va = col.getSortValue!(a);
        const vb = col.getSortValue!(b);
        const cmp =
          va === vb ? 0 : va == null ? 1 : vb == null ? -1 : va < vb ? -1 : 1;
        return dir === 'asc' ? cmp : -cmp;
      });
    },
    []
  );

  const groupedSections = useMemo(() => {
    if (groupBy === 'none') return [{ title: 'All', data: searchedOrders }];
    if (groupBy === 'byClient') {
      const byClient: Record<string, FirmOrderWithDetails[]> = {};
      searchedOrders.forEach((o) => {
        const key = o.clientName || o.clientSpaceId;
        if (!byClient[key]) byClient[key] = [];
        byClient[key].push(o);
      });
      const keys = Object.keys(byClient).sort((a, b) => a.localeCompare(b));
      return keys.map((k) => ({ title: k, data: byClient[k] }));
    }
    if (groupBy === 'byStatus') {
      const byStatus: Record<string, FirmOrderWithDetails[]> = {};
      searchedOrders.forEach((o) => {
        const key = o.status || 'unknown';
        if (!byStatus[key]) byStatus[key] = [];
        byStatus[key].push(o);
      });
      const order = ['onboarding', 'processing', 'completed', 'cancelled'];
      const keys = order.filter((k) => (byStatus[k]?.length ?? 0) > 0);
      return keys.map((k) => ({
        title: STATUS_LABEL[k] ?? k,
        data: byStatus[k] ?? [],
      }));
    }
    return [{ title: 'All', data: searchedOrders }];
  }, [groupBy, searchedOrders]);

  const col = sortKey ? orderColumns.find((c) => c.id === sortKey) : undefined;
  const tableSections = useMemo(
    () =>
      groupedSections.map((sec) => ({
        title: sec.title,
        data: sortRowsByColumn(sec.data, col, sortDirection),
        count: sec.data.length,
        countLabel: 'engagements',
      })),
    [groupedSections, sortKey, sortDirection, orderColumns, sortRowsByColumn]
  );

  const sortedDataForTable = useMemo(
    () => sortRowsByColumn(searchedOrders, col, sortDirection),
    [searchedOrders, sortKey, sortDirection, orderColumns, sortRowsByColumn]
  );

  const tableEmptyMessage = useMemo(() => {
    if (loading && orders.length === 0) return 'Loading...';
    if (orders.length === 0)
      return 'No engagements yet. Create from Service Catalog for clients.';
    if (searchedOrders.length === 0)
      return searchQuery.trim()
        ? `No results for "${searchQuery}"`
        : `No engagements match status "${filterStatus === 'all' ? 'all' : STATUS_LABEL[filterStatus] ?? filterStatus}".`;
    return 'No data';
  }, [loading, orders.length, searchedOrders.length, searchQuery, filterStatus]);

  const handleBulkCancel = useCallback(async () => {
    if (selectedOrderIds.length === 0) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Cancel ${selectedOrderIds.length} selected engagement(s)? Status will be set to Cancelled.`
      )
    )
      return;
    setBulkCancelling(true);
    let err: Error | null = null;
    for (const id of selectedOrderIds) {
      const res = await updateOrderStatus(id, 'cancelled');
      if (res.error) err = res.error;
    }
    setBulkCancelling(false);
    if (err && typeof window !== 'undefined') window.alert(err.message);
    else {
      setSelectedOrderIds([]);
      await loadData(true);
    }
  }, [selectedOrderIds, loadData]);

  const handleOpenAssignManagerPicker = useCallback(async () => {
    if (!firmSpaceId || selectedOrderIds.length === 0) return;
    setShowAssignManagerPicker(true);
    setAssignLoading(true);
    setAssignSelectedMemberId(null);
    const members = await getFirmSpaceMembers(firmSpaceId);
    setAssignMembers(members);
    setAssignLoading(false);
  }, [firmSpaceId, selectedOrderIds.length]);

  const handleAssignManagerDone = useCallback(async () => {
    if (!firmSpaceId || !assignSelectedMemberId || selectedOrderIds.length === 0) return;
    setAssignSaving(true);
    let error: Error | null = null;
    for (const orderId of selectedOrderIds) {
      const res = await updateFirmOrderManager(firmSpaceId, orderId, assignSelectedMemberId);
      if (res.error) {
        error = res.error;
        break;
      }
    }
    setAssignSaving(false);
    setShowAssignManagerPicker(false);
    if (error) {
      if (typeof window !== 'undefined') window.alert(error.message);
      return;
    }
    setSelectedOrderIds([]);
    await loadData(true);
  }, [firmSpaceId, assignSelectedMemberId, selectedOrderIds, loadData]);

  // Mobile: receipt-style list (Group, Filter, Search + firstRow/secondRow)
  const engagementSections = useMemo(() => {
    const col = sortKey ? orderColumns.find((c) => c.id === sortKey) : undefined;
    return groupedSections.map((sec) => ({
      title: sec.title,
      monthKey: sec.title,
      data: sortRowsByColumn(sec.data, col, sortDirection),
    }));
  }, [groupedSections, sortKey, sortDirection, orderColumns, sortRowsByColumn]);

  const renderMobileList = () => (
    <View style={styles.container}>
      <View style={styles.toolbarSlot}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={[styles.inviteButton, { marginRight: 8 }]}
              onPress={handleOpenNewEngagementModal}
              activeOpacity={0.7}
            >
              <Ionicons
                name="add-circle-outline"
                size={18}
                color="#6C5CE7"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.inviteButtonText}>Add engagement</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortButton} onPress={() => setShowGroupMenu(!showGroupMenu)}>
              {groupBy === 'none' && <Ionicons name="list-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
              {groupBy === 'byClient' && <Ionicons name="people-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
              {groupBy === 'byStatus' && <Ionicons name="flag-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
              <Text style={styles.sortText}>Group</Text>
              <Ionicons name="chevron-down" size={16} color="#636E72" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilterMenu(!showFilterMenu)}>
              <Text style={styles.filterText}>
                Filter
                {filterStatus !== 'all' && <Text style={styles.filterBadge}> (1)</Text>}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#636E72" />
            </TouchableOpacity>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#636E72" style={styles.searchIcon} />
              <TextInput style={styles.searchInput} placeholder="Search" placeholderTextColor="#95A5A6" value={searchQuery} onChangeText={setSearchQuery} />
              {searchQuery.trim() ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.searchClear}>
                  <Ionicons name="close-circle" size={20} color="#95A5A6" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
        {showGroupMenu && (
          <View style={styles.groupDropdown}>
            <TouchableOpacity style={[styles.groupOption, groupBy === 'none' && styles.groupOptionSelected]} onPress={() => { setGroupBy('none'); setShowGroupMenu(false); }}>
              <Text style={[styles.groupOptionText, groupBy === 'none' && styles.groupOptionTextSelected]}>None</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.groupOption, groupBy === 'byClient' && styles.groupOptionSelected]} onPress={() => { setGroupBy('byClient'); setShowGroupMenu(false); }}>
              <Text style={[styles.groupOptionText, groupBy === 'byClient' && styles.groupOptionTextSelected]}>By client</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.groupOption, groupBy === 'byStatus' && styles.groupOptionSelected]} onPress={() => { setGroupBy('byStatus'); setShowGroupMenu(false); }}>
              <Text style={[styles.groupOptionText, groupBy === 'byStatus' && styles.groupOptionTextSelected]}>By status</Text>
            </TouchableOpacity>
          </View>
        )}
        {showFilterMenu && (
          <View style={styles.groupDropdown}>
            {(['all', 'onboarding', 'processing', 'completed', 'cancelled'] as FilterStatus[]).map((key) => (
              <TouchableOpacity key={key} style={[styles.groupOption, filterStatus === key && styles.groupOptionSelected]} onPress={() => { setFilterStatus(key); setShowFilterMenu(false); }}>
                <Text style={[styles.groupOptionText, filterStatus === key && styles.groupOptionTextSelected]}>{key === 'all' ? 'All' : STATUS_LABEL[key] ?? key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      {loading && orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6C5CE7" />
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : (
        <SectionList
          sections={engagementSections}
          keyExtractor={(o) => o.id}
          renderItem={({ item: o }) => {
            const taxYear = getTaxSeasonYear(o);
            const statusBg = STATUS_COLOR[o.status] ?? '#636E72';
            const statusLabel = STATUS_LABEL[o.status] ?? o.status;
            return (
              <TouchableOpacity
                style={[styles.receiptItem, o.status === 'cancelled' && styles.receiptItemMuted]}
                onPress={() => router.push(`/firm/engagement/${o.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.receiptContent}>
                  {/* 第一行：税季标签 + 项目/服务名称（左对齐） */}
                  <View style={styles.firstRow}>
                    {taxYear != null && (
                      <View
                        style={[
                          styles.taxSeasonPill,
                          { backgroundColor: getTaxSeasonBgColor(taxYear) },
                        ]}
                      >
                        <Text
                          style={[
                            styles.taxSeasonText,
                            { color: getTaxSeasonColor(taxYear) },
                          ]}
                        >
                          {taxYear}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.storeName} numberOfLines={1}>
                      {serviceItemLabel(o)}
                    </Text>
                  </View>
                  {/* 第二行：客户状态圆点 + 客户名（左），状态标签（右） */}
                  <View style={styles.secondRow}>
                    <View style={styles.clientWrap}>
                      <View
                        style={[
                          styles.clientDot,
                          {
                            backgroundColor: isOrderPendingClaim(o)
                              ? CLIENT_TYPE_DOT.pendingInvitee
                              : CLIENT_TYPE_DOT.client,
                          },
                        ]}
                      />
                      <Text style={styles.clientName} numberOfLines={1}>
                        {o.clientName ?? '—'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: STATUS_COLOR[o.status] ?? '#636E72' },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: '#FFFFFF' }]}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          renderSectionHeader={({ section }) => {
            if (section.data.length === 0 || section.title === 'All') return null;
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionHeaderRight}>
                  <Text style={styles.sectionCount}>{section.data.length} engagements</Text>
                </View>
              </View>
            );
          }}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={engagementSections.every((s) => s.data.length === 0) ? styles.emptyList : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{tableEmptyMessage}</Text>
            </View>
          }
        />
      )}
    </View>
  );

  if (Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1 }}>
        {renderMobileList()}

        <CenterModal
          visible={newEngagementModalVisible}
          title="Create new engagement"
          onClose={() => {
            setNewEngagementModalVisible(false);
            setShowClientMenu(false);
            setClientDropdownRect(null);
            setShowSkuMenu(false);
            setSkuDropdownRect(null);
          }}
          maxWidth={840}
          cardHeight={660}
        >
          <View style={{ flexDirection: 'row', gap: 16, height: '100%' }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingRight: 4 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: '#636E72', marginBottom: 12 }}>
                Create a new service engagement. Select a client from your accessible client list. Client fields are linked.
              </Text>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#636E72', marginBottom: 6 }}>Client name</Text>
                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F6FA', borderWidth: 1, borderColor: '#EAECEF' }}
                  activeOpacity={0.7}
                  onPress={() => openClientMenu('clientName')}
                >
                  <Text style={{ fontSize: 14, color: '#2D3436' }} numberOfLines={1}>
                    {selectedClient?.name || '—'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#636E72', marginBottom: 6 }}>Contact name</Text>
                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F6FA', borderWidth: 1, borderColor: '#EAECEF' }}
                  activeOpacity={0.7}
                  onPress={() => openClientMenu('contactName')}
                >
                  <Text style={{ fontSize: 14, color: '#2D3436' }} numberOfLines={1}>
                    {selectedClient?.contactName || '—'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#636E72', marginBottom: 6 }}>Contact email</Text>
                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F6FA', borderWidth: 1, borderColor: '#EAECEF' }}
                  activeOpacity={0.7}
                  onPress={() => openClientMenu('contactEmail')}
                >
                  <Text style={{ fontSize: 14, color: '#2D3436' }} numberOfLines={1}>
                    {selectedClient?.contactEmail || '—'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#636E72', marginBottom: 6 }}>Service template</Text>
                {selectableSkus.length === 0 ? (
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: '#F1F3F5',
                      borderWidth: 1,
                      borderColor: '#EAECEF',
                    }}
                  >
                    <Text style={{ fontSize: 14, color: '#95A5A6' }} numberOfLines={1}>
                      Please configure Service Catalog first.
                    </Text>
                  </View>
                ) : (
                  <View ref={skuSelectRef} collapsable={false}>
                    <TouchableOpacity
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: '#F5F6FA',
                        borderWidth: 1,
                        borderColor: '#EAECEF',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                      activeOpacity={0.7}
                      onPress={openSkuMenu}
                    >
                      <Text style={{ fontSize: 14, color: '#2D3436', flex: 1 }} numberOfLines={1}>
                        {selectedSkuId ? (selectableSkus.find((s) => s.id === selectedSkuId)?.name ?? 'Select a service template') : 'Select a service template'}
                      </Text>
                      <Ionicons name={showSkuMenu ? 'chevron-up' : 'chevron-down'} size={18} color="#636E72" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F3F5' }}
                  activeOpacity={0.7}
                  onPress={() => setNewEngagementModalVisible(false)}
                >
                  <Text style={{ fontWeight: '600', color: '#2D3436' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: !selectedClient || !selectedSkuId || creatingEngagement ? '#B2BEC3' : '#6C5CE7',
                  }}
                  activeOpacity={0.7}
                  disabled={!selectedClient || !selectedSkuId || creatingEngagement}
                  onPress={confirmCreateAndClose}
                >
                  {creatingEngagement ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ fontWeight: '600', color: '#fff' }}>Create engagement</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: '#F1F3F5', paddingLeft: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#2D3436', marginBottom: 10 }}>Service preview</Text>
              <SkuPreview sku={skuList.find((s) => s.id === selectedSkuId) ?? null} />
            </View>
          </View>
        </CenterModal>

      <Modal
        visible={showClientMenu && clientDropdownRect !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClientMenu(false)}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowClientMenu(false)} />
        {clientDropdownRect && (
          <View
            style={{
              position: 'absolute',
              left: clientDropdownRect.x,
              top: clientDropdownRect.y + clientDropdownRect.height + 4,
              width: Math.min(clientDropdownRect.width, 420),
              maxHeight: 280,
              backgroundColor: '#fff',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#EAECEF',
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 10,
            }}
          >
            <ScrollView contentContainerStyle={{ paddingVertical: 6 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filteredClientsForMenu.map((c) => {
                const key = clientKey(c);
                const selected = selectedClientKey === key;
                const primary =
                  activeClientField === 'clientName'
                    ? (c.name || '—')
                    : activeClientField === 'contactName'
                      ? (c.contactName || '—')
                      : (c.contactEmail || '—');
                const right1 = activeClientField === 'clientName' ? (c.contactName || '—') : (c.name || '—');
                const right2 = activeClientField === 'contactEmail' ? (c.contactName || '—') : (c.contactEmail || '—');
                return (
                  <TouchableOpacity
                    key={key}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      backgroundColor: selected ? '#EAEAFF' : 'transparent',
                    }}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedClientKey(key);
                      setShowClientMenu(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: selected ? '#6C5CE7' : '#2D3436' }} numberOfLines={1}>
                        {primary}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#95A5A6', maxWidth: 160, textAlign: 'right' }} numberOfLines={1}>
                        {right1}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#B2BEC3', maxWidth: 180, textAlign: 'right' }} numberOfLines={1}>
                        {right2}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </Modal>

        {/* Service template: keep same dropdown design as client detail modal */}
        <Modal visible={showSkuMenu && skuDropdownRect !== null} transparent animationType="fade" onRequestClose={() => setShowSkuMenu(false)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSkuMenu(false)} />
          {skuDropdownRect && (
            <View
              style={[
                {
                  backgroundColor: '#fff',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#EAECEF',
                  shadowColor: '#000',
                  shadowOpacity: 0.12,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 10,
                },
                {
                  position: 'absolute',
                  left: skuDropdownRect.x,
                  top: skuDropdownRect.y + skuDropdownRect.height + 4,
                  width: skuDropdownRect.width,
                  maxHeight: 280,
                },
              ]}
            >
              <ScrollView contentContainerStyle={{ paddingVertical: 6 }} nestedScrollEnabled>
                {selectableSkus.map((sku) => (
                  <TouchableOpacity
                    key={sku.id}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      backgroundColor: selectedSkuId === sku.id ? '#EAEAFF' : 'transparent',
                    }}
                    onPress={() => {
                      setSelectedSkuId(sku.id);
                      setShowSkuMenu(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: selectedSkuId === sku.id ? '700' : '600',
                        color: selectedSkuId === sku.id ? '#6C5CE7' : '#2D3436',
                      }}
                      numberOfLines={1}
                    >
                      {sku.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </Modal>
      </View>
    );
  }

  const hasSelection = selectedOrderIds.length > 0;
  return (
    <View style={styles.webContainer}>
      <View style={styles.toolbarSlot}>
        {hasSelection ? (
          <View style={styles.bulkBar}>
            <Text style={styles.bulkText}>
              {selectedOrderIds.length} selected
            </Text>
            <TouchableOpacity
              style={[styles.bulkBtn, bulkCancelling && styles.bulkBtnDisabled]}
              onPress={handleBulkCancel}
              disabled={bulkCancelling}
              activeOpacity={0.7}
            >
              {bulkCancelling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="close-circle-outline" size={18} color="#fff" />
              )}
              <Text style={styles.bulkBtnText}>Cancel engagements</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bulkBtnSecondary}
              onPress={handleOpenAssignManagerPicker}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={18} color="#6C5CE7" />
              <Text style={styles.bulkBtnSecondaryText}>Assign manager</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bulkBtnClear}
              onPress={() => setSelectedOrderIds([])}
              activeOpacity={0.7}
            >
              <Text style={styles.bulkBtnClearText}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                style={[styles.inviteButton, { marginRight: 8 }]}
                onPress={handleOpenNewEngagementModal}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />
                <Text style={styles.inviteButtonText}>Add engagement</Text>
              </TouchableOpacity>
              <View
                style={styles.groupWrap}
                {...(Platform.OS === 'web' ? { nativeID: 'firm-engagements-group-button' } : {})}
              >
                <TouchableOpacity
                  style={styles.sortButton}
                  onPress={() => setShowGroupMenu(true)}
                  activeOpacity={0.7}
                >
                  {groupBy === 'none' && (
                    <Ionicons
                      name="list-outline"
                      size={18}
                      color="#6C5CE7"
                      style={{ marginRight: 4 }}
                    />
                  )}
                  {groupBy === 'byClient' && (
                    <Ionicons
                      name="people-outline"
                      size={18}
                      color="#6C5CE7"
                      style={{ marginRight: 4 }}
                    />
                  )}
                  {groupBy === 'byStatus' && (
                    <Ionicons
                      name="flag-outline"
                      size={18}
                      color="#6C5CE7"
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text style={styles.sortText}>Group</Text>
                  <Ionicons name="chevron-down" size={16} color="#636E72" />
                </TouchableOpacity>
                {showGroupMenu && Platform.OS !== 'web' && (
                  <View style={styles.groupDropdown}>
                    <TouchableOpacity
                      style={[
                        styles.groupOption,
                        groupBy === 'none' && styles.groupOptionSelected,
                      ]}
                      onPress={() => {
                        setGroupBy('none');
                        setShowGroupMenu(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.groupOptionText,
                          groupBy === 'none' && styles.groupOptionTextSelected,
                        ]}
                      >
                        None
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.groupOption,
                        groupBy === 'byClient' && styles.groupOptionSelected,
                      ]}
                      onPress={() => {
                        setGroupBy('byClient');
                        setShowGroupMenu(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.groupOptionText,
                          groupBy === 'byClient' && styles.groupOptionTextSelected,
                        ]}
                      >
                        By client
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.groupOption,
                        groupBy === 'byStatus' && styles.groupOptionSelected,
                      ]}
                      onPress={() => {
                        setGroupBy('byStatus');
                        setShowGroupMenu(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.groupOptionText,
                          groupBy === 'byStatus' && styles.groupOptionTextSelected,
                        ]}
                      >
                        By status
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View
                style={styles.groupWrap}
                {...(Platform.OS === 'web' ? { nativeID: 'firm-engagements-filter-button' } : {})}
              >
                <TouchableOpacity
                  style={styles.sortButton}
                  onPress={() => setShowFilterMenu(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="filter-outline"
                    size={18}
                    color="#6C5CE7"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.sortText}>
                    {filterStatus === 'all'
                      ? 'Status: All'
                      : `Status: ${STATUS_LABEL[filterStatus] ?? filterStatus}`}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#636E72" />
                </TouchableOpacity>
                {showFilterMenu && Platform.OS !== 'web' && (
                  <View style={styles.groupDropdown}>
                    {(
                      [
                        ['all', 'All'],
                        ['onboarding', 'Onboarding'],
                        ['processing', 'Processing'],
                        ['completed', 'Completed'],
                        ['cancelled', 'Cancelled'],
                      ] as const
                    ).map(([value, label]) => (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.groupOption,
                          filterStatus === value && styles.groupOptionSelected,
                        ]}
                        onPress={() => {
                          setFilterStatus(value);
                          setShowFilterMenu(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.groupOptionText,
                            filterStatus === value && styles.groupOptionTextSelected,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.searchContainer}>
                <Ionicons
                  name="search"
                  size={18}
                  color="#636E72"
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search"
                  placeholderTextColor="#95A5A6"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.trim() ? (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.searchClear}
                  >
                    <Ionicons name="close-circle" size={20} color="#95A5A6" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        )}
      </View>

      <CenterModal
        visible={newEngagementModalVisible}
        title="Create new engagement"
        onClose={() => {
          setNewEngagementModalVisible(false);
          setShowClientMenu(false);
          setClientDropdownRect(null);
          setShowSkuMenu(false);
          setSkuDropdownRect(null);
        }}
        maxWidth={840}
        cardHeight={660}
      >
        <View style={{ flexDirection: 'row', gap: 16, height: '100%' }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingRight: 4 }} showsVerticalScrollIndicator={false}>
            <Text style={{ color: '#636E72', marginBottom: 12 }}>
              Create a new service engagement. Select a client from your accessible client list. Client fields are linked.
            </Text>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: '#636E72', marginBottom: 6 }}>Client name</Text>
              <View
                ref={clientNameRef}
                collapsable={false}
                style={{ flexDirection: 'row', alignItems: 'center' }}
                {...(Platform.OS === 'web' ? { nativeID: 'create-engagement-clientName-anchor' } : {})}
              >
                <TextInput
                  style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F6FA', borderWidth: 1, borderColor: activeClientField === 'clientName' && showClientMenu ? '#6C5CE7' : '#EAECEF', paddingRight: 36, fontSize: 14, color: '#2D3436' }}
                  value={clientNameInput}
                  placeholder="Select a client"
                  placeholderTextColor="#95A5A6"
                  onChangeText={(v) => onClientFieldChange('clientName', v)}
                  onFocus={() => openClientMenu('clientName')}
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: 10, height: 40, width: 24, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => openClientMenu('clientName')}
                  activeOpacity={0.7}
                >
                  <Ionicons name={showClientMenu && activeClientField === 'clientName' ? 'chevron-up' : 'chevron-down'} size={18} color="#636E72" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: '#636E72', marginBottom: 6 }}>Contact name</Text>
              <View
                ref={contactNameRef}
                collapsable={false}
                style={{ flexDirection: 'row', alignItems: 'center' }}
                {...(Platform.OS === 'web' ? { nativeID: 'create-engagement-contactName-anchor' } : {})}
              >
                <TextInput
                  style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F6FA', borderWidth: 1, borderColor: activeClientField === 'contactName' && showClientMenu ? '#6C5CE7' : '#EAECEF', paddingRight: 36, fontSize: 14, color: '#2D3436' }}
                  value={contactNameInput}
                  placeholder="Select a contact"
                  placeholderTextColor="#95A5A6"
                  onChangeText={(v) => onClientFieldChange('contactName', v)}
                  onFocus={() => openClientMenu('contactName')}
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: 10, height: 40, width: 24, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => openClientMenu('contactName')}
                  activeOpacity={0.7}
                >
                  <Ionicons name={showClientMenu && activeClientField === 'contactName' ? 'chevron-up' : 'chevron-down'} size={18} color="#636E72" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: '#636E72', marginBottom: 6 }}>Contact email</Text>
              <View
                ref={contactEmailRef}
                collapsable={false}
                style={{ flexDirection: 'row', alignItems: 'center' }}
                {...(Platform.OS === 'web' ? { nativeID: 'create-engagement-contactEmail-anchor' } : {})}
              >
                <TextInput
                  style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F6FA', borderWidth: 1, borderColor: activeClientField === 'contactEmail' && showClientMenu ? '#6C5CE7' : '#EAECEF', paddingRight: 36, fontSize: 14, color: '#2D3436' }}
                  value={contactEmailInput}
                  placeholder="Select an email"
                  placeholderTextColor="#95A5A6"
                  onChangeText={(v) => onClientFieldChange('contactEmail', v)}
                  onFocus={() => openClientMenu('contactEmail')}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: 10, height: 40, width: 24, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => openClientMenu('contactEmail')}
                  activeOpacity={0.7}
                >
                  <Ionicons name={showClientMenu && activeClientField === 'contactEmail' ? 'chevron-up' : 'chevron-down'} size={18} color="#636E72" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: '#636E72', marginBottom: 6 }}>Service template</Text>
            {selectableSkus.length === 0 ? (
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: '#F1F3F5',
                  borderWidth: 1,
                  borderColor: '#EAECEF',
                }}
              >
                <Text style={{ fontSize: 14, color: '#95A5A6' }} numberOfLines={1}>
                  Please configure Service Catalog first.
                </Text>
              </View>
            ) : (
              <View
                ref={skuSelectRef}
                collapsable={false}
                {...(Platform.OS === 'web' ? { nativeID: 'create-engagement-sku-anchor' } : {})}
              >
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: '#F5F6FA',
                    borderWidth: 1,
                    borderColor: '#EAECEF',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                  activeOpacity={0.7}
                  onPress={openSkuMenu}
                >
                  <Text style={{ fontSize: 14, color: '#2D3436', flex: 1 }} numberOfLines={1}>
                    {selectedSkuId ? (selectableSkus.find((s) => s.id === selectedSkuId)?.name ?? 'Select a service template') : 'Select a service template'}
                  </Text>
                  <Ionicons name={showSkuMenu ? 'chevron-up' : 'chevron-down'} size={18} color="#636E72" />
                </TouchableOpacity>
              </View>
            )}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F3F5' }}
                activeOpacity={0.7}
                onPress={() => setNewEngagementModalVisible(false)}
              >
                <Text style={{ fontWeight: '600', color: '#2D3436' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: !selectedClient || !selectedSkuId || creatingEngagement ? '#B2BEC3' : '#6C5CE7',
                }}
                activeOpacity={0.7}
                disabled={!selectedClient || !selectedSkuId || creatingEngagement}
                onPress={confirmCreateAndClose}
              >
                {creatingEngagement ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ fontWeight: '600', color: '#fff' }}>Create engagement</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: '#F1F3F5', paddingLeft: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#2D3436', marginBottom: 10 }}>Service preview</Text>
            <SkuPreview sku={skuList.find((s) => s.id === selectedSkuId) ?? null} />
          </View>
        </View>
      </CenterModal>

      {/* Dropdown overlays: web uses portal (so inputs remain editable); mobile uses Modal */}
      {Platform.OS === 'web' &&
        showClientMenu &&
        clientDropdownRect &&
        typeof document !== 'undefined' &&
        document.body &&
        createPortal(
          <div
            id="create-engagement-client-menu"
            style={{
              position: 'absolute',
              left: clientDropdownRect.x,
              top: clientDropdownRect.y + clientDropdownRect.height + 4,
              width: Math.min(clientDropdownRect.width, 420),
              maxHeight: 280,
              overflow: 'auto',
              backgroundColor: '#fff',
              borderRadius: 10,
              border: '1px solid #EAECEF',
              boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
              zIndex: 999999,
            }}
          >
            <View style={{ paddingVertical: 6 }}>
              {filteredClientsForMenu.map((c) => {
                const key = clientKey(c);
                const selected = selectedClientKey === key;
                const primary =
                  activeClientField === 'clientName'
                    ? (c.name || '—')
                    : activeClientField === 'contactName'
                      ? (c.contactName || '—')
                      : (c.contactEmail || '—');
                const right1 = activeClientField === 'clientName' ? (c.contactName || '—') : (c.name || '—');
                const right2 = activeClientField === 'contactEmail' ? (c.contactName || '—') : (c.contactEmail || '—');
                return (
                  <TouchableOpacity
                    key={key}
                    style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: selected ? '#EAEAFF' : 'transparent' }}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedClientKey(key);
                      setShowClientMenu(false);
                      setClientDropdownRect(null);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: selected ? '#6C5CE7' : '#2D3436' }} numberOfLines={1}>
                        {primary}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#95A5A6', maxWidth: 160, textAlign: 'right' }} numberOfLines={1}>
                        {right1}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#B2BEC3', maxWidth: 180, textAlign: 'right' }} numberOfLines={1}>
                        {right2}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </div>,
          document.body
        )}

      {Platform.OS === 'web' &&
        showSkuMenu &&
        skuDropdownRect &&
        typeof document !== 'undefined' &&
        document.body &&
        createPortal(
          <div
            id="create-engagement-sku-menu"
            style={{
              position: 'absolute',
              left: skuDropdownRect.x,
              top: skuDropdownRect.y + skuDropdownRect.height + 4,
              width: skuDropdownRect.width,
              maxHeight: 280,
              overflow: 'auto',
              backgroundColor: '#fff',
              borderRadius: 10,
              border: '1px solid #EAECEF',
              boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
              zIndex: 999999,
            }}
          >
            <View style={{ paddingVertical: 6 }}>
              {selectableSkus.map((sku) => (
                <TouchableOpacity
                  key={sku.id}
                  style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: selectedSkuId === sku.id ? '#EAEAFF' : 'transparent' }}
                  onPress={() => {
                    setSelectedSkuId(sku.id);
                    setShowSkuMenu(false);
                    setSkuDropdownRect(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 14, fontWeight: selectedSkuId === sku.id ? '700' : '600', color: selectedSkuId === sku.id ? '#6C5CE7' : '#2D3436' }} numberOfLines={1}>
                    {sku.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </div>,
          document.body
        )}

      {Platform.OS !== 'web' ? (
        <>
          <Modal
            visible={showClientMenu && clientDropdownRect !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setShowClientMenu(false)}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowClientMenu(false)} />
            {clientDropdownRect && (
              <View
                style={{
                  position: 'absolute',
                  left: clientDropdownRect.x,
                  top: clientDropdownRect.y + clientDropdownRect.height + 4,
                  width: Math.min(clientDropdownRect.width, 420),
                  maxHeight: 280,
                  backgroundColor: '#fff',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#EAECEF',
                  shadowColor: '#000',
                  shadowOpacity: 0.12,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 10,
                }}
              >
                <ScrollView contentContainerStyle={{ paddingVertical: 6 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {filteredClientsForMenu.map((c) => {
                    const key = clientKey(c);
                    const selected = selectedClientKey === key;
                    const primary =
                      activeClientField === 'clientName'
                        ? (c.name || '—')
                        : activeClientField === 'contactName'
                          ? (c.contactName || '—')
                          : (c.contactEmail || '—');
                    const right1 = activeClientField === 'clientName' ? (c.contactName || '—') : (c.name || '—');
                    const right2 = activeClientField === 'contactEmail' ? (c.contactName || '—') : (c.contactEmail || '—');
                    return (
                      <TouchableOpacity
                        key={key}
                        style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: selected ? '#EAEAFF' : 'transparent' }}
                        activeOpacity={0.7}
                        onPress={() => {
                          setSelectedClientKey(key);
                          setShowClientMenu(false);
                          setClientDropdownRect(null);
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: selected ? '#6C5CE7' : '#2D3436' }} numberOfLines={1}>
                            {primary}
                          </Text>
                          <Text style={{ fontSize: 12, color: '#95A5A6', maxWidth: 160, textAlign: 'right' }} numberOfLines={1}>
                            {right1}
                          </Text>
                          <Text style={{ fontSize: 12, color: '#B2BEC3', maxWidth: 180, textAlign: 'right' }} numberOfLines={1}>
                            {right2}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </Modal>

          <Modal
            visible={showSkuMenu && skuDropdownRect !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setShowSkuMenu(false)}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSkuMenu(false)} />
            {skuDropdownRect && (
              <View
                style={{
                  position: 'absolute',
                  left: skuDropdownRect.x,
                  top: skuDropdownRect.y + skuDropdownRect.height + 4,
                  width: skuDropdownRect.width,
                  maxHeight: 280,
                  backgroundColor: '#fff',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#EAECEF',
                  shadowColor: '#000',
                  shadowOpacity: 0.12,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 10,
                }}
              >
                <ScrollView contentContainerStyle={{ paddingVertical: 6 }} nestedScrollEnabled>
                  {selectableSkus.map((sku) => (
                    <TouchableOpacity
                      key={sku.id}
                      style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: selectedSkuId === sku.id ? '#EAEAFF' : 'transparent' }}
                      onPress={() => {
                        setSelectedSkuId(sku.id);
                        setShowSkuMenu(false);
                        setSkuDropdownRect(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 14, fontWeight: selectedSkuId === sku.id ? '700' : '600', color: selectedSkuId === sku.id ? '#6C5CE7' : '#2D3436' }} numberOfLines={1}>
                        {sku.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </Modal>
        </>
      ) : null}

      {/* Client menu is now anchored under the active input (showClientMenu) */}

      {(loading && orders.length === 0) ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6C5CE7" />
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.tableScroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={
            loading && orders.length === 0 ? { flexGrow: 1 } : { flexGrow: 0 }
          }
        >
          <DataTable<FirmOrderWithDetails>
            columns={orderColumns}
            data={groupBy === 'none' ? sortedDataForTable : undefined}
            sections={groupBy !== 'none' ? tableSections : undefined}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={(key, dir) => {
              setSortKey(key);
              setSortDirection(dir);
            }}
            onRowPress={(row) => router.push(`/firm/engagement/${row.id}`)}
            keyExtractor={(r) => r.id}
            emptyMessage={tableEmptyMessage}
            storageKey="firm-engagements-table"
            selectable
            selectableRevealOnHover
            selectedIds={selectedOrderIds}
            onSelectedIdsChange={setSelectedOrderIds}
            getRowClassName={(row) => (row.status === 'cancelled' ? 'data-table-row-muted' : '')}
          />
        </ScrollView>
      )}
      {Platform.OS === 'web' &&
        showGroupMenu &&
        groupPopoverRect &&
        typeof document !== 'undefined' &&
        document.body &&
        createPortal(
          <div
            id="firm-engagements-group-popover"
            style={{ ...WEB_POPOVER.container, left: groupPopoverRect.left, top: groupPopoverRect.top }}
          >
            <Text style={WEB_POPOVER.title}>Group</Text>
            <View>
              {[
                { key: 'none' as GroupByType, label: 'No group', icon: 'list-outline' as const },
                { key: 'byClient' as GroupByType, label: 'By client', icon: 'people-outline' as const },
                { key: 'byStatus' as GroupByType, label: 'By status', icon: 'flag-outline' as const },
              ].map(({ key, label, icon }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    setGroupBy(key);
                    setShowGroupMenu(false);
                  }}
                  style={WEB_POPOVER.optionRow}
                >
                  <Ionicons
                    name={icon}
                    size={18}
                    color={groupBy === key ? '#6C5CE7' : '#636E72'}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={
                      groupBy === key
                        ? { ...WEB_POPOVER.optionText, ...WEB_POPOVER.optionTextSelected }
                        : WEB_POPOVER.optionText
                    }
                  >
                    {label}
                  </Text>
                  {groupBy === key && (
                    <Ionicons name="checkmark" size={18} color="#6C5CE7" style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </div>,
          document.body
        )}

      {Platform.OS === 'web' &&
        showFilterMenu &&
        filterPopoverRect &&
        typeof document !== 'undefined' &&
        document.body &&
        createPortal(
          <div
            id="firm-engagements-filter-popover"
            style={{
              ...WEB_POPOVER.container,
              ...WEB_POPOVER.containerWide,
              left: filterPopoverRect.left,
              top: filterPopoverRect.top,
            }}
          >
            <Text style={WEB_POPOVER.title}>Status</Text>
            <View>
              {(
                [
                  ['all', 'All'],
                  ['onboarding', 'Onboarding'],
                  ['processing', 'Processing'],
                  ['completed', 'Completed'],
                  ['cancelled', 'Cancelled'],
                ] as const
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => {
                    setFilterStatus(value as FilterStatus);
                    setShowFilterMenu(false);
                  }}
                  style={WEB_POPOVER.optionRow}
                >
                  <Text
                    style={
                      filterStatus === value
                        ? { ...WEB_POPOVER.optionText, ...WEB_POPOVER.optionTextSelected }
                        : WEB_POPOVER.optionText
                    }
                  >
                    {label}
                  </Text>
                  {filterStatus === value && (
                    <Ionicons name="checkmark" size={18} color="#6C5CE7" style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </div>,
          document.body
        )}

      <Modal visible={showAssignManagerPicker} transparent animationType="fade" onRequestClose={() => !assignSaving && setShowAssignManagerPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => !assignSaving && setShowAssignManagerPicker(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Assign manager</Text>
            <Text style={styles.modalSubtitle}>Selected engagements: {selectedOrderIds.length}</Text>
            {assignLoading ? (
              <View style={styles.modalLoadingWrap}>
                <ActivityIndicator size="small" color="#6C5CE7" />
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {assignMembers.map((m) => {
                  const selected = assignSelectedMemberId === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.assignRow, selected && styles.assignRowSelected]}
                      onPress={() => setAssignSelectedMemberId(m.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.assignRowText, selected && styles.assignRowTextSelected]}>
                        {m.name || m.email || m.id}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => !assignSaving && setShowAssignManagerPicker(false)}
                disabled={assignSaving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, (!assignSelectedMemberId || assignSaving) && styles.bulkBtnDisabled]}
                onPress={handleAssignManagerDone}
                disabled={!assignSelectedMemberId || assignSaving}
              >
                {assignSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalConfirmText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  webContainer: { flex: 1, backgroundColor: '#ECEFF1' },
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 20, paddingBottom: 40 },
  toolbarSlot: {
    height: 52,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
    justifyContent: 'center',
    overflow: 'visible' as const,
  },
  header: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    overflow: 'visible' as const,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'visible' as const,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EAEAFF',
  },
  inviteButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  groupWrap: { position: 'relative' as const, overflow: 'visible' as const },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortText: {
    fontSize: 14,
    color: '#636E72',
    marginRight: 4,
    fontWeight: '500',
  },
  groupDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingVertical: 8,
    minWidth: 140,
    zIndex: 99999,
    elevation: 99999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  groupOption: { paddingVertical: 10, paddingHorizontal: 14 },
  groupOptionSelected: { backgroundColor: 'rgba(108, 92, 231, 0.1)' },
  groupOptionText: { fontSize: 14, color: '#2D3436' },
  groupOptionTextSelected: { color: '#6C5CE7', fontWeight: '600' },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#2D3436', padding: 0 },
  searchClear: { marginLeft: 4 },
  filterButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  filterText: { fontSize: 14, color: '#636E72', marginRight: 4, fontWeight: '500' },
  filterBadge: { fontSize: 14, color: '#6C5CE7', fontWeight: '600' },
  receiptItem: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingLeft: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#D0D6DC',
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptItemMuted: { opacity: 0.6 },
  receiptContent: { flex: 1 },
  firstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  storeName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    marginRight: 0,
  },
  taxSeasonPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F3F4FF',
  },
  taxSeasonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2D3436',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  confirmedByText: { fontSize: 12, color: '#636E72', fontWeight: '500' },
  secondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 8,
  },
  clientWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  clientDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
    marginLeft: 8,
  },
  clientName: {
    flex: 1,
    fontSize: 14,
    color: '#95A5A6',
  },
  listContent: { paddingHorizontal: 4, paddingTop: 0, paddingBottom: 100 },
  emptyList: { flexGrow: 1 },
  sectionHeader: {
    backgroundColor: '#E9ECEF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DEE2E6',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2D3436' },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionCount: { fontSize: 14, color: '#636E72' },
  bulkBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#E8E0F7',
  },
  bulkText: {
    fontSize: 14,
    color: '#2D3436',
    fontWeight: '500',
    marginRight: 8,
  },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
  },
  bulkBtnDisabled: { opacity: 0.6 },
  bulkBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  bulkBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3EEFF',
    borderRadius: 8,
  },
  bulkBtnSecondaryText: { fontSize: 14, color: '#6C5CE7', fontWeight: '600' },
  bulkBtnClear: { paddingVertical: 8, paddingHorizontal: 12 },
  bulkBtnClearText: { fontSize: 14, color: '#636E72', fontWeight: '500' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2D3436' },
  modalSubtitle: { fontSize: 13, color: '#636E72', marginTop: 4, marginBottom: 10 },
  modalLoadingWrap: { paddingVertical: 18, alignItems: 'center' },
  assignRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  assignRowSelected: { backgroundColor: '#F3EEFF' },
  assignRowText: { fontSize: 14, color: '#2D3436' },
  assignRowTextSelected: { color: '#6C5CE7', fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  modalCancelBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  modalCancelText: { fontSize: 14, color: '#636E72', fontWeight: '500' },
  modalConfirmBtn: {
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 84,
    alignItems: 'center',
  },
  modalConfirmText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  tableScroll: { flex: 1 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  loader: { marginTop: 40 },
  empty: { marginTop: 24 },
  emptyText: { fontSize: 14, color: '#95A5A6' },
  list: { gap: 12, paddingHorizontal: 20 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', marginBottom: 6 },
  label: { fontSize: 13, color: '#636E72', width: 110 },
  value: { flex: 1, fontSize: 14, color: '#2D3436' },
});
