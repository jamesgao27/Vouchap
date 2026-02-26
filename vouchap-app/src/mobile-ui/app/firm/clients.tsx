/**
 * Firm - Client: associated clients. Web: DataTable (columns, search, filter, group, sort). Mobile: card list.
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
import { getFirmClientsWithDetails, getFirmOrders, deleteFirmClients } from '@/lib/firm';
import type { FirmClientWithDetails } from '@/lib/firm';
import { CLIENT_DISPLAY_STATUS_LABELS } from '@/types';
import DataTable, { type DataTableColumn, WEB_POPOVER } from '@/components/DataTable';

function formatServiceStart(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return '—';
  }
}

function formatLastFollowUp(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return format(d, 'MMM dd, yyyy');
  } catch {
    return '—';
  }
}

const DISPLAY_STATUS_COLOR: Record<string, string> = {
  new: '#0984E3',
  to_follow_up: '#F39C12',
  in_service: '#00B894',
  to_revisit: '#6C5CE7',
  churned: '#B2BEC3',
};

function matchQuery(q: string, client: FirmClientWithDetails): boolean {
  const lower = q.trim().toLowerCase();
  if (!lower) return true;
  const name = (client.name || '').toLowerCase();
  const contact = (client.contactName || '').toLowerCase();
  const email = (client.contactEmail || '').toLowerCase();
  const status = (client.displayStatus ?? '').toLowerCase();
  const assignee = (client.assigneeName ?? client.assigneeEmail ?? '').toLowerCase();
  return name.includes(lower) || contact.includes(lower) || email.includes(lower) || status.includes(lower) || assignee.includes(lower);
}

type GroupByType = 'none' | 'byName' | 'byStatus';
type FilterStatus = 'all' | 'new' | 'to_follow_up' | 'in_service' | 'to_revisit' | 'churned';

function getClientColumns(): DataTableColumn<FirmClientWithDetails>[] {
  return [
    {
      id: 'name',
      label: 'Client',
      minWidth: 140,
      getValue: (r) => <Text style={cellText} numberOfLines={1}>{r.name || '—'}</Text>,
      getSortValue: (r) => (r.name || '').toLowerCase(),
    },
    {
      id: 'contact',
      label: 'Contact',
      minWidth: 120,
      getValue: (r) => <Text style={cellText} numberOfLines={1}>{r.contactName ?? '—'}</Text>,
      getSortValue: (r) => (r.contactName ?? '').toLowerCase(),
    },
    {
      id: 'contactEmail',
      label: 'Contact email',
      minWidth: 180,
      getValue: (r) => <Text style={cellText} numberOfLines={1}>{r.contactEmail ?? '—'}</Text>,
      getSortValue: (r) => (r.contactEmail ?? '').toLowerCase(),
    },
    {
      id: 'displayStatus',
      label: 'Status',
      minWidth: 100,
      getValue: (r) => {
        const raw = r.displayStatus ?? '';
        const label = CLIENT_DISPLAY_STATUS_LABELS[raw as keyof typeof CLIENT_DISPLAY_STATUS_LABELS] ?? raw ?? '—';
        const color = DISPLAY_STATUS_COLOR[raw] ?? '#636E72';
        return (
          <View style={{ flexDirection: 'row', alignSelf: 'flex-start' }}>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: color }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }} numberOfLines={1}>
                {label}
              </Text>
            </View>
          </View>
        );
      },
      getSortValue: (r) => (r.displayStatus ?? ''),
    },
    {
      id: 'assignee',
      label: 'Assignee',
      minWidth: 100,
      getValue: (r) => <Text style={cellText} numberOfLines={1}>{r.assigneeName ?? r.assigneeEmail ?? '—'}</Text>,
      getSortValue: (r) => (r.assigneeName ?? r.assigneeEmail ?? '').toLowerCase(),
    },
    {
      id: 'lastFollowUpAt',
      label: 'Last follow-up',
      minWidth: 110,
      getValue: (r) => <Text style={cellText}>{formatLastFollowUp(r.lastFollowUpAt ?? null)}</Text>,
      getSortValue: (r) => r.lastFollowUpAt ?? '',
    },
    {
      id: 'serviceStartAt',
      label: 'Service start',
      minWidth: 110,
      getValue: (r) => <Text style={cellText}>{formatServiceStart(r.serviceStartAt)}</Text>,
      getSortValue: (r) => r.serviceStartAt ?? '',
    },
  ];
}

const cellText = { fontSize: 14, color: '#2D3436' };

export default function FirmClientsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<FirmClientWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupBy, setGroupBy] = useState<GroupByType>('none');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [orderCountByClient, setOrderCountByClient] = useState<Record<string, number>>({});
  const [groupPopoverRect, setGroupPopoverRect] = useState<{ left: number; top: number } | null>(null);
  const [sortKey, setSortKey] = useState<string | null>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const clientColumns = useMemo(() => getClientColumns(), []);

  // Web: 根据分组按钮位置计算浮窗位置（同 receipts 列表页规范）
  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    if (showGroupMenu) {
      const measure = () => {
        const el = document.getElementById('firm-clients-group-button');
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

  // Web: 点击浮窗外关闭（按钮 + 浮窗均不包含点击目标时）
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node;
      const groupBtn = document.getElementById('firm-clients-group-button');
      const groupPopover = document.getElementById('firm-clients-group-popover');
      if (
        showGroupMenu &&
        groupBtn &&
        !groupBtn.contains(target) &&
        groupPopover &&
        !groupPopover.contains(target)
      ) {
        setShowGroupMenu(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showGroupMenu]);

  const loadData = useCallback(async (forceRefresh = false) => {
    const space = await getCurrentSpace(forceRefresh);
    if (!space?.id || space.kind !== 'firm') {
      router.replace('/');
      return;
    }
    const [list, orders] = await Promise.all([
      getFirmClientsWithDetails(space.id),
      getFirmOrders(space.id),
    ]);
    setClients(list);
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      counts[o.clientSpaceId] = (counts[o.clientSpaceId] ?? 0) + 1;
    });
    setOrderCountByClient(counts);
  }, [router]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData(true);
      setLoading(false);
    })();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  const filteredClients = useMemo(() => {
    if (filterStatus === 'all') return clients;
    return clients.filter((c) => (c.displayStatus ?? '') === filterStatus);
  }, [clients, filterStatus]);

  const searchedClients = useMemo(
    () => filteredClients.filter((c) => matchQuery(searchQuery, c)),
    [filteredClients, searchQuery]
  );

  const sortRowsByColumn = useCallback(
    <T,>(rows: T[], col: { getSortValue?: (row: T) => string | number | Date | null | undefined } | undefined, dir: 'asc' | 'desc'): T[] => {
      if (!col?.getSortValue) return rows;
      return [...rows].sort((a, b) => {
        const va = col.getSortValue!(a);
        const vb = col.getSortValue!(b);
        const cmp = va === vb ? 0 : (va == null ? 1 : vb == null ? -1 : va < vb ? -1 : 1);
        return dir === 'asc' ? cmp : -cmp;
      });
    },
    []
  );

  const groupedSections = useMemo(() => {
    if (groupBy === 'none') return [{ title: 'All', monthKey: 'all', data: searchedClients }];
    if (groupBy === 'byName') {
      const byLetter: Record<string, FirmClientWithDetails[]> = {};
      searchedClients.forEach((c) => {
        const first = (c.name || '').trim().charAt(0).toUpperCase();
        const key = /[A-Z]/.test(first) ? first : '#';
        if (!byLetter[key]) byLetter[key] = [];
        byLetter[key].push(c);
      });
      const keys = Object.keys(byLetter).sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
      return keys.map((k) => ({ title: k, monthKey: k, data: byLetter[k] }));
    }
    if (groupBy === 'byStatus') {
      const order = ['new', 'to_follow_up', 'in_service', 'to_revisit', 'churned'];
      const byStatus: Record<string, FirmClientWithDetails[]> = {};
      searchedClients.forEach((c) => {
        const key = c.displayStatus ?? 'new';
        if (!byStatus[key]) byStatus[key] = [];
        byStatus[key].push(c);
      });
      return order.filter((k) => (byStatus[k]?.length ?? 0) > 0).map((k) => ({
        title: CLIENT_DISPLAY_STATUS_LABELS[k as keyof typeof CLIENT_DISPLAY_STATUS_LABELS] ?? k,
        monthKey: k,
        data: byStatus[k] ?? [],
      }));
    }
    return [{ title: 'All', monthKey: 'all', data: searchedClients }];
  }, [groupBy, searchedClients]);

  const tableSections = useMemo(() => {
    const col = sortKey ? clientColumns.find((c) => c.id === sortKey) : undefined;
    return groupedSections.map((sec) => ({
      title: sec.title,
      data: sortRowsByColumn(sec.data, col, sortDirection),
      count: sec.data.length,
      countLabel: 'clients',
    }));
  }, [groupedSections, sortKey, sortDirection, clientColumns, sortRowsByColumn]);

  const sortedDataForTable = useMemo(() => {
    const col = sortKey ? clientColumns.find((c) => c.id === sortKey) : undefined;
    return sortRowsByColumn(searchedClients, col, sortDirection);
  }, [searchedClients, sortKey, sortDirection, clientColumns, sortRowsByColumn]);

  const tableEmptyMessage = useMemo(() => {
    if (loading && clients.length === 0) return 'Loading...';
    if (clients.length === 0) return 'No clients yet. Add associations in Supabase or later in this module.';
    if (searchedClients.length === 0) return `No results for "${searchQuery}"`;
    return 'No data';
  }, [loading, clients.length, searchedClients.length, searchQuery]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedClientIds.length === 0) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${selectedClientIds.length} selected client(s)?`)) return;
    setBulkDeleting(true);
    const { error } = await deleteFirmClients(selectedClientIds);
    setBulkDeleting(false);
    if (error) {
      if (typeof window !== 'undefined') window.alert(error.message);
      return;
    }
    setSelectedClientIds([]);
    await loadData(true);
  }, [selectedClientIds, loadData]);

  const handleAssignAssignee = useCallback(() => {
    if (typeof window !== 'undefined') window.alert('Assign assignee: coming soon. Will open member picker.');
  }, []);

  // Mobile: receipt-style list (Group, Filter, Search + firstRow/secondRow)
  const clientSections = useMemo(() => {
    const col = sortKey ? clientColumns.find((c) => c.id === sortKey) : undefined;
    return groupedSections.map((sec) => ({
      title: sec.title,
      monthKey: (sec as { monthKey?: string }).monthKey ?? sec.title,
      data: sortRowsByColumn(sec.data, col, sortDirection),
    }));
  }, [groupedSections, sortKey, sortDirection, clientColumns, sortRowsByColumn]);

  const renderMobileList = () => (
    <View style={styles.container}>
      <View style={styles.toolbarSlot}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.sortButton} onPress={() => setShowGroupMenu(!showGroupMenu)}>
              {groupBy === 'none' && <Ionicons name="list-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
              {groupBy === 'byName' && <Ionicons name="albums-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
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
            <TouchableOpacity style={[styles.groupOption, groupBy === 'byName' && styles.groupOptionSelected]} onPress={() => { setGroupBy('byName'); setShowGroupMenu(false); }}>
              <Text style={[styles.groupOptionText, groupBy === 'byName' && styles.groupOptionTextSelected]}>By name</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.groupOption, groupBy === 'byStatus' && styles.groupOptionSelected]} onPress={() => { setGroupBy('byStatus'); setShowGroupMenu(false); }}>
              <Text style={[styles.groupOptionText, groupBy === 'byStatus' && styles.groupOptionTextSelected]}>By status</Text>
            </TouchableOpacity>
          </View>
        )}
        {showFilterMenu && (
          <View style={styles.groupDropdown}>
            {(['all', 'new', 'to_follow_up', 'in_service', 'to_revisit', 'churned'] as FilterStatus[]).map((key) => (
              <TouchableOpacity key={key} style={[styles.groupOption, filterStatus === key && styles.groupOptionSelected]} onPress={() => { setFilterStatus(key); setShowFilterMenu(false); }}>
                <Text style={[styles.groupOptionText, filterStatus === key && styles.groupOptionTextSelected]}>{key === 'all' ? 'All' : CLIENT_DISPLAY_STATUS_LABELS[key as keyof typeof CLIENT_DISPLAY_STATUS_LABELS]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      {loading && clients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6C5CE7" />
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : (
        <SectionList
          sections={clientSections}
          keyExtractor={(c) => c.id}
          renderItem={({ item: c }) => {
            const orderCount = orderCountByClient[c.clientSpaceId] ?? 0;
            const statusLabel = CLIENT_DISPLAY_STATUS_LABELS[c.displayStatus ?? ''] ?? c.displayStatus ?? '—';
            return (
              <TouchableOpacity
                style={styles.receiptItem}
                onPress={() => router.push(`/firm/client/${c.clientSpaceId}`)}
                activeOpacity={0.7}
              >
                <View style={styles.receiptContent}>
                  <View style={styles.firstRow}>
                    <Text style={styles.storeName} numberOfLines={1}>{c.name || '—'}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: DISPLAY_STATUS_COLOR[c.displayStatus ?? ''] ?? '#636E72' }]}>
                      <Text style={styles.statusText}>{statusLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.secondRow}>
                    <Text style={styles.amount}>{orderCount} orders</Text>
                    <Text style={styles.createdDate}>{formatLastFollowUp(c.lastFollowUpAt ?? null)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          renderSectionHeader={({ section }) => {
            if (section.monthKey === 'all' || section.data.length === 0) return null;
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionHeaderRight}>
                  <Text style={styles.sectionCount}>{section.data.length} clients</Text>
                </View>
              </View>
            );
          }}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={clientSections.every((s) => s.data.length === 0) ? styles.emptyList : styles.listContent}
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
      </View>
    );
  }

  // Web: DataTable with search, group, sort; 有选中时用批量操作行替换分组/搜索行，同高防抖
  const hasSelection = selectedClientIds.length > 0;
  return (
    <View style={styles.webContainer}>
      <View style={styles.toolbarSlot}>
        {hasSelection ? (
          <View style={styles.bulkBar}>
            <Text style={styles.bulkText}>{selectedClientIds.length} selected</Text>
            <TouchableOpacity
              style={[styles.bulkBtn, bulkDeleting && styles.bulkBtnDisabled]}
              onPress={handleBulkDelete}
              disabled={bulkDeleting}
              activeOpacity={0.7}
            >
              {bulkDeleting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="trash-outline" size={18} color="#fff" />}
              <Text style={styles.bulkBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkBtn} onPress={handleAssignAssignee} activeOpacity={0.7}>
              <Ionicons name="person-outline" size={18} color="#fff" />
              <Text style={styles.bulkBtnText}>Assign</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkBtnClear} onPress={() => setSelectedClientIds([])} activeOpacity={0.7}>
              <Text style={styles.bulkBtnClearText}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View
                style={styles.groupWrap}
                {...(Platform.OS === 'web' ? { nativeID: 'firm-clients-group-button' } : {})}
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
                  {groupBy === 'byName' && (
                    <Ionicons
                      name="albums-outline"
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
                        groupBy === 'byName' && styles.groupOptionSelected,
                      ]}
                      onPress={() => {
                        setGroupBy('byName');
                        setShowGroupMenu(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.groupOptionText,
                          groupBy === 'byName' && styles.groupOptionTextSelected,
                        ]}
                      >
                        By name
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={18} color="#636E72" style={styles.searchIcon} />
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
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.searchClear}>
                    <Ionicons name="close-circle" size={20} color="#95A5A6" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        )}
      </View>

      {(loading && clients.length === 0) ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6C5CE7" />
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.tableScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={loading && clients.length === 0 ? { flexGrow: 1 } : { flexGrow: 0 }}
        >
          <DataTable<FirmClientWithDetails>
            columns={clientColumns}
            data={groupBy === 'none' ? sortedDataForTable : undefined}
            sections={groupBy !== 'none' ? tableSections : undefined}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={(key, dir) => { setSortKey(key); setSortDirection(dir); }}
            onRowPress={(row) => router.push(`/firm/client/${row.clientSpaceId}`)}
            keyExtractor={(r) => r.id}
            emptyMessage={tableEmptyMessage}
            storageKey="firm-clients-table"
            selectable
            selectableRevealOnHover
            selectedIds={selectedClientIds}
            onSelectedIdsChange={setSelectedClientIds}
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
            id="firm-clients-group-popover"
            style={{ ...WEB_POPOVER.container, left: groupPopoverRect.left, top: groupPopoverRect.top }}
          >
            <Text style={WEB_POPOVER.title}>Group</Text>
            <View>
              {[
                { key: 'none' as GroupByType, label: 'None', icon: 'list-outline' as const },
                { key: 'byName' as GroupByType, label: 'By name', icon: 'albums-outline' as const },
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
    </View>
  );
}

const styles = StyleSheet.create({
  // Match Expenses (receipts) page: container + header + headerRow + sortButton + searchContainer
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
  receiptContent: { flex: 1 },
  firstRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  storeName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#2D3436', marginRight: 12 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  confirmedByText: { fontSize: 12, color: '#636E72', fontWeight: '500' },
  secondRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: { fontSize: 16, fontWeight: '600', color: '#6C5CE7' },
  date: { fontSize: 14, color: '#636E72' },
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
  bulkText: { fontSize: 14, color: '#2D3436', fontWeight: '500', marginRight: 8 },
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
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
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
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#2D3436', marginBottom: 12 },
  cardRow: { flexDirection: 'row', marginBottom: 6 },
  label: { fontSize: 13, color: '#636E72', width: 110 },
  value: { flex: 1, fontSize: 14, color: '#2D3436' },
});
