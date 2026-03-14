/**
 * Firm - Engagements: table (客户、服务项年度+SKU、创建时间、来源、进展状态、负责人、更新时间).
 * Web: DataTable with group, filter, search, multi-select, batch (e.g. cancel). Mobile: card list.
 */
import { useEffect, useState, useMemo, useCallback, useLayoutEffect } from 'react';
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
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getCurrentSpace } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  getFirmOrdersWithDetails,
  updateOrderStatus,
  type FirmOrderWithDetails,
} from '@/lib/firm';
import DataTable, { type DataTableColumn, WEB_POPOVER } from '@/components/DataTable';

const STATUS_LABEL: Record<string, string> = {
  onboarding: 'Onboarding',
  processing: 'Processing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  onboarding: '#6C5CE7',
  processing: '#29B6F6',
  completed: '#00B894',
  cancelled: '#B2BEC3',
};

/** Client type dot: green = claimed (order has clientSpaceId), amber = invitee only (pending claim). Align with clients list. */
const CLIENT_TYPE_DOT = { client: '#27AE60', pendingInvitee: '#F39C12' };
function isOrderInviteeOnly(o: { clientSpaceId?: string | null; inviteeClientId?: string | null }): boolean {
  return !!o.inviteeClientId && !o.clientSpaceId;
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

/** 服务项：年度 + SKU 名称 */
function serviceItemLabel(row: FirmOrderWithDetails): string {
  return row.skuName || '—';
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
        const isInvitee = isOrderInviteeOnly(r);
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
      label: 'Engagement',
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
              const [bg, fg] = getTagColor(t);
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
      id: 'createdAt',
      label: 'Created',
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
      id: 'assigneeName',
      label: 'Assignee',
      minWidth: 100,
      getValue: (r) => (
        <Text style={cellText} numberOfLines={1}>
          {r.assigneeName ?? '—'}
        </Text>
      ),
      getSortValue: (r) => (r.assigneeName ?? '').toLowerCase(),
    },
    {
      id: 'updatedAt',
      label: 'Updated',
      minWidth: 120,
      getValue: (r) => <Text style={cellText}>{formatDateTime(r.updatedAt)}</Text>,
      getSortValue: (r) => r.updatedAt ?? '',
    },
  ];
}

export default function FirmEngagementsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<FirmOrderWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupBy, setGroupBy] = useState<GroupByType>('none');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [bulkCancelling, setBulkCancelling] = useState(false);
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
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showGroupMenu, showFilterMenu]);

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
          renderItem={({ item: o }) => (
            <TouchableOpacity
              style={[styles.receiptItem, o.status === 'cancelled' && styles.receiptItemMuted]}
              onPress={() => router.push(`/firm/engagement/${o.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.receiptContent}>
                <View style={styles.firstRow}>
                  <Text style={styles.storeName} numberOfLines={1}>{serviceItemLabel(o)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[o.status] ?? '#636E72' }]}>
                    <Text style={styles.statusText}>{STATUS_LABEL[o.status] ?? o.status}</Text>
                  </View>
                </View>
                <View style={styles.secondRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: isOrderInviteeOnly(o) ? CLIENT_TYPE_DOT.pendingInvitee : CLIENT_TYPE_DOT.client,
                        marginRight: 6,
                      }}
                    />
                    <Text style={styles.amount} numberOfLines={1}>{o.clientName ?? '—'}</Text>
                  </View>
                  <Text style={styles.createdDate}>{formatTimeAgo(o.updatedAt)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
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
    return <View style={{ flex: 1 }}>{renderMobileList()}</View>;
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
    borderBottomColor: '#E9ECEF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptItemMuted: { opacity: 0.6 },
  receiptContent: { flex: 1 },
  firstRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  storeName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#2D3436', marginRight: 12 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  confirmedByText: { fontSize: 12, color: '#636E72', fontWeight: '500' },
  secondRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: { flex: 1, fontSize: 16, fontWeight: '600', color: '#6C5CE7' },
  createdDate: { fontSize: 14, color: '#636E72', marginLeft: 'auto' },
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
  bulkBtnClear: { paddingVertical: 8, paddingHorizontal: 12 },
  bulkBtnClearText: { fontSize: 14, color: '#636E72', fontWeight: '500' },
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
