/**
 * Firm - Client: associated clients. Web: DataTable (columns, search, filter, group, sort). Mobile: card list.
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
  getFirmOrders,
  deleteFirmClients,
  getFirmSkus,
  getFirmSpaceMembers,
  updateFirmClientAssignee,
} from '@/lib/firm';
import type { FirmClientWithDetails, FirmSku, FirmSpaceMember } from '@/lib/firm';
import { CLIENT_DISPLAY_STATUS_LABELS } from '@/types';
import DataTable, { type DataTableColumn, WEB_POPOVER } from '@/components/DataTable';
import QRCode from 'react-native-qrcode-svg';
import {
  buildFirmClientInviteUrl,
  createFirmClientInviteToken,
  createPendingOrderForInvitee,
  createInviteeOnly,
  getFirmClientInviteHistory,
  setFirmClientInviteActive,
  deleteFirmClientInviteToken,
  type FirmClientInviteToken,
} from '@/lib/firm-clients';
import { showToast } from '@/lib/toast';
import { showConfirmDestructiveDialog } from '@/lib/confirmDialog';
import CenterModal from '@/components/CenterModal';
import SkuPreview from '@/components/SkuPreview';

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
        const firstTag = r.labels?.[0];
        if (firstTag) {
          return (
            <View style={{ flexDirection: 'row', alignSelf: 'flex-start' }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#6C5CE7' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }} numberOfLines={1}>
                  {firstTag}
                </Text>
              </View>
            </View>
          );
        }
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
      getSortValue: (r) => (r.labels?.[0] ?? r.displayStatus ?? ''),
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
  const [firmSpaceId, setFirmSpaceId] = useState<string | null>(null);
  const [firmSpaceName, setFirmSpaceName] = useState<string>('');
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
  const [inviteSkus, setInviteSkus] = useState<FirmSku[]>([]);
  const [inviteSkuId, setInviteSkuId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState<number | null>(7);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [showInviteHistory, setShowInviteHistory] = useState(false);
  const [inviteHistory, setInviteHistory] = useState<FirmClientInviteToken[]>([]);
  const [inviteHistoryLoading, setInviteHistoryLoading] = useState(false);
  const [inviteHistoryError, setInviteHistoryError] = useState<string | null>(null);
  const [updatingInviteId, setUpdatingInviteId] = useState<string | null>(null);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);
  const [inviteFromHistory, setInviteFromHistory] = useState(false);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assignMembers, setAssignMembers] = useState<FirmSpaceMember[]>([]);
  const [assignSelectedMemberId, setAssignSelectedMemberId] = useState<string | null>(null);
  const [assignMembersLoading, setAssignMembersLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const qrRef = useRef<any | null>(null);
  // Add client (on-behalf) modal
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [addClientClientName, setAddClientClientName] = useState('');
  const [addClientContactName, setAddClientContactName] = useState('');
  const [addClientContactEmail, setAddClientContactEmail] = useState('');
  const [addClientSkuId, setAddClientSkuId] = useState<string | null>(null);
  const [addClientSendInvite, setAddClientSendInvite] = useState(true);
  const [addClientSubmitting, setAddClientSubmitting] = useState(false);
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [showAddClientSkuMenu, setShowAddClientSkuMenu] = useState(false);
  const [addClientSelectRect, setAddClientSelectRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

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

  // Web: 计算 Add client 表单中 Service template 选单的全局位置，用于浮层选单（避免被 ScrollView 裁剪）
  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!showAddClientSkuMenu) {
      setAddClientSelectRect(null);
      return;
    }
    const measure = () => {
      const el = document.getElementById('add-client-template-select');
      if (el) {
        const r = el.getBoundingClientRect();
        setAddClientSelectRect({
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
        });
      } else {
        setAddClientSelectRect(null);
      }
    };
    measure();
    const t = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(t);
      setAddClientSelectRect(null);
    };
  }, [showAddClientSkuMenu]);

  // Web: 点击浮窗外关闭（仅分组下拉；邀请使用 CenterModal 自带遮罩）
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
    setFirmSpaceId(space.id);
    setFirmSpaceName(space.name ?? '');
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

  useEffect(() => {
    if (!firmSpaceId) return;
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => loadData(true), 300);
    };
    const chClients = supabase
      .channel(`firm-clients-${firmSpaceId}`)
      .on('postgres_changes', { event: '*', schema: 'firm', table: 'clients', filter: `firm_space_id=eq.${firmSpaceId}` }, debouncedRefresh)
      .subscribe();
    const chOrders = supabase
      .channel(`firm-orders-clients-${firmSpaceId}`)
      .on('postgres_changes', { event: '*', schema: 'firm', table: 'orders', filter: `firm_space_id=eq.${firmSpaceId}` }, debouncedRefresh)
      .subscribe();
    const chInvitees = supabase
      .channel(`firm-invitee-clients-${firmSpaceId}`)
      .on('postgres_changes', { event: '*', schema: 'firm', table: 'invitee_clients', filter: `firm_space_id=eq.${firmSpaceId}` }, debouncedRefresh)
      .subscribe();
    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      supabase.removeChannel(chClients);
      supabase.removeChannel(chOrders);
      supabase.removeChannel(chInvitees);
    };
  }, [firmSpaceId, loadData]);

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

  const handleOpenAssignPicker = useCallback(async () => {
    if (selectedClientIds.length === 0 || !firmSpaceId) return;
    setShowAssignPicker(true);
    setAssignSelectedMemberId(null);
    setAssignMembersLoading(true);
    setAssignMembers([]);
    const members = await getFirmSpaceMembers(firmSpaceId);
    setAssignMembers(members);
    setAssignMembersLoading(false);
  }, [selectedClientIds.length, firmSpaceId]);

  const handleAssignPickerDone = useCallback(async () => {
    if (selectedClientIds.length === 0) return;
    setAssignSaving(true);
    let lastError: string | null = null;
    for (const clientId of selectedClientIds) {
      const { error } = await updateFirmClientAssignee(clientId, assignSelectedMemberId);
      if (error) lastError = error.message;
    }
    setAssignSaving(false);
    setShowAssignPicker(false);
    setSelectedClientIds([]);
    await loadData(true);
    if (lastError && typeof window !== 'undefined') window.alert(lastError);
  }, [selectedClientIds, assignSelectedMemberId, loadData]);

  const handleCopyInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    if (typeof window !== 'undefined' && (navigator as any)?.clipboard) {
      try {
        await (navigator as any).clipboard.writeText(inviteLink);
      } catch {
        // ignore clipboard errors
      }
    }
  }, [inviteLink]);

  const handleDownloadInviteQr = useCallback(() => {
    if (!inviteLink || !qrRef.current) return;
    // 目前仅在 Web 提供下载，移动端建议截图保存
    if (Platform.OS !== 'web') {
      if (typeof window !== 'undefined') {
        window.alert('请在桌面浏览器中下载二维码，或在移动端通过截图保存。');
      }
      return;
    }
    try {
      qrRef.current.toDataURL((data: string) => {
        const a = document.createElement('a');
        a.href = `data:image/png;base64,${data}`;
        a.download = 'vouchap-client-invite-qr.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    } catch {
      // ignore
    }
  }, [inviteLink]);

  const handleToggleInviteActive = useCallback(
    async (row: FirmClientInviteToken) => {
      const newActive = !row.isActive;
      setUpdatingInviteId(row.id);
      setInviteHistoryError(null);
      // 乐观更新本地状态
      setInviteHistory((prev) =>
        prev.map((it) => (it.id === row.id ? { ...it, isActive: newActive } : it))
      );
      const { error } = await setFirmClientInviteActive(row.id, newActive);
      setUpdatingInviteId(null);
      if (error) {
        // 还原状态并提示错误
        setInviteHistory((prev) =>
          prev.map((it) => (it.id === row.id ? { ...it, isActive: row.isActive } : it))
        );
        setInviteHistoryError(error.message);
      }
    },
    []
  );

  const handleOpenInviteFromHistory = useCallback(
    (row: FirmClientInviteToken) => {
      if (!row) return;
      const url = buildFirmClientInviteUrl(row.token, firmSpaceName);
      setInviteLink(url);
      setInviteSkuId(row.skuId);
      setShowInviteHistory(false);
      setInviteFromHistory(true);
      setShowInvitePanel(true);
    },
    [firmSpaceName]
  );

  const handleCreateNewFromHistory = useCallback(async () => {
    setShowInviteHistory(false);
    setInviteFromHistory(false);
    setInviteError(null);
    setInviteLink(null);
    setInviteExpiresInDays(7);
    setShowInvitePanel(true);
    if (firmSpaceId && inviteSkus.length === 0) {
      const all = await getFirmSkus(firmSpaceId);
      const skus = all.filter(
        (s) => (s.templateStatus != null ? s.templateStatus !== 'draft' : (s.isPublished === true || !!s.taxCountry || !!s.taxScenario))
      );
      setInviteSkus(skus);
      if (skus.length > 0) setInviteSkuId(skus[0].id);
    }
  }, [firmSpaceId, inviteSkus.length]);

  const handleDeleteInvite = useCallback((row: FirmClientInviteToken) => {
    showConfirmDestructiveDialog(
      'Delete invite',
      'Delete this invite? The link will stop working.',
      async () => {
        setDeletingInviteId(row.id);
        setInviteHistoryError(null);
        const { error } = await deleteFirmClientInviteToken(row.id);
        setDeletingInviteId(null);
        if (error) {
          setInviteHistoryError(error.message);
          return;
        }
        setInviteHistory((prev) => prev.filter((it) => it.id !== row.id));
      },
      { confirmLabel: 'Delete' },
    );
  }, []);

  const handleToggleInvitePanel = useCallback(async () => {
    if (showInvitePanel) {
      setShowInvitePanel(false);
      setInviteFromHistory(false);
      return;
    }
    setShowInvitePanel(true);
    setInviteFromHistory(false);
    setInviteError(null);
    setInviteLink(null);
    setInviteExpiresInDays(7);
    if (!firmSpaceId) return;
    if (inviteSkus.length === 0) {
      const all = await getFirmSkus(firmSpaceId);
      const skus = all.filter(
        (s) => (s.templateStatus != null ? s.templateStatus !== 'draft' : (s.isPublished === true || !!s.taxCountry || !!s.taxScenario))
      );
      setInviteSkus(skus);
      if (skus.length > 0) {
        setInviteSkuId((prev) => prev ?? skus[0].id);
      }
    }
  }, [showInvitePanel, firmSpaceId, inviteSkus.length]);

  const handleOpenInviteHistory = useCallback(async () => {
    if (!firmSpaceId) return;
    setShowInviteHistory(true);
    setInviteHistoryLoading(true);
    setInviteHistoryError(null);

    const [historyRes, allSkus] = await Promise.all([
      getFirmClientInviteHistory(firmSpaceId),
      inviteSkus.length === 0 ? getFirmSkus(firmSpaceId) : Promise.resolve(null),
    ]);

    setInviteHistoryLoading(false);

    if (historyRes.error) {
      setInviteHistoryError(historyRes.error.message);
    } else {
      setInviteHistory(historyRes.invites);
    }

    if (allSkus && Array.isArray(allSkus)) {
      const skus = allSkus.filter(
        (s) => (s.templateStatus != null ? s.templateStatus !== 'draft' : (s.isPublished === true || !!s.taxCountry || !!s.taxScenario))
      );
      setInviteSkus(skus);
    }
  }, [firmSpaceId, inviteSkus.length]);

  const handleCreateInvite = useCallback(async () => {
    if (!firmSpaceId || !inviteSkuId) return;
    setInviteLoading(true);
    setInviteError(null);
    const { token, url, error } = await createFirmClientInviteToken(
      firmSpaceId,
      inviteSkuId,
      inviteExpiresInDays ?? undefined
    );
    setInviteLoading(false);
    if (error || !token) {
      setInviteError(error?.message || 'Failed to create invite. Please try again.');
      return;
    }
    // API 返回的 url 已含 firm 名称（createFirmClientInviteToken 内查 space 名称写入）
    const linkUrl = url || buildFirmClientInviteUrl(token, firmSpaceName);
    setInviteLink(linkUrl);
    if (typeof window !== 'undefined' && (navigator as any)?.clipboard) {
      try {
        await (navigator as any).clipboard.writeText(linkUrl);
      } catch {
        // ignore clipboard errors
      }
    }
  }, [firmSpaceId, inviteSkuId, inviteExpiresInDays, firmSpaceName]);

  // Mobile: receipt-style list (Group, Filter, Search + firstRow/secondRow)
  const clientSections = useMemo(() => {
    const col = sortKey ? clientColumns.find((c) => c.id === sortKey) : undefined;
    return groupedSections.map((sec) => ({
      title: sec.title,
      monthKey: (sec as { monthKey?: string }).monthKey ?? sec.title,
      data: sortRowsByColumn(sec.data, col, sortDirection),
    }));
  }, [groupedSections, sortKey, sortDirection, clientColumns, sortRowsByColumn]);

  const handleCloseInvitePanel = useCallback(() => {
    setShowInvitePanel(false);
    if (inviteFromHistory) {
      setShowInviteHistory(true);
      setInviteFromHistory(false);
    }
  }, [inviteFromHistory]);

  const handleOpenAddClientModal = useCallback(async () => {
    setShowAddClientModal(true);
    setAddClientError(null);
    setAddClientClientName('');
    setAddClientContactName('');
    setAddClientContactEmail('');
    setAddClientSkuId(null);
    setAddClientSendInvite(true);
    if (firmSpaceId && inviteSkus.length === 0) {
      const all = await getFirmSkus(firmSpaceId);
      const skus = all.filter(
        (s) => (s.templateStatus != null ? s.templateStatus !== 'draft' : (s.isPublished === true || !!s.taxCountry || !!s.taxScenario))
      );
      setInviteSkus(skus);
      setAddClientSkuId(skus.length > 0 ? skus[0].id : null);
    } else {
      setAddClientSkuId(inviteSkus.length > 0 ? inviteSkus[0].id : null);
    }
  }, [firmSpaceId, inviteSkus.length, inviteSkus]);
  const handleCloseAddClientModal = useCallback(() => {
    setShowAddClientModal(false);
    setAddClientError(null);
    setShowAddClientSkuMenu(false);
  }, []);
  const handleAddClientSubmit = useCallback(async () => {
    if (!firmSpaceId) return;
    const email = (addClientContactEmail || '').trim().toLowerCase();
    if (!email) {
      setAddClientError('Contact email is required to let the client claim this engagement later.');
      return;
    }
    setAddClientSubmitting(true);
    setAddClientError(null);
    const hasTemplate = !!addClientSkuId;
    let error: Error | null = null;
    if (hasTemplate) {
      const { error: pendingError } = await createPendingOrderForInvitee(firmSpaceId, {
        clientName: addClientClientName.trim(),
        contactName: addClientContactName.trim(),
        contactEmail: email,
        skuId: (addClientSkuId ?? '') as string,
      });
      error = pendingError;
    } else {
      const { error: inviteeError } = await createInviteeOnly(firmSpaceId, {
        clientName: addClientClientName.trim(),
        contactName: addClientContactName.trim(),
        contactEmail: email,
      });
      error = inviteeError;
    }
    setAddClientSubmitting(false);
    if (error) {
      setAddClientError(error.message);
      return;
    }
    showToast(
      hasTemplate ? 'Pending engagement created.' : 'Client saved. They can link their space when they sign in.',
      'success'
    );
    setShowAddClientModal(false);
    setAddClientClientName('');
    setAddClientContactName('');
    setAddClientContactEmail('');
    setAddClientSkuId(inviteSkus.length > 0 ? inviteSkus[0].id : null);
    setAddClientSendInvite(true);
    await loadData(true);
  }, [firmSpaceId, addClientClientName, addClientContactName, addClientContactEmail, addClientSkuId, inviteSkus, loadData]);

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
            {/* Mobile: Add client + 邀请与历史入口 */}
            <View style={styles.mobileInviteActions}>
              <TouchableOpacity
                style={styles.mobileIconButton}
                onPress={handleOpenAddClientModal}
                activeOpacity={0.7}
              >
                <Ionicons name="person-add-outline" size={18} color="#6C5CE7" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mobileIconButton}
                onPress={handleToggleInvitePanel}
                activeOpacity={0.7}
              >
                <Ionicons name="share-outline" size={18} color="#6C5CE7" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mobileIconButton}
                onPress={handleOpenInviteHistory}
                activeOpacity={0.7}
              >
                <Ionicons name="time-outline" size={18} color="#636E72" />
              </TouchableOpacity>
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
            const firstTag = c.labels?.[0];
            const statusLabel = firstTag ?? (CLIENT_DISPLAY_STATUS_LABELS[c.displayStatus ?? ''] ?? c.displayStatus ?? '—');
            const statusColor = firstTag ? '#6C5CE7' : (DISPLAY_STATUS_COLOR[c.displayStatus ?? ''] ?? '#636E72');
            const isPending = c.isPendingClaim === true || !c.clientSpaceId;
            return (
              <TouchableOpacity
                style={[styles.receiptItem, isPending && styles.receiptItemPending]}
                onPress={() => {
                  if (isPending) return;
                  router.push(`/firm/client/${c.clientSpaceId}`);
                }}
                activeOpacity={isPending ? 1 : 0.7}
                disabled={isPending}
              >
                <View style={styles.receiptContent}>
                  <View style={styles.firstRow}>
                    <Text style={styles.storeName} numberOfLines={1}>{c.name || '—'}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                      <Text style={styles.statusText}>{isPending ? 'Pending claim' : statusLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.secondRow}>
                    <Text style={styles.amount}>{orderCount} orders{isPending ? ' (awaiting client)' : ''}</Text>
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
            <TouchableOpacity style={styles.bulkBtn} onPress={handleOpenAssignPicker} activeOpacity={0.7}>
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
              <TouchableOpacity
                style={[styles.inviteButton, { marginRight: 8 }]}
                onPress={handleOpenAddClientModal}
                activeOpacity={0.7}
              >
                <Ionicons name="person-add-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />
                <Text style={styles.inviteButtonText}>Add client</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inviteHistoryButton}
                onPress={handleOpenInviteHistory}
                activeOpacity={0.7}
              >
                <Ionicons name="qr-code-outline" size={18} color="#636E72" style={{ marginRight: 4 }} />
                <Text style={styles.inviteHistoryButtonText}>Open invite</Text>
              </TouchableOpacity>
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
            onRowPress={(row) => {
              if (row.isPendingClaim === true || !row.clientSpaceId) return;
              router.push(`/firm/client/${row.clientSpaceId}`);
            }}
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
      <CenterModal
        visible={showInvitePanel}
        title="Invite new clients"
        onClose={handleCloseInvitePanel}
        maxWidth={900}
        cardHeight={720}
      >
        <View style={styles.inviteHeader}>
          <Text style={styles.inviteSubtitle}>
            Step 1: choose a Service Template for this engagement.{'\n'}Step 2: configure invite expiry and share the link / QR code.
          </Text>
        </View>
        <View style={styles.inviteBodyRow}>
          <View style={styles.inviteLeftColumn}>
            <Text style={styles.inviteSectionTitle}>Step 1 · Select Service Template</Text>
            <View style={styles.inviteSkuTable}>
              <View style={styles.inviteSkuHeaderRow}>
                <Text style={[styles.inviteSkuHeaderText, { flex: 1.6 }]}>Service Template</Text>
              </View>
              <ScrollView
                style={styles.inviteSkuList}
                contentContainerStyle={styles.inviteSkuListContent}
              >
                {inviteSkus.map((sku, index) => (
                  <TouchableOpacity
                    key={sku.id}
                    style={[
                      styles.inviteSkuRow,
                      inviteSkuId === sku.id && styles.inviteSkuRowSelected,
                      index === inviteSkus.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => setInviteSkuId(sku.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.inviteSkuRowMain}>
                      <View style={{ flex: 1.6, paddingRight: 8 }}>
                        <Text
                          style={[
                            styles.inviteSkuName,
                            inviteSkuId === sku.id && styles.inviteSkuNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {sku.name}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
                {inviteSkus.length === 0 && (
                  <Text style={styles.inviteHintText}>Please configure Service Catalog in the Firm module first.</Text>
                )}
              </ScrollView>
            </View>
            <View style={{ marginTop: 36 }}>
              <Text style={styles.inviteSectionTitle}>Step 2 · Expiry setting</Text>
              <View style={styles.inviteSettingsRow}>
                <View style={styles.inviteSettingsLeft}>
                  <View style={styles.inviteConfigRow}>
                    {/* label removed; title above already explains expiry setting */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={styles.invitePillRow}>
                        {[
                          { label: '7 days', value: 7 },
                          { label: '30 days', value: 30 },
                          { label: 'No expiry', value: null },
                        ].map((opt) => (
                          <TouchableOpacity
                            key={String(opt.value ?? 'forever')}
                            style={[
                              styles.invitePill,
                              inviteExpiresInDays === opt.value && styles.invitePillSelected,
                            ]}
                            onPress={() => setInviteExpiresInDays(opt.value)}
                          >
                            <Text
                              style={[
                                styles.invitePillText,
                                inviteExpiresInDays === opt.value && styles.invitePillTextSelected,
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.invitePrimaryBtn,
                          (!inviteSkuId || inviteLoading) && styles.invitePrimaryBtnDisabled,
                        ]}
                        onPress={handleCreateInvite}
                        disabled={!inviteSkuId || inviteLoading}
                        activeOpacity={0.8}
                      >
                        {inviteLoading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="link-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                        )}
                        <Text style={styles.invitePrimaryBtnText}>
                          {inviteLoading ? 'Generating...' : 'Generate invite link'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {inviteError && <Text style={styles.inviteErrorText}>{inviteError}</Text>}
                  {inviteLink && (
                    <View style={[styles.inviteResultRow, { marginTop: 36, flexDirection: 'column', alignItems: 'flex-start' }]}>
                      <View style={styles.inviteQrRow}>
                        <View style={styles.inviteQrBox}>
                          {inviteLink ? (
                            <QRCode
                              value={inviteLink}
                              size={96}
                              getRef={(c) => {
                                qrRef.current = c;
                              }}
                            />
                          ) : null}
                        </View>
                        {Platform.OS === 'web' && (
                          <TouchableOpacity
                            style={[styles.inviteSecondaryBtn, { marginLeft: 8 }]}
                            onPress={handleDownloadInviteQr}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="download-outline" size={16} color="#6C5CE7" style={{ marginRight: 4 }} />
                            <Text style={styles.inviteSecondaryBtnText}>Download QR</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={{ marginTop: 8, width: '100%' }}>
                        <Text style={styles.inviteLinkLabel}>Invite link</Text>
                        <View style={styles.inviteLinkCodeRow}>
                          <View style={styles.inviteLinkCodeBox}>
                            <Text style={styles.inviteLinkCodeText}>
                              {inviteLink}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[styles.inviteSecondaryBtn, { marginLeft: 8 }]}
                            onPress={handleCopyInviteLink}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="copy-outline" size={16} color="#6C5CE7" style={{ marginRight: 4 }} />
                            <Text style={styles.inviteSecondaryBtnText}>Copy link</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
          <View style={styles.inviteRightColumn}>
            <Text style={styles.inviteSectionTitle}>Service preview</Text>
            <SkuPreview sku={inviteSkus.find((s) => s.id === inviteSkuId) ?? null} />
          </View>
        </View>
      </CenterModal>
      {Platform.OS === 'web' &&
        showAddClientSkuMenu &&
        addClientSelectRect &&
        typeof document !== 'undefined' &&
        document.body &&
        createPortal(
          <div
            style={{
              position: 'absolute',
              left: addClientSelectRect.left,
              top: addClientSelectRect.top + addClientSelectRect.height + 4,
              width: addClientSelectRect.width,
              zIndex: 99999,
            }}
          >
            <View style={styles.addClientSelectDropdown}>
              <ScrollView
                style={styles.addClientSelectDropdownScroll}
                contentContainerStyle={styles.addClientSelectDropdownContent}
                nestedScrollEnabled
              >
                <TouchableOpacity
                  key="__none__"
                  style={[
                    styles.addClientSelectOption,
                    !addClientSkuId && styles.addClientSelectOptionSelected,
                  ]}
                  onPress={() => {
                    setAddClientSkuId(null);
                    setShowAddClientSkuMenu(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.addClientSelectOptionTitle,
                      !addClientSkuId && styles.addClientSelectOptionTitleSelected,
                    ]}
                    numberOfLines={1}
                  >
                    Create client only (no template)
                  </Text>
                </TouchableOpacity>
                {inviteSkus.map((sku) => (
                  <TouchableOpacity
                    key={sku.id}
                    style={[
                      styles.addClientSelectOption,
                      addClientSkuId === sku.id && styles.addClientSelectOptionSelected,
                    ]}
                    onPress={() => {
                      setAddClientSkuId(sku.id);
                      setShowAddClientSkuMenu(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.addClientSelectOptionTitle,
                        addClientSkuId === sku.id && styles.addClientSelectOptionTitleSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {sku.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </div>,
          document.body
        )}
      <CenterModal
        visible={showInviteHistory}
        title="Open invite"
        onClose={() => setShowInviteHistory(false)}
        maxWidth={900}
        contentFillsHeight
      >
        <View style={styles.inviteHistoryContainer}>
          <View style={styles.inviteHeader}>
            <Text style={styles.inviteSubtitle}>
              Review all open invites sent by this firm, including initiator, Service Template, expiry and how many client spaces joined.
            </Text>
          </View>
          {inviteHistoryLoading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#6C5CE7" />
            </View>
          ) : (
            <View style={styles.inviteHistoryBodyWrap}>
              <View style={[styles.inviteHistoryTable, styles.inviteHistoryTableOuter]}>
                <View style={[styles.inviteSkuHeaderRow, styles.inviteHistoryHeaderRow]}>
                  <View style={styles.inviteHistoryColService}>
                    <Text style={styles.inviteSkuHeaderText}>Service Template</Text>
                  </View>
                  <View style={styles.inviteHistoryColExpiry}>
                    <Text style={styles.inviteSkuHeaderText}>Expiry</Text>
                  </View>
                  <View style={styles.inviteHistoryColActive}>
                    <Text style={[styles.inviteSkuHeaderText, { textAlign: 'center' }]}>Active</Text>
                  </View>
                  <View style={styles.inviteHistoryColJoined}>
                    <Text style={[styles.inviteSkuHeaderText, { textAlign: 'right' }]}>Joined</Text>
                  </View>
                  <View style={styles.inviteHistoryColInitiator}>
                    <Text style={[styles.inviteSkuHeaderText, { textAlign: 'right' }]}>Initiator</Text>
                  </View>
                  <View style={styles.inviteHistoryColCreated}>
                    <Text style={[styles.inviteSkuHeaderText, { textAlign: 'right' }]}>Created at</Text>
                  </View>
                  <View style={styles.inviteHistoryColAction}>
                    <Text style={[styles.inviteSkuHeaderText, { textAlign: 'center' }]} />
                  </View>
                </View>
                <ScrollView
                  style={styles.inviteHistoryTableBodyScroll}
                  contentContainerStyle={styles.inviteHistoryTableBodyContent}
                  showsVerticalScrollIndicator
                >
                  {inviteHistory.map((row, index) => {
                    const createdAt = row.createdAt ? new Date(row.createdAt) : null;
                    const expiresAt = row.expiresAt ? new Date(row.expiresAt) : null;
                    const now = new Date();
                    const expired = !!expiresAt && expiresAt <= now;
                    const reachedMax =
                      row.maxClients !== null && row.maxClients !== undefined && row.currentClients >= row.maxClients;
                    const isValid = row.isActive && !expired && !reachedMax;
                    const inviterDisplay =
                      row.inviterName?.trim() ||
                      row.inviterEmail ||
                      (row.inviterUserId ? `${row.inviterUserId.slice(0, 6)}…` : '—');
                    const sku = inviteSkus.find((s) => s.id === row.skuId);
                    const skuName = sku?.name ?? '—';
                    return (
                      <TouchableOpacity
                        key={row.id}
                        style={[styles.inviteSkuRow, styles.inviteHistoryRow]}
                        activeOpacity={0.7}
                        onPress={() => handleOpenInviteFromHistory(row)}
                      >
                        <View style={styles.inviteHistoryColService}>
                          <Text style={styles.inviteHistoryCellText} numberOfLines={1}>
                            {skuName}
                          </Text>
                        </View>
                        <View style={styles.inviteHistoryColExpiry}>
                          <Text style={styles.inviteHistoryCellText} numberOfLines={1}>
                            {expiresAt ? format(expiresAt, 'MMM dd, yyyy') : 'No expiry'}
                          </Text>
                        </View>
                        <View style={styles.inviteHistoryColActive}>
                          <TouchableOpacity
                            style={[
                              styles.inviteHistoryActivePill,
                              !isValid && styles.inviteHistoryActivePillInactive,
                            ]}
                            activeOpacity={0.7}
                            onPress={(e) => { e?.stopPropagation?.(); handleToggleInviteActive(row); }}
                          >
                            <Text style={styles.inviteHistoryActiveText}>
                              {isValid ? 'Active' : 'Inactive'}
                            </Text>
                            {updatingInviteId === row.id && (
                              <View style={styles.inviteHistoryActiveSpinner}>
                                <ActivityIndicator size="small" color="#fff" />
                              </View>
                            )}
                          </TouchableOpacity>
                        </View>
                        <View style={styles.inviteHistoryColJoined}>
                          <Text
                            style={[styles.inviteHistoryCellText, { textAlign: 'right' }]}
                            numberOfLines={1}
                          >
                            {row.currentClients}
                            {row.maxClients ? ` / ${row.maxClients}` : ''}
                          </Text>
                        </View>
                        <View style={styles.inviteHistoryColInitiator}>
                          <Text style={[styles.inviteHistoryCellText, styles.inviteHistoryCellTextRight]} numberOfLines={1}>
                            {inviterDisplay}
                          </Text>
                        </View>
                        <View style={styles.inviteHistoryColCreated}>
                          <Text
                            style={[styles.inviteHistoryCellText, { textAlign: 'right' }]}
                            numberOfLines={1}
                          >
                            {createdAt ? format(createdAt, 'MMM dd, yyyy') : '—'}
                          </Text>
                        </View>
                        <View style={styles.inviteHistoryColAction}>
                          <TouchableOpacity
                            style={styles.inviteHistoryDeleteBtn}
                            onPress={(e) => { e?.stopPropagation?.(); handleDeleteInvite(row); }}
                            disabled={deletingInviteId === row.id}
                            activeOpacity={0.7}
                          >
                            {deletingInviteId === row.id ? (
                              <ActivityIndicator size="small" color="#E17055" />
                            ) : (
                              <Ionicons name="trash-outline" size={18} color="#E17055" />
                            )}
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {!inviteHistoryLoading && inviteHistory.length === 0 && !inviteHistoryError && (
                  <View style={styles.inviteHistoryEmptyWrap}>
                    <Text style={styles.inviteHintText}>No invite history yet.</Text>
                  </View>
                )}
              </View>
              {inviteHistoryError ? (
                <Text style={[styles.inviteErrorText, { marginTop: 8 }]}>{inviteHistoryError}</Text>
              ) : null}
              <View style={styles.inviteHistoryFooter}>
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={handleCreateNewFromHistory}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />
                  <Text style={styles.inviteButtonText}>Generate a new invite</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </CenterModal>
      <CenterModal
        visible={showAddClientModal}
        title="Add client"
        onClose={handleCloseAddClientModal}
        maxWidth={840}
        cardHeight={660}
      >
        <View style={styles.addClientFormRow}>
          {/* Left: form & actions (scrollable) */}
          <ScrollView
            style={styles.addClientFormScroll}
            contentContainerStyle={styles.addClientFormScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.addClientSubtitle}>
              Add a client and create a service engagement.{'\n'}You can invite clients to sign up and collaborate, {'\n'}AI Cody can batch process your clients info later.
            </Text>
            <View style={styles.addClientLeft}>
              <View style={[styles.addClientField, { marginTop: 8 }]}>
                <Text style={styles.addClientLabel}>Client name</Text>
                <TextInput
                  style={styles.addClientInput}
                  placeholder="Company or client name"
                  placeholderTextColor="#95A5A6"
                  value={addClientClientName}
                  onChangeText={setAddClientClientName}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.addClientField}>
                <Text style={styles.addClientLabel}>Contact name</Text>
                <TextInput
                  style={styles.addClientInput}
                  placeholder="Contact person name"
                  placeholderTextColor="#95A5A6"
                  value={addClientContactName}
                  onChangeText={setAddClientContactName}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.addClientField}>
                <Text style={styles.addClientLabel}>Contact email *</Text>
                <TextInput
                  style={styles.addClientInput}
                  placeholder="email@example.com"
                  placeholderTextColor="#95A5A6"
                  value={addClientContactEmail}
                  onChangeText={setAddClientContactEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.addClientField}>
                <Text style={styles.addClientLabel}>Service template</Text>
                {inviteSkus.length === 0 ? (
                  <View style={[styles.addClientSelect, styles.addClientSelectDisabled]}>
                    <Text style={styles.addClientSelectPlaceholder}>
                      Configure Service Catalog in the Firm module first.
                    </Text>
                  </View>
                ) : (
                  <View
                    style={styles.addClientSelectWrapper}
                    {...(Platform.OS === 'web' ? { nativeID: 'add-client-template-select' } : {})}
                  >
                    <TouchableOpacity
                      style={styles.addClientSelect}
                      onPress={() => setShowAddClientSkuMenu((v) => !v)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.addClientSelectText} numberOfLines={1}>
                        {addClientSkuId
                          ? inviteSkus.find((s) => s.id === addClientSkuId)?.name ?? 'Select a service template'
                          : 'Create client only (no template)'}
                      </Text>
                      <Ionicons
                        name={showAddClientSkuMenu ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#636E72"
                      />
                    </TouchableOpacity>
                    {showAddClientSkuMenu && Platform.OS !== 'web' && (
                      <View style={styles.addClientSelectDropdown}>
                        <ScrollView
                          style={styles.addClientSelectDropdownScroll}
                          contentContainerStyle={styles.addClientSelectDropdownContent}
                          nestedScrollEnabled
                        >
                          <TouchableOpacity
                            key="__none__"
                            style={[
                              styles.addClientSelectOption,
                              !addClientSkuId && styles.addClientSelectOptionSelected,
                            ]}
                            onPress={() => {
                              setAddClientSkuId(null);
                              setShowAddClientSkuMenu(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.addClientSelectOptionTitle,
                                !addClientSkuId && styles.addClientSelectOptionTitleSelected,
                              ]}
                              numberOfLines={1}
                            >
                              Create client only (no template)
                            </Text>
                          </TouchableOpacity>
                          {inviteSkus.map((sku) => (
                            <TouchableOpacity
                              key={sku.id}
                              style={[
                                styles.addClientSelectOption,
                                addClientSkuId === sku.id && styles.addClientSelectOptionSelected,
                              ]}
                              onPress={() => {
                                setAddClientSkuId(sku.id);
                                setShowAddClientSkuMenu(false);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.addClientSelectOptionTitle,
                                  addClientSkuId === sku.id && styles.addClientSelectOptionTitleSelected,
                                ]}
                                numberOfLines={1}
                              >
                                {sku.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}
              </View>
              {/* Invite-by-email row: always shown, disabled (grayed out) until invite-email feature is built */}
              <View style={{ height: 48 }} />
              <View style={[styles.addClientField, { opacity: 0.6 }]}>
                <View style={styles.addClientCheckboxRow} pointerEvents="none">
                  <Ionicons
                    name="square-outline"
                    size={18}
                    color="#B2BEC3"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.addClientCheckboxLabel, { color: '#95A5A6' }]}>
                    Invite to sign up Vouchap via email?
                  </Text>
                </View>
              </View>
              {addClientError ? (
                <Text style={styles.addClientError}>{addClientError}</Text>
              ) : null}
            </View>
            <View style={styles.addClientBtnRow}>
              <TouchableOpacity style={styles.addClientSecondaryBtn} onPress={handleCloseAddClientModal} activeOpacity={0.7}>
                <Text style={styles.addClientSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.addClientPrimaryBtn,
                  addClientSubmitting && styles.invitePrimaryBtnDisabled,
                ]}
                onPress={handleAddClientSubmit}
                disabled={addClientSubmitting}
                activeOpacity={0.7}
              >
                {addClientSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.addClientPrimaryBtnText}>
                    {addClientSkuId ? 'Create Engagement' : 'Save Client'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Right: full-height SKU preview area */}
          <View style={styles.addClientRight}>
            <Text style={styles.addClientPreviewTitle}>Service preview</Text>
            {addClientSkuId ? (
              <SkuPreview sku={inviteSkus.find((s) => s.id === addClientSkuId) ?? null} />
            ) : (
              <View style={styles.addClientNoTemplateBox}>
                <Text style={styles.addClientNoTemplateTitle}>
                  Create client with no engagement attached
                </Text>
                <Text style={styles.addClientNoTemplateDesc}>
                  You will create this client profile without creating a service engagement.
                </Text>
                <Text style={styles.addClientNoTemplateDesc}>
                  You can start a new service order for this client later from the client info page.
                </Text>
              </View>
            )}
          </View>
        </View>
      </CenterModal>
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
      {/* Assign 负责人浮层（复用 Depends on 选单样式） */}
      {showAssignPicker && (
        <View style={styles.assignPickerOverlay} pointerEvents="box-none">
          <Pressable
            style={styles.assignPickerBackdrop}
            onPress={() => !assignSaving && setShowAssignPicker(false)}
          />
          <View style={styles.assignPickerCard}>
            <Text style={styles.assignPickerTitle}>Assign service owner</Text>
            <Text style={styles.assignPickerSubtitle}>
              Select a member for {selectedClientIds.length} selected client(s):
            </Text>
            <Pressable
              style={[
                styles.assignPickerRow,
                styles.assignPickerNoneRow,
                assignSelectedMemberId === null && styles.assignPickerRowActive,
              ]}
              onPress={() => setAssignSelectedMemberId(null)}
            >
              <Text
                style={[
                  styles.assignPickerRowText,
                  assignSelectedMemberId === null && styles.assignPickerRowTextActive,
                ]}
              >
                None
              </Text>
              {assignSelectedMemberId === null ? (
                <Ionicons name="checkmark-circle" size={16} color="#6C5CE7" />
              ) : null}
            </Pressable>
            <ScrollView style={styles.assignPickerList} nestedScrollEnabled>
              {assignMembersLoading ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#6C5CE7" />
                </View>
              ) : (
                assignMembers.map((m) => {
                  const selected = assignSelectedMemberId === m.id;
                  const label = [m.name, m.email].filter(Boolean).join(' · ') || m.id;
                  return (
                    <Pressable
                      key={m.id}
                      style={[
                        styles.assignPickerRow,
                        selected && styles.assignPickerRowActive,
                      ]}
                      onPress={() => setAssignSelectedMemberId(m.id)}
                    >
                      <Text
                        style={[
                          styles.assignPickerRowText,
                          selected && styles.assignPickerRowTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      {selected ? (
                        <Ionicons name="checkmark-circle" size={16} color="#6C5CE7" />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <TouchableOpacity
                style={styles.assignPickerSecondaryBtn}
                onPress={() => !assignSaving && setShowAssignPicker(false)}
                disabled={assignSaving}
              >
                <Text style={styles.assignPickerSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.assignPickerDoneBtn}
                onPress={handleAssignPickerDone}
                disabled={assignSaving}
                activeOpacity={0.7}
              >
                {assignSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.assignPickerDoneText}>Done</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  mobileInviteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  mobileIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECECFF',
  },
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
  receiptItemPending: {
    backgroundColor: '#F8F9FA',
    opacity: 0.95,
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
  inviteHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F3F5',
  },
  inviteHistoryButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#636E72',
  },
  inviteHeader: {
    marginBottom: 16,
    gap: 6,
  },
  inviteTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
  },
  inviteSubtitle: {
    fontSize: 12,
    color: '#636E72',
  },
  inviteBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  inviteLeftColumn: {
    flex: 1,
    minWidth: 0,
  },
  inviteRightColumn: {
    width: 400,
    minWidth: 0,
    marginTop: 4,
    paddingLeft: 8,
  },
  inviteSettingsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    gap: 24,
  },
  inviteSettingsLeft: {
    flex: 1.4,
  },
  inviteSettingsRight: {
    flex: 1,
  },
  inviteSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 8,
  },
  inviteSkuTable: {
    maxHeight: 320,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  inviteSkuList: {
    maxHeight: 320,
  },
  inviteSkuListContent: {
    paddingVertical: 0,
  },
  inviteSkuHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E9ECEF',
  },
  inviteSkuHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#636E72',
  },
  inviteSkuRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  inviteSkuRowSelected: {
    backgroundColor: 'rgba(108, 92, 231, 0.06)',
  },
  inviteSkuRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  inviteSkuName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2D3436',
    flexShrink: 1,
    marginRight: 8,
  },
  inviteSkuNameSelected: {
    color: '#6C5CE7',
  },
  inviteSkuCode: {
    fontSize: 12,
    color: '#636E72',
  },
  inviteSkuDesc: {
    fontSize: 12,
    color: '#7F8C8D',
  },
  inviteConfigRow: {
    marginBottom: 12,
  },
  inviteConfigLabel: {
    fontSize: 13,
    color: '#636E72',
    marginBottom: 6,
  },
  invitePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  invitePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#FFF',
  },
  invitePillSelected: {
    borderColor: '#6C5CE7',
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
  },
  invitePillText: {
    fontSize: 13,
    color: '#636E72',
  },
  invitePillTextSelected: {
    color: '#6C5CE7',
    fontWeight: '600',
  },
  inviteResultRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
    alignItems: 'stretch',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#FDFDFE',
  },
  inviteResultLeft: {
    flex: 1,
  },
  inviteQrColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
  },
  inviteQrBox: {
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteHintText: {
    fontSize: 12,
    color: '#B2BEC3',
  },
  inviteActionsRow: {
    marginTop: 12,
  },
  invitePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#6C5CE7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  invitePrimaryBtnDisabled: {
    opacity: 0.5,
  },
  invitePrimaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  inviteLinkBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E1E4FF',
  },
  inviteLinkLabel: {
    fontSize: 11,
    color: '#95A5A6',
    marginBottom: 4,
  },
  inviteLinkValue: {
    fontSize: 12,
    color: '#2D3436',
  },
  inviteLinkButtonsRow: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 8,
  },
  inviteQrRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteLinkCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  inviteLinkCodeBox: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E1E4FF',
    backgroundColor: '#F7F8FF',
    maxWidth: 270,
    flexShrink: 1,
  },
  inviteLinkCodeText: {
    fontSize: 11,
    color: '#2D3436',
    fontFamily: Platform.select({ web: 'monospace', default: 'System' }),
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  inviteSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#EAEAFF',
  },
  inviteSecondaryBtnText: {
    fontSize: 11,
    color: '#6C5CE7',
    fontWeight: '500',
  },
  addClientForm: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  addClientFormScroll: {
    maxHeight: 560,
  },
  addClientFormScrollContent: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  addClientFormRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 24,
    position: 'relative' as const,
    overflow: 'visible' as const,
  },
  addClientLeft: {
    flex: 1,
    overflow: 'visible' as const,
  },
  addClientRight: {
    width: 400,
    paddingRight: 12,
    flexShrink: 0,
  },
  addClientSkuList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
  },
  addClientSkuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  addClientSkuRowSelected: {
    backgroundColor: '#EDE9F7',
  },
  addClientSkuName: {
    fontSize: 14,
    color: '#2D3436',
    flex: 1,
  },
  addClientSkuNameSelected: {
    fontWeight: '600',
    color: '#6C5CE7',
  },
  addClientSkuPreview: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#FDFBFF',
  },
  addClientSkuPreviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 4,
  },
  addClientSkuPreviewDesc: {
    fontSize: 13,
    color: '#636E72',
    lineHeight: 18,
  },
  addClientSkuPreviewDescMuted: {
    fontSize: 13,
    color: '#B2BEC3',
    fontStyle: 'italic',
  },
  addClientPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636E72',
    marginBottom: 8,
  },
  addClientCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addClientCheckboxLabel: {
    fontSize: 13,
    color: '#2D3436',
    flex: 1,
  },
  addClientSubtitle: {
    fontSize: 13,
    color: '#636E72',
    lineHeight: 18,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  addClientField: {
    marginBottom: 16,
  },
  addClientLabel: {
    fontSize: 13,
    color: '#636E72',
    marginBottom: 6,
    fontWeight: '500',
  },
  addClientInput: {
    fontSize: 14,
    color: '#2D3436',
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addClientError: {
    fontSize: 12,
    color: '#D63031',
    marginBottom: 12,
  },
  addClientBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  addClientSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  addClientSecondaryBtnText: {
    fontSize: 13,
    color: '#636E72',
    fontWeight: '500',
  },
  addClientPrimaryBtn: {
    flex: 1.618,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#6C5CE7',
  },
  addClientPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  addClientHint: {
    fontSize: 12,
    color: '#95A5A6',
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'left',
  },
  addClientNoTemplateBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FDFBFF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 560,
    maxHeight: 560,
    justifyContent: 'center',
  },
  addClientNoTemplateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 6,
  },
  addClientNoTemplateDesc: {
    fontSize: 13,
    color: '#636E72',
    lineHeight: 18,
    marginBottom: 2,
  },
  addClientSelectWrapper: {
    marginTop: 4,
    position: 'relative' as const,
    zIndex: 50,
  },
  addClientSelect: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#F8F9FA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addClientSelectDisabled: {
    opacity: 0.6,
  },
  addClientSelectText: {
    flex: 1,
    fontSize: 13,
    color: '#636E72',
    marginRight: 8,
  },
  addClientSelectPlaceholder: {
    fontSize: 13,
    color: '#B2BEC3',
  },
  addClientSelectDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#FFFFFF',
    maxHeight: 220,
    overflow: 'hidden',
    zIndex: 9999,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  addClientSelectDropdownScroll: {
    maxHeight: 220,
  },
  addClientSelectDropdownContent: {
    paddingVertical: 4,
  },
  addClientSelectOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  addClientSelectOptionSelected: {
    backgroundColor: 'rgba(108,92,231,0.06)',
  },
  addClientSelectOptionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2D3436',
    marginBottom: 2,
  },
  addClientSelectOptionTitleSelected: {
    color: '#6C5CE7',
  },
  addClientSelectOptionDesc: {
    fontSize: 12,
    color: '#7F8C8D',
  },
  inviteQrPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D8E0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F6FA',
  },
  inviteQrPlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A4B0BE',
  },
  inviteErrorText: {
    marginTop: 6,
    fontSize: 12,
    color: '#E17055',
  },
  inviteHistoryContainer: {
    flex: 1,
    minHeight: 200,
    flexDirection: 'column',
  },
  inviteHistoryBodyWrap: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  inviteHistoryScroll: {
    flex: 1,
  },
  inviteHistoryScrollContent: {
    flexGrow: 1,
  },
  inviteHistoryTable: {
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  inviteHistoryTableOuter: {
    flex: 1,
    minHeight: 0,
  },
  inviteHistoryTableBodyScroll: {
    flex: 1,
    minHeight: 0,
  },
  inviteHistoryTableBodyContent: {
    paddingBottom: 8,
  },
  inviteHistoryColAction: {
    width: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  inviteHistoryDeleteBtn: {
    padding: 6,
  },
  inviteHistoryEmptyWrap: {
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  inviteHistoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 16,
    paddingBottom: 8,
  },
  inviteHistoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteHistoryCellText: {
    fontSize: 12,
    color: '#2D3436',
    marginRight: 4,
  },
  inviteHistoryStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inviteHistoryStatusActive: {
    color: '#00B894',
  },
  inviteHistoryStatusInactive: {
    color: '#E17055',
  },
  inviteHistoryActivePill: {
    width: 80,
    minHeight: 26,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#00B894',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  inviteHistoryActivePillInactive: {
    backgroundColor: '#E17055',
  },
  inviteHistoryActiveSpinner: {
    width: 14,
    height: 14,
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  inviteHistoryActiveText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  inviteHistoryColService: {
    flex: 1.6,
    minWidth: 0,
    paddingRight: 6,
    marginRight: 10,
  },
  inviteHistoryColExpiry: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
    marginRight: 10,
  },
  inviteHistoryColActive: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    marginRight: 10,
  },
  inviteHistoryColJoined: {
    width: 68,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 6,
    marginRight: 14,
  },
  inviteHistoryColInitiator: {
    flex: 1.3,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 6,
    paddingRight: 6,
    marginRight: 10,
  },
  inviteHistoryColCreated: {
    width: 112,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 4,
    marginRight: 4,
  },
  inviteHistoryCellTextRight: {
    textAlign: 'right',
  },
  // Assign 负责人浮层（与 TaxFilingTodosView deps picker 一致）
  assignPickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  assignPickerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  assignPickerCard: {
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
  assignPickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2D3436',
    marginTop: 4,
    marginBottom: 10,
    lineHeight: 22,
  },
  assignPickerSubtitle: {
    fontSize: 12,
    color: '#95A5A6',
    fontWeight: '400',
    marginBottom: 14,
  },
  assignPickerList: { maxHeight: 460, marginBottom: 12 },
  assignPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#F8F9FA',
    marginBottom: 2,
  },
  assignPickerNoneRow: { marginTop: 2, marginBottom: 4 },
  assignPickerRowActive: {
    borderColor: '#6C5CE7',
    backgroundColor: 'rgba(108,92,231,0.08)',
  },
  assignPickerRowText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#636E72',
    fontWeight: '500',
    flex: 1,
  },
  assignPickerRowTextActive: { color: '#6C5CE7' },
  assignPickerDoneBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
  },
  assignPickerDoneText: { fontSize: 13, color: '#FFF', fontWeight: '600' },
  assignPickerSecondaryBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F3F5',
  },
  assignPickerSecondaryText: { fontSize: 13, color: '#636E72', fontWeight: '500' },
});
