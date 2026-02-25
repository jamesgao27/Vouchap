/**
 * Firm - Client: associated clients. Web: DataTable (columns, search, filter, group, sort). Mobile: card list.
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentSpace } from '@/lib/auth';
import { getFirmClientsWithDetails, deleteFirmClients } from '@/lib/firm';
import type { FirmClientWithDetails } from '@/lib/firm';
import DataTable, { type DataTableColumn } from '@/components/DataTable';

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
    return d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return '—';
  }
}

const DISPLAY_STATUS_LABEL: Record<string, string> = {
  new: 'New',
  to_follow_up: 'To follow up',
  in_service: 'In service',
  to_revisit: 'To revisit',
  churned: 'Churned',
};

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

type GroupByType = 'none' | 'byName';

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
        const label = DISPLAY_STATUS_LABEL[raw] ?? raw ?? '—';
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
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const clientColumns = useMemo(() => getClientColumns(), []);

  // Close group dropdown on outside click (Web)
  useEffect(() => {
    if (Platform.OS !== 'web' || !showGroupMenu) return;
    const handler = (e: PointerEvent) => {
      const wrap = document.getElementById('firm-clients-group-wrap');
      const target = e.target as Node;
      if (wrap && !wrap.contains(target)) setShowGroupMenu(false);
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', handler);
    };
  }, [showGroupMenu]);

  const loadData = useCallback(async (forceRefresh = false) => {
    const space = await getCurrentSpace(forceRefresh);
    if (!space?.id || space.kind !== 'firm') {
      router.replace('/');
      return;
    }
    const list = await getFirmClientsWithDetails(space.id);
    setClients(list);
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

  const searchedClients = useMemo(
    () => clients.filter((c) => matchQuery(searchQuery, c)),
    [clients, searchQuery]
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
    if (groupBy !== 'byName') return [{ title: 'All', data: searchedClients }];
    const byLetter: Record<string, FirmClientWithDetails[]> = {};
    searchedClients.forEach((c) => {
      const first = (c.name || '').trim().charAt(0).toUpperCase();
      const key = /[A-Z]/.test(first) ? first : '#';
      if (!byLetter[key]) byLetter[key] = [];
      byLetter[key].push(c);
    });
    const keys = Object.keys(byLetter).sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
    return keys.map((k) => ({ title: k, data: byLetter[k] }));
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

  // Mobile: card list (DataTable returns null on non-web)
  const renderMobileList = () => (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.searchWrap}>
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
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.searchClear}>
            <Ionicons name="close-circle" size={20} color="#95A5A6" />
          </TouchableOpacity>
        )}
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#6C5CE7" style={styles.loader} />
      ) : searchedClients.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{tableEmptyMessage}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {searchedClients.map((c) => (
            <View key={c.id} style={styles.card}>
              <Text style={styles.cardTitle}>{c.name}</Text>
              <View style={styles.cardRow}>
                <Text style={styles.label}>Contact</Text>
                <Text style={styles.value}>{c.contactName ?? '—'}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.label}>Contact email</Text>
                <Text style={styles.value}>{c.contactEmail ?? '—'}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.label}>Status</Text>
                <Text style={styles.value}>{DISPLAY_STATUS_LABEL[c.displayStatus ?? ''] ?? c.displayStatus ?? '—'}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.label}>Assignee</Text>
                <Text style={styles.value}>{c.assigneeName ?? c.assigneeEmail ?? '—'}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.label}>Last follow-up</Text>
                <Text style={styles.value}>{formatLastFollowUp(c.lastFollowUpAt ?? null)}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.label}>Service start</Text>
                <Text style={styles.value}>{formatServiceStart(c.serviceStartAt)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
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
              <View style={styles.groupWrap} nativeID="firm-clients-group-wrap">
                <TouchableOpacity
                  style={styles.sortButton}
                  onPress={() => setShowGroupMenu(!showGroupMenu)}
                  activeOpacity={0.7}
                >
                  {groupBy === 'none' && <Ionicons name="list-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
                  {groupBy === 'byName' && <Ionicons name="albums-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
                  <Text style={styles.sortText}>Group</Text>
                  <Ionicons name="chevron-down" size={16} color="#636E72" />
                </TouchableOpacity>
                {showGroupMenu && (
                  <View style={styles.groupDropdown}>
                    <TouchableOpacity
                      style={[styles.groupOption, groupBy === 'none' && styles.groupOptionSelected]}
                      onPress={() => { setGroupBy('none'); setShowGroupMenu(false); }}
                    >
                      <Text style={[styles.groupOptionText, groupBy === 'none' && styles.groupOptionTextSelected]}>None</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.groupOption, groupBy === 'byName' && styles.groupOptionSelected]}
                      onPress={() => { setGroupBy('byName'); setShowGroupMenu(false); }}
                    >
                      <Text style={[styles.groupOptionText, groupBy === 'byName' && styles.groupOptionTextSelected]}>By name</Text>
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
  },
  header: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupWrap: { position: 'relative' },
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
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
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
