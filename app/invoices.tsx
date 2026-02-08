import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAllInvoices, deleteInvoice, saveInvoice } from '@/lib/invoices';
import { Invoice } from '@/types';
import { format } from 'date-fns';
import { VoucherStatus } from '@/types';
import { SwipeableRow } from './SwipeableRow';

type GroupByType = 'month' | 'recordDate' | 'paymentAccount' | 'createdBy';

const statusColors: Record<VoucherStatus, string> = {
  pending: '#FF9500',
  processing: '#9B59B6',
  confirmed: '#00B894',
  needs_retake: '#E74C3C',
};

const statusLabels: Record<VoucherStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  confirmed: 'Confirmed',
  needs_retake: 'Needs Retake',
};

const getCurrencySymbol = (currency?: string): string => {
  const symbols: Record<string, string> = {
    USD: '$', CAD: 'C$', CNY: '¥', JPY: '¥', EUR: '€', GBP: '£', AUD: 'A$',
    HKD: 'HK$', TWD: 'NT$', KRW: '₩', SGD: 'S$', MXN: 'MX$', INR: '₹',
    THB: '฿', VND: '₫', PHP: '₱', MYR: 'RM', IDR: 'Rp',
  };
  return symbols[currency || 'USD'] || (currency ? `${currency} ` : '$');
};

const AmountText = ({ amount, currency, style }: { amount: number; currency?: string; style?: any }) => {
  const symbol = getCurrencySymbol(currency);
  const baseSize = style?.fontSize || 16;
  return (
    <Text style={style}>
      <Text style={{ color: '#A0A0A0', fontSize: baseSize - 2 }}>{symbol}</Text>
      <Text style={{ fontWeight: '600' }}>{amount.toFixed(2)}</Text>
    </Text>
  );
};

interface SectionData {
  title: string;
  monthKey: string;
  data: Invoice[];
  originalData?: Invoice[];
}

export default function InvoicesScreen() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupByType>('recordDate');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [selectedRecordDates, setSelectedRecordDates] = useState<Set<string>>(new Set());
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [selectedCreators, setSelectedCreators] = useState<Set<string>>(new Set());
  const [filterSubMenu, setFilterSubMenu] = useState<'main' | 'month' | 'recordDate' | 'account' | 'creator'>('main');
  const [showFabActions, setShowFabActions] = useState(false);
  const fabAnimation = useRef(new Animated.Value(0)).current;
  const router = useRouter();

  const loadInvoices = useCallback(async () => {
    try {
      const data = await getAllInvoices();
      setInvoices(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load income');
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadInvoices(); }, [loadInvoices]));

  const onRefresh = () => {
    setRefreshing(true);
    setSelectedIds(new Set());
    loadInvoices();
  };

  const handleAddInvoice = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const id = await saveInvoice({
        spaceId: '',
        customerName: '',
        totalAmount: 0,
        date: today,
        status: 'pending',
        items: [],
      });
      loadInvoices();
      router.push(`/invoice-details/${id}?new=true`);
    } catch (e) {
      Alert.alert('Error', 'Failed to create income');
      console.error(e);
    }
  };

  const handleCameraPress = () => {
    if (!showFabActions) {
      setShowFabActions(true);
      fabAnimation.setValue(0);
      Animated.timing(fabAnimation, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else {
      Animated.timing(fabAnimation, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowFabActions(false));
    }
  };

  const handleChatFromFab = () => {
    setShowFabActions(false);
    router.push('/voice-input?type=invoice');
  };

  const handleScanFromFab = () => {
    setShowFabActions(false);
    handleAddInvoice();
  };

  const handleToggleSelect = (invoiceId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(invoiceId)) newSet.delete(invoiceId);
      else newSet.add(invoiceId);
      return newSet;
    });
  };

  const handleDeleteSingle = async (invoiceId: string) => {
    Alert.alert(
      'Delete Income',
      'Are you sure you want to delete this income?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInvoice(invoiceId);
              setInvoices(prev => prev.filter(r => r.id !== invoiceId));
              setSelectedIds(prev => { const s = new Set(prev); s.delete(invoiceId); return s; });
            } catch (error) {
              Alert.alert('Error', 'Failed to delete income');
              loadInvoices();
            }
          },
        },
      ]
    );
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Delete Income',
      `Delete ${selectedIds.size} income entry/entries?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all(Array.from(selectedIds).map(id => deleteInvoice(id)));
              const idsToDelete = Array.from(selectedIds);
              setInvoices(prev => prev.filter(r => r.id && !idsToDelete.includes(r.id)));
              setSelectedIds(new Set());
            } catch (error) {
              Alert.alert('Error', 'Failed to delete some income');
              loadInvoices();
            }
          },
        },
      ]
    );
  };

  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseLocalDate(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const diffMs = new Date().getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return `${diffMins} minutes ago`;
      }
      if (diffHours < 24) return `${diffHours} hours ago`;
      const dateOnly = dateString.includes('T') ? dateString.split('T')[0] : dateString;
      return formatDate(dateOnly);
    } catch {
      return dateString;
    }
  };

  const groupByMonth = useCallback((list: Invoice[]): SectionData[] => {
    const grouped = new Map<string, Invoice[]>();
    list.forEach(inv => {
      try {
        const date = parseLocalDate(inv.date);
        const monthKey = `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!grouped.has(monthKey)) grouped.set(monthKey, []);
        grouped.get(monthKey)!.push(inv);
      } catch (_) {}
    });
    return Array.from(grouped.entries())
      .map(([monthKey, data]) => ({
        title: format(parseLocalDate(data[0].date), 'MMMM yyyy'),
        monthKey,
        data: data.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()),
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, []);

  const groupByRecordDate = useCallback((list: Invoice[]): SectionData[] => {
    const grouped = new Map<string, Invoice[]>();
    list.forEach(inv => {
      if (!inv.createdAt) return;
      const d = new Date(inv.createdAt);
      const dayKey = `record-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!grouped.has(dayKey)) grouped.set(dayKey, []);
      grouped.get(dayKey)!.push(inv);
    });
    return Array.from(grouped.entries())
      .map(([dayKey, data]) => {
        const base = data[0].createdAt ? new Date(data[0].createdAt) : parseLocalDate(data[0].date);
        const dateOnly = new Date(base.getFullYear(), base.getMonth(), base.getDate());
        return {
          title: format(dateOnly, 'MMM dd, yyyy'),
          monthKey: dayKey,
          data: data.slice().sort((a, b) => {
            const at = a.createdAt ? new Date(a.createdAt).getTime() : parseLocalDate(a.date).getTime();
            const bt = b.createdAt ? new Date(b.createdAt).getTime() : parseLocalDate(b.date).getTime();
            return bt - at;
          }),
        };
      })
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, []);

  const groupByAccount = useCallback((list: Invoice[]): SectionData[] => {
    const grouped = new Map<string, Invoice[]>();
    list.forEach(inv => {
      const name = inv.account?.name || 'Not Set';
      const key = `account-${inv.account?.id || 'none'}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(inv);
    });
    return Array.from(grouped.entries())
      .map(([key, data]) => ({
        title: data[0].account?.name || 'Not Set',
        monthKey: key,
        data: data.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()),
      }))
      .sort((a, b) => (a.title === 'Not Set' ? 1 : b.title === 'Not Set' ? -1 : a.title.localeCompare(b.title)));
  }, []);

  const groupByCreatedBy = useCallback((list: Invoice[]): SectionData[] => {
    const grouped = new Map<string, Invoice[]>();
    list.forEach(inv => {
      const name = inv.createdByUser?.name || inv.createdByUser?.email?.split('@')[0] || 'Unknown';
      const key = `user-${inv.createdBy || 'unknown'}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(inv);
    });
    return Array.from(grouped.entries())
      .map(([key, data]) => ({
        title: data[0].createdByUser?.name || data[0].createdByUser?.email?.split('@')[0] || 'Unknown',
        monthKey: key,
        data: data.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, []);

  const getGroupedInvoices = useCallback((list: Invoice[]): SectionData[] => {
    switch (groupBy) {
      case 'recordDate': return groupByRecordDate(list);
      case 'paymentAccount': return groupByAccount(list);
      case 'createdBy': return groupByCreatedBy(list);
      case 'month':
      default: return groupByMonth(list);
    }
  }, [groupBy, groupByMonth, groupByRecordDate, groupByAccount, groupByCreatedBy]);

  const filteredInvoices = useMemo(() => {
    let filtered = invoices;
    if (selectedMonths.size > 0) {
      filtered = filtered.filter(inv => {
        try {
          const d = parseLocalDate(inv.date);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return selectedMonths.has(k);
        } catch { return false; }
      });
    }
    if (selectedRecordDates.size > 0) {
      filtered = filtered.filter(inv => {
        if (!inv.createdAt) return false;
        const d = new Date(inv.createdAt);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return selectedRecordDates.has(k);
      });
    }
    if (selectedAccounts.size > 0) {
      filtered = filtered.filter(inv => selectedAccounts.has(inv.account?.id || 'none'));
    }
    if (selectedCreators.size > 0) {
      filtered = filtered.filter(inv => selectedCreators.has(inv.createdBy || 'unknown'));
    }
    return filtered;
  }, [invoices, selectedMonths, selectedRecordDates, selectedAccounts, selectedCreators]);

  const searchedInvoices = useMemo(() => {
    if (!searchQuery.trim()) return filteredInvoices;
    const q = searchQuery.trim().toLowerCase();
    return filteredInvoices.filter(inv => (inv.customerName || '').toLowerCase().includes(q));
  }, [filteredInvoices, searchQuery]);

  const filterOptions = useMemo(() => {
    const months = new Set<string>();
    const recordDates = new Set<string>();
    const accounts = new Map<string, string>();
    const creators = new Map<string, string>();
    invoices.forEach(inv => {
      try {
        const d = parseLocalDate(inv.date);
        months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      } catch {}
      if (inv.createdAt) {
        const d = new Date(inv.createdAt);
        recordDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
      accounts.set(inv.account?.id || 'none', inv.account?.name || 'Not Set');
      if (inv.createdBy) {
        const name = inv.createdByUser?.name || inv.createdByUser?.email?.split('@')[0] || 'Unknown';
        creators.set(inv.createdBy, name);
      } else creators.set('unknown', 'Unknown');
    });
    const sortedMonths = Array.from(months).sort((a, b) => b.localeCompare(a));
    const sortedRecordDates = Array.from(recordDates).sort((a, b) => b.localeCompare(a));
    return {
      months: sortedMonths.map(k => {
        const [y, m] = k.split('-');
        return { key: k, label: format(new Date(parseInt(y), parseInt(m) - 1), 'MMMM yyyy') };
      }),
      recordDates: sortedRecordDates.map(k => {
        const [y, m, d] = k.split('-');
        return { key: k, label: format(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)), 'MMM dd, yyyy') };
      }),
      accounts: Array.from(accounts.entries()).map(([id, name]) => ({ id, name })),
      creators: Array.from(creators.entries()).map(([id, name]) => ({ id, name })),
    };
  }, [invoices]);

  const sections = getGroupedInvoices(searchedInvoices);

  const toggleSection = (monthKey: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {selectedIds.size > 0 ? (
            <>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setSelectedIds(new Set())}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <View style={styles.selectedCountContainer}>
                <Text style={styles.selectedCountText}>{selectedIds.size} selected</Text>
              </View>
              <TouchableOpacity style={styles.deleteButton} onPress={handleBatchDelete}>
                <Ionicons name="trash-outline" size={20} color="#E74C3C" />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.sortButton} onPress={() => setShowSortMenu(true)}>
                {groupBy === 'month' && <Ionicons name="calendar-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
                {groupBy === 'recordDate' && <Ionicons name="time-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
                {groupBy === 'paymentAccount' && <Ionicons name="wallet-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
                {groupBy === 'createdBy' && <Ionicons name="person-outline" size={18} color="#6C5CE7" style={{ marginRight: 4 }} />}
                <Text style={styles.sortText}>Group</Text>
                <Ionicons name="chevron-down" size={16} color="#636E72" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterButton}
                onPress={() => { setShowFilterMenu(true); setFilterSubMenu('main'); }}
              >
                <Text style={styles.filterText}>
                  Filter
                  {(selectedMonths.size + selectedRecordDates.size + selectedAccounts.size + selectedCreators.size) > 0 && (
                    <Text style={styles.filterBadge}> ({selectedMonths.size + selectedRecordDates.size + selectedAccounts.size + selectedCreators.size})</Text>
                  )}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#636E72" />
              </TouchableOpacity>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={18} color="#636E72" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search"
                  placeholderTextColor="#95A5A6"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </>
          )}
        </View>
      </View>

      <SectionList
        sections={sections.map(s => ({
          ...s,
          data: collapsedSections.has(s.monthKey) ? [] : s.data,
          originalData: s.data,
        }))}
        keyExtractor={(item: Invoice) => item.id || Math.random().toString()}
        renderItem={({ item }) => {
          const isSelected = item.id ? selectedIds.has(item.id) : false;
          const isSelectionMode = selectedIds.size > 0;
          return (
            <SwipeableRow onDelete={() => item.id && handleDeleteSingle(item.id)} disabled={isSelectionMode}>
              <TouchableOpacity
                style={[styles.invoiceItem, isSelected && styles.receiptItemSelected]}
                onPress={() => {
                  if (isSelectionMode) {
                    if (item.id) handleToggleSelect(item.id);
                  } else {
                    router.push(`/invoice-details/${item.id}`);
                  }
                }}
                onLongPress={() => { if (item.id && !isSelectionMode) handleToggleSelect(item.id); }}
                activeOpacity={0.7}
              >
                {isSelectionMode && (
                  <View style={styles.checkboxContainer}>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                  </View>
                )}
                <View style={styles.receiptContent}>
                  <View style={styles.firstRow}>
                    <Text style={styles.storeName} numberOfLines={1}>
                      {item.customerName || 'Customer'}
                    </Text>
                    {item.status === 'confirmed' ? (
                      <View style={styles.confirmedStatusContainer}>
                        <View style={styles.confirmedBadge}>
                          <Ionicons name={item.inputType === 'audio' ? 'mic' : item.inputType === 'text' ? 'menu' : 'document-text'} size={12} color="#fff" />
                        </View>
                        {item.createdByUser && (
                          <Text style={styles.confirmedByText}>
                            by {item.createdByUser.name || item.createdByUser.email?.split('@')[0] || 'Unknown'}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, { backgroundColor: statusColors[item.status] }]}>
                        <Text style={styles.statusText}>{statusLabels[item.status]}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.secondRow}>
                    <AmountText amount={item.totalAmount} currency={item.currency} style={styles.amount} />
                    <Text style={styles.date}>{formatDate(item.date)}</Text>
                    <Text style={styles.createdDate}>
                      {item.createdAt ? formatTimeAgo(item.createdAt) : formatDate(item.date)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          );
        }}
        renderSectionHeader={({ section }) => {
          const isCollapsed = collapsedSections.has(section.monthKey);
          const dataForStats = section.originalData || section.data;
          const confirmed = dataForStats.filter((inv: Invoice) => inv.status === 'confirmed');
          const dominantCurrency = confirmed.length ? (confirmed.map((r: Invoice) => r.currency || 'USD').sort((a: string, b: string) =>
            confirmed.filter((v: Invoice) => (v.currency || 'USD') === a).length - confirmed.filter((v: Invoice) => (v.currency || 'USD') === b).length
          ).pop()) : 'USD';
          const totalAmount = confirmed.reduce((sum: number, r: Invoice) => sum + r.totalAmount, 0);
          return (
            <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(section.monthKey)} activeOpacity={0.7}>
              <View style={styles.sectionHeaderContent}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionHeaderRight}>
                  <Text style={styles.sectionCount}>{confirmed.length} income</Text>
                  <AmountText amount={totalAmount} currency={dominantCurrency} style={styles.sectionAmount} />
                  <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={20} color="#636E72" />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#BDC3C7" />
            <Text style={styles.emptyText}>No income yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add income</Text>
          </View>
        }
        contentContainerStyle={sections.length === 0 ? styles.emptyList : styles.listContent}
        stickySectionHeadersEnabled={false}
      />

      <View style={styles.fabContainer}>
        {showFabActions && (
          <View style={styles.fabActionsContainer}>
            <Animated.View style={{ opacity: fabAnimation }}>
              <TouchableOpacity style={styles.fabAction} onPress={handleChatFromFab} activeOpacity={0.8}>
                <Ionicons name="chatbubble-outline" size={28} color="#6C5CE7" />
              </TouchableOpacity>
            </Animated.View>
            <Animated.View style={{ marginTop: 8, opacity: fabAnimation }}>
              <TouchableOpacity style={styles.fabAction} onPress={handleScanFromFab} activeOpacity={0.8}>
                <Ionicons name="camera" size={28} color="#6C5CE7" />
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}
        {!showFabActions && (
          <TouchableOpacity style={styles.fabMain} onPress={handleCameraPress} activeOpacity={0.8}>
            <Ionicons name="add" size={32} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Group By Modal */}
      <Modal visible={showSortMenu} transparent animationType="slide" onRequestClose={() => setShowSortMenu(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowSortMenu(false)}>
          <View style={styles.pickerBottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Group By</Text>
              <TouchableOpacity onPress={() => setShowSortMenu(false)} style={styles.pickerCloseButton}>
                <Text style={styles.pickerCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
              {(['month', 'recordDate', 'paymentAccount', 'createdBy'] as const).map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.pickerOption, groupBy === key && styles.pickerOptionSelected]}
                  onPress={() => { setGroupBy(key); setShowSortMenu(false); }}
                >
                  {key === 'month' && <Ionicons name="calendar-outline" size={20} color={groupBy === key ? '#6C5CE7' : '#636E72'} style={{ marginRight: 12 }} />}
                  {key === 'recordDate' && <Ionicons name="time-outline" size={20} color={groupBy === key ? '#6C5CE7' : '#636E72'} style={{ marginRight: 12 }} />}
                  {key === 'paymentAccount' && <Ionicons name="wallet-outline" size={20} color={groupBy === key ? '#6C5CE7' : '#636E72'} style={{ marginRight: 12 }} />}
                  {key === 'createdBy' && <Ionicons name="person-outline" size={20} color={groupBy === key ? '#6C5CE7' : '#636E72'} style={{ marginRight: 12 }} />}
                  <Text style={[styles.pickerOptionText, groupBy === key && styles.pickerOptionTextSelected, { flex: 1 }]}>
                    {key === 'month' && 'Transaction Month'}
                    {key === 'recordDate' && 'Record Date'}
                    {key === 'paymentAccount' && 'Account'}
                    {key === 'createdBy' && 'Recorder'}
                  </Text>
                  {groupBy === key && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Filter Modal */}
      <Modal visible={showFilterMenu} transparent animationType="slide" onRequestClose={() => { setShowFilterMenu(false); setFilterSubMenu('main'); }}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => { setShowFilterMenu(false); setFilterSubMenu('main'); }}>
          <View style={styles.pickerBottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              {filterSubMenu !== 'main' ? (
                <TouchableOpacity onPress={() => setFilterSubMenu('main')} style={styles.pickerBackButton}>
                  <Ionicons name="chevron-back" size={20} color="#6C5CE7" />
                </TouchableOpacity>
              ) : null}
              <Text style={styles.pickerTitle}>
                {filterSubMenu === 'main' ? 'Filter' : filterSubMenu === 'month' ? 'Transaction Months' : filterSubMenu === 'recordDate' ? 'Record Dates' : filterSubMenu === 'account' ? 'Accounts' : 'Recorders'}
              </Text>
              {(filterSubMenu === 'main' && (selectedMonths.size > 0 || selectedRecordDates.size > 0 || selectedAccounts.size > 0 || selectedCreators.size > 0)) && (
                <TouchableOpacity onPress={() => { setSelectedMonths(new Set()); setSelectedRecordDates(new Set()); setSelectedAccounts(new Set()); setSelectedCreators(new Set()); }} style={styles.clearFilterButton}>
                  <Text style={styles.clearFilterText}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { setShowFilterMenu(false); setFilterSubMenu('main'); }} style={styles.pickerCloseButton}>
                <Text style={styles.pickerCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
              {filterSubMenu === 'main' && (
                <>
                  <TouchableOpacity style={styles.filterMainOption} onPress={() => setFilterSubMenu('month')}>
                    <Text style={styles.filterMainOptionText}>Transaction Month</Text>
                    {selectedMonths.size > 0 && <Text style={styles.filterCountBadge}>{selectedMonths.size}</Text>}
                    <Ionicons name="chevron-forward" size={20} color="#95A5A6" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.filterMainOption} onPress={() => setFilterSubMenu('account')}>
                    <Text style={styles.filterMainOptionText}>Account</Text>
                    {selectedAccounts.size > 0 && <Text style={styles.filterCountBadge}>{selectedAccounts.size}</Text>}
                    <Ionicons name="chevron-forward" size={20} color="#95A5A6" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.filterMainOption} onPress={() => setFilterSubMenu('creator')}>
                    <Text style={styles.filterMainOptionText}>Recorder</Text>
                    {selectedCreators.size > 0 && <Text style={styles.filterCountBadge}>{selectedCreators.size}</Text>}
                    <Ionicons name="chevron-forward" size={20} color="#95A5A6" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.filterMainOption} onPress={() => setFilterSubMenu('recordDate')}>
                    <Text style={styles.filterMainOptionText}>Record Date</Text>
                    {selectedRecordDates.size > 0 && <Text style={styles.filterCountBadge}>{selectedRecordDates.size}</Text>}
                    <Ionicons name="chevron-forward" size={20} color="#95A5A6" />
                  </TouchableOpacity>
                </>
              )}
              {filterSubMenu === 'month' && filterOptions.months.map((m) => {
                const isSelected = selectedMonths.has(m.key);
                return (
                  <TouchableOpacity key={m.key} style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]} onPress={() => setSelectedMonths(prev => { const s = new Set(prev); if (s.has(m.key)) s.delete(m.key); else s.add(m.key); return s; })}>
                    <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{m.label}</Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                  </TouchableOpacity>
                );
              })}
              {filterSubMenu === 'recordDate' && filterOptions.recordDates.map((d) => {
                const isSelected = selectedRecordDates.has(d.key);
                return (
                  <TouchableOpacity key={d.key} style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]} onPress={() => setSelectedRecordDates(prev => { const s = new Set(prev); if (s.has(d.key)) s.delete(d.key); else s.add(d.key); return s; })}>
                    <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{d.label}</Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                  </TouchableOpacity>
                );
              })}
              {filterSubMenu === 'account' && filterOptions.accounts.map((a) => {
                const isSelected = selectedAccounts.has(a.id);
                return (
                  <TouchableOpacity key={a.id} style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]} onPress={() => setSelectedAccounts(prev => { const s = new Set(prev); if (s.has(a.id)) s.delete(a.id); else s.add(a.id); return s; })}>
                    <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{a.name}</Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                  </TouchableOpacity>
                );
              })}
              {filterSubMenu === 'creator' && filterOptions.creators.map((c) => {
                const isSelected = selectedCreators.has(c.id);
                return (
                  <TouchableOpacity key={c.id} style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]} onPress={() => setSelectedCreators(prev => { const s = new Set(prev); if (s.has(c.id)) s.delete(c.id); else s.add(c.id); return s; })}>
                    <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{c.name}</Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECEFF1' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ECEFF1' },
  header: { backgroundColor: '#fff', paddingTop: 10, paddingBottom: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E9ECEF' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancelButton: { paddingHorizontal: 12, paddingVertical: 8 },
  cancelButtonText: { fontSize: 14, color: '#6C5CE7', fontWeight: '500' },
  selectedCountContainer: { flex: 1, alignItems: 'center' },
  selectedCountText: { fontSize: 14, color: '#636E72', fontWeight: '500' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  deleteButtonText: { fontSize: 14, color: '#E74C3C', fontWeight: '600' },
  filterButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  filterText: { fontSize: 14, color: '#636E72', marginRight: 4, fontWeight: '500' },
  sortButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  sortText: { fontSize: 14, color: '#636E72', marginRight: 4, fontWeight: '500' },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#E9ECEF' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#2D3436', padding: 0 },
  invoiceItem: { backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 12, paddingLeft: 24, borderBottomWidth: 1, borderBottomColor: '#E9ECEF', flexDirection: 'row', alignItems: 'center' },
  receiptItemSelected: { backgroundColor: '#E8F4FD' },
  checkboxContainer: { marginRight: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#BDC3C7', justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: '#6C5CE7', borderColor: '#6C5CE7' },
  receiptContent: { flex: 1 },
  firstRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  storeName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#2D3436', marginRight: 12 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  confirmedStatusContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#00B894', justifyContent: 'center', alignItems: 'center' },
  confirmedByText: { fontSize: 12, color: '#636E72', fontWeight: '500' },
  secondRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: { fontSize: 16, fontWeight: '600', color: '#D35400' },
  date: { fontSize: 14, color: '#636E72' },
  createdDate: { fontSize: 14, color: '#636E72', marginLeft: 'auto' },
  fabContainer: { position: 'absolute', right: 20, bottom: 20, alignItems: 'flex-end' },
  fabActionsContainer: { alignItems: 'flex-end' },
  fabMain: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#6C5CE7', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 6, elevation: 6 },
  fabAction: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 100 },
  emptyList: { flexGrow: 1 },
  sectionHeader: { backgroundColor: '#E9ECEF', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#DEE2E6' },
  sectionHeaderContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2D3436' },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionCount: { fontSize: 14, color: '#636E72' },
  sectionAmount: { fontSize: 14, fontWeight: '600', color: '#D35400' },
  listContent: { paddingHorizontal: 4, paddingTop: 0, paddingBottom: 100 },
  emptyText: { fontSize: 18, color: '#636E72', marginTop: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 14, color: '#95A5A6', marginTop: 8 },
  filterBadge: { fontSize: 14, color: '#6C5CE7', fontWeight: '600' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerBottomSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 32, paddingHorizontal: 20, maxHeight: '70%' },
  pickerHandle: { width: 40, height: 4, backgroundColor: '#BDC3C7', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 18, fontWeight: '600', color: '#2D3436', flex: 1 },
  pickerCloseButton: { paddingHorizontal: 12, paddingVertical: 6 },
  pickerCloseText: { fontSize: 16, color: '#6C5CE7', fontWeight: '600' },
  pickerScrollView: { maxHeight: 400 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, marginBottom: 8, backgroundColor: '#F8F9FA', minHeight: 48, gap: 12 },
  pickerOptionSelected: { backgroundColor: '#E8F4FD' },
  pickerOptionText: { flex: 1, fontSize: 16, color: '#2D3436', fontWeight: '500' },
  pickerOptionTextSelected: { color: '#6C5CE7', fontWeight: '600' },
  pickerBackButton: { paddingHorizontal: 12, paddingVertical: 6 },
  clearFilterButton: { paddingHorizontal: 12, paddingVertical: 6 },
  clearFilterText: { fontSize: 14, color: '#E74C3C', fontWeight: '500' },
  filterMainOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 8, marginBottom: 8, backgroundColor: '#F8F9FA', minHeight: 56 },
  filterMainOptionText: { fontSize: 16, color: '#2D3436', fontWeight: '500', flex: 1 },
  filterCountBadge: { fontSize: 14, color: '#6C5CE7', fontWeight: '600', backgroundColor: '#E8F4FD', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, minWidth: 24, textAlign: 'center' },
});
