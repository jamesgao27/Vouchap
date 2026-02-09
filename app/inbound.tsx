import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Animated,
  InteractionManager,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { showAiInventory } from '@/lib/feature-flags';
import { getAllInbound, deleteInbound, saveInbound } from '@/lib/inbound';
import { Inbound } from '@/types';
import { format } from 'date-fns';
import { VoucherStatus } from '@/types';
import { SwipeableRow } from './SwipeableRow';
import { uploadInboundImageTemp } from '@/lib/supabase';
import { processInboundInBackground } from '@/lib/inbound-processor';
import { processImageForUpload } from '@/lib/image-processor';
import { voucherListStyles as styles } from './voucher-list-styles';
import { getLocalDateString } from '@/lib/date-utils';

type GroupByType = 'month' | 'recordDate' | 'createdBy';

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
  data: Inbound[];
  originalData?: Inbound[];
}

export default function InboundScreen() {
  const [list, setList] = useState<Inbound[]>([]);
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
  const [selectedCreators, setSelectedCreators] = useState<Set<string>>(new Set());
  const [filterSubMenu, setFilterSubMenu] = useState<'main' | 'month' | 'recordDate' | 'creator'>('main');
  const [showFabActions, setShowFabActions] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastInboundId, setLastInboundId] = useState<string | null>(null);
  const fabAnimation = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const isExpoGo = Constants.appOwnership === 'expo';

  useEffect(() => {
    if (!showAiInventory) router.replace('/');
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await getAllInbound();
      setList(data);
    } catch (e) {
      Alert.alert('Error', 'Failed to load inbound');
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => load());
      return () => task.cancel();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setSelectedIds(new Set());
    load();
  };

  const handleAddInbound = async () => {
    try {
      const today = getLocalDateString();
      const id = await saveInbound({
        spaceId: '',
        date: today,
        status: 'pending',
        items: [],
      });
      load();
      router.push(`/inbound-details/${id}?new=true`);
    } catch (e) {
      Alert.alert('Error', 'Failed to create inbound');
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

  const scanDocument = async () => {
    if (isExpoGo) {
      Alert.alert(
        'Development Build Required',
        'Real-time edge detection and cropping requires a native development build. In Expo Go, please use the gallery picker option.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Pick from Gallery', onPress: pickImage }
        ]
      );
      return;
    }

    try {
      // 动态导入 DocumentScanner（只在非 Expo Go 环境中导入）
      const module = await import('react-native-document-scanner-plugin');
      const DocumentScanner = module?.default;

      // 额外防御：模块导入但没有正确挂载时，直接提示使用开发构建
      if (!DocumentScanner || typeof DocumentScanner.scanDocument !== 'function') {
        throw new Error('DocumentScanner module not loaded correctly');
      }

      const { scannedImages } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        croppedImageQuality: 90,
        letUserAdjustCrop: false,  // 自动裁剪，无需手动调整
      } as any);

      if (scannedImages && scannedImages.length > 0) {
        // 自动裁剪后直接处理，实现 Snap 即拍即传
        processCapturedImage(scannedImages[0], false);
      }
    } catch (error) {
      console.error('Document scan error:', error);
      // 如果是模块未找到或原生模块未正确注册的错误，统一提示需要开发构建
      if (
        error instanceof Error &&
        (error.message?.includes('TurboModuleRegistry') ||
          error.message?.includes('Requiring unknown module') ||
          error.message?.includes('module not loaded correctly'))
      ) {
        Alert.alert(
          'Development Build Required',
          'Document scanner requires a native development build. Please use a development build or use the gallery picker option.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Pick from Gallery', onPress: pickImage }
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to snap document. Please try again.');
      }
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        // 从相册选择的图片通常未裁剪，这里保留自动裁剪逻辑
        processCapturedImage(result.assets[0].uri, true);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const processCapturedImage = async (imageUri: string, autoCrop: boolean = true) => {
    setShowSuccessModal(true);
    setLastInboundId(null);
    (async () => {
      try {
        const processedImageUri = await processImageForUpload(imageUri, { autoCrop, quality: 0.85 });
        const tempFileName = `temp-${Date.now()}`;
        const imageUrl = await uploadInboundImageTemp(processedImageUri, tempFileName);
        const today = getLocalDateString();
        const inboundId = await saveInbound({
          spaceId: '',
          date: today,
          status: 'processing',
          items: [],
          imageUrl,
          inputType: 'image',
        });
        setLastInboundId(inboundId);
        load();
        processInboundInBackground(imageUrl, inboundId, processedImageUri).then(() => load()).catch(err => console.error('Background process failed:', err));
      } catch (error) {
        console.error('Processing error:', error);
        Alert.alert('Error', 'Failed to process inbound image.');
        setShowSuccessModal(false);
      }
    })();
  };

  const handleScanFromFab = () => {
    setShowFabActions(false);
    scanDocument();
  };

  const handleChatFromFab = () => {
    setShowFabActions(false);
    router.push('/voice-input?type=inbound');
  };

  const handleAddFromFab = () => {
    setShowFabActions(false);
    handleAddInbound();
  };

  const handleToggleSelect = (inboundId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(inboundId)) newSet.delete(inboundId);
      else newSet.add(inboundId);
      return newSet;
    });
  };

  const handleDeleteSingle = async (inboundId: string) => {
    Alert.alert(
      'Delete Inbound',
      'Are you sure you want to delete this inbound?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInbound(inboundId);
              setList(prev => prev.filter(r => r.id !== inboundId));
              setSelectedIds(prev => { const s = new Set(prev); s.delete(inboundId); return s; });
            } catch (error) {
              Alert.alert('Error', 'Failed to delete inbound');
              load();
            }
          },
        },
      ]
    );
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Delete Inbound',
      `Delete ${selectedIds.size} inbound(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all(Array.from(selectedIds).map(id => deleteInbound(id)));
              const idsToDelete = Array.from(selectedIds);
              setList(prev => prev.filter(r => r.id && !idsToDelete.includes(r.id)));
              setSelectedIds(new Set());
            } catch (error) {
              Alert.alert('Error', 'Failed to delete some inbound');
              load();
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

  const groupByMonth = useCallback((data: Inbound[]): SectionData[] => {
    const grouped = new Map<string, Inbound[]>();
    data.forEach(inv => {
      try {
        const date = parseLocalDate(inv.date);
        const monthKey = `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!grouped.has(monthKey)) grouped.set(monthKey, []);
        grouped.get(monthKey)!.push(inv);
      } catch (_) {}
    });
    return Array.from(grouped.entries())
      .map(([monthKey, sectionData]) => ({
        title: format(parseLocalDate(sectionData[0].date), 'MMMM yyyy'),
        monthKey,
        data: sectionData.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()),
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, []);

  const groupByRecordDate = useCallback((data: Inbound[]): SectionData[] => {
    const grouped = new Map<string, Inbound[]>();
    data.forEach(inv => {
      if (!inv.createdAt) return;
      const d = new Date(inv.createdAt);
      const dayKey = `record-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!grouped.has(dayKey)) grouped.set(dayKey, []);
      grouped.get(dayKey)!.push(inv);
    });
    return Array.from(grouped.entries())
      .map(([dayKey, sectionData]) => {
        const base = sectionData[0].createdAt ? new Date(sectionData[0].createdAt) : parseLocalDate(sectionData[0].date);
        const dateOnly = new Date(base.getFullYear(), base.getMonth(), base.getDate());
        return {
          title: format(dateOnly, 'MMM dd, yyyy'),
          monthKey: dayKey,
          data: sectionData.slice().sort((a, b) => {
            const at = a.createdAt ? new Date(a.createdAt).getTime() : parseLocalDate(a.date).getTime();
            const bt = b.createdAt ? new Date(b.createdAt).getTime() : parseLocalDate(b.date).getTime();
            return bt - at;
          }),
        };
      })
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, []);

  const groupByCreatedBy = useCallback((data: Inbound[]): SectionData[] => {
    const grouped = new Map<string, Inbound[]>();
    data.forEach(inv => {
      const userKey = `user-${inv.createdBy || 'unknown'}`;
      if (!grouped.has(userKey)) grouped.set(userKey, []);
      grouped.get(userKey)!.push(inv);
    });
    return Array.from(grouped.entries())
      .map(([userKey, sectionData]) => {
        const createdBy = sectionData[0].createdBy;
        const title = createdBy
          ? (sectionData[0] as any).createdByUser?.name ?? (sectionData[0] as any).createdByUser?.email?.split('@')[0] ?? createdBy.slice(0, 8) + '…'
          : 'Unknown';
        return {
          title,
          monthKey: userKey,
          data: sectionData.slice().sort((a, b) => {
            const at = a.createdAt ? new Date(a.createdAt).getTime() : parseLocalDate(a.date).getTime();
            const bt = b.createdAt ? new Date(b.createdAt).getTime() : parseLocalDate(b.date).getTime();
            return bt - at;
          }),
        };
      })
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, []);

  const getGroupedList = useCallback((data: Inbound[]): SectionData[] => {
    switch (groupBy) {
      case 'recordDate': return groupByRecordDate(data);
      case 'createdBy': return groupByCreatedBy(data);
      case 'month':
      default: return groupByMonth(data);
    }
  }, [groupBy, groupByMonth, groupByRecordDate, groupByCreatedBy]);

  const filteredList = useMemo(() => {
    let filtered = list;
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
    if (selectedCreators.size > 0) {
      filtered = filtered.filter(inv => selectedCreators.has(inv.createdBy || 'unknown'));
    }
    return filtered;
  }, [list, selectedMonths, selectedRecordDates, selectedCreators]);

  const searchedList = useMemo(() => {
    if (!searchQuery.trim()) return filteredList;
    const q = searchQuery.trim().toLowerCase();
    return filteredList.filter(inv =>
      (inv.documentNo || '').toLowerCase().includes(q) ||
      (inv.supplierName || '').toLowerCase().includes(q)
    );
  }, [filteredList, searchQuery]);

  const filterOptions = useMemo(() => {
    const months = new Set<string>();
    const recordDates = new Set<string>();
    const creators = new Map<string, string>();
    list.forEach(inv => {
      try {
        const d = parseLocalDate(inv.date);
        months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      } catch {}
      if (inv.createdAt) {
        const d = new Date(inv.createdAt);
        recordDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
      const id = inv.createdBy || 'unknown';
      if (!creators.has(id)) {
        const invAny = inv as any;
        const name = invAny.createdByUser?.name ?? invAny.createdByUser?.email?.split('@')[0] ?? (inv.createdBy ? `${inv.createdBy.slice(0, 8)}…` : 'Unknown');
        creators.set(id, name);
      }
    });
    return {
      months: Array.from(months).sort((a, b) => b.localeCompare(a)).map(k => {
        const [y, m] = k.split('-');
        return { key: k, label: format(new Date(parseInt(y), parseInt(m) - 1), 'MMMM yyyy') };
      }),
      recordDates: Array.from(recordDates).sort((a, b) => b.localeCompare(a)).map(k => {
        const [y, m, d] = k.split('-');
        return { key: k, label: format(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)), 'MMM dd, yyyy') };
      }),
      creators: Array.from(creators.entries()).map(([id, name]) => ({ id, name })),
    };
  }, [list]);

  const sections = getGroupedList(searchedList);

  const toggleSection = (monthKey: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  };

  if (!showAiInventory) return null;

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
                  {(selectedMonths.size + selectedRecordDates.size + selectedCreators.size) > 0 && (
                    <Text style={styles.filterBadge}> ({selectedMonths.size + selectedRecordDates.size + selectedCreators.size})</Text>
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
        keyExtractor={(item: Inbound) => item.id || Math.random().toString()}
        renderItem={({ item }) => {
          const isSelected = item.id ? selectedIds.has(item.id) : false;
          const isSelectionMode = selectedIds.size > 0;
          return (
            <SwipeableRow onDelete={() => item.id && handleDeleteSingle(item.id)} disabled={isSelectionMode}>
              <TouchableOpacity
                style={[styles.receiptItem, isSelected && styles.receiptItemSelected]}
                onPress={() => {
                  if (isSelectionMode) {
                    if (item.id) handleToggleSelect(item.id);
                  } else {
                    router.push(`/inbound-details/${item.id}`);
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
                      {item.supplierName || item.documentNo || 'Inbound'}
                    </Text>
                    {item.status === 'confirmed' ? (
                      <View style={styles.confirmedStatusContainer}>
                        <View style={styles.confirmedBadge}>
                          <Ionicons name={item.inputType === 'audio' ? 'mic' : item.inputType === 'text' ? 'menu' : 'camera'} size={12} color="#fff" />
                        </View>
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, { backgroundColor: statusColors[item.status] }]}>
                        <Text style={styles.statusText}>{statusLabels[item.status]}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.secondRow}>
                    {item.totalAmount != null && (
                      <AmountText amount={Number(item.totalAmount)} currency={item.currency} style={styles.amount} />
                    )}
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
          const confirmed = dataForStats.filter((inv: Inbound) => inv.status === 'confirmed');
          const dominantCurrency = confirmed.length
            ? (confirmed.map((r: Inbound) => r.currency || 'USD').sort((a: string, b: string) =>
                confirmed.filter((v: Inbound) => (v.currency || 'USD') === a).length -
                confirmed.filter((v: Inbound) => (v.currency || 'USD') === b).length
              ).pop())
            : 'USD';
          const totalAmount = confirmed.reduce((sum: number, r: Inbound) => sum + (r.totalAmount ?? 0), 0);
          return (
            <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(section.monthKey)} activeOpacity={0.7}>
              <View style={styles.sectionHeaderContent}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionHeaderRight}>
                  <Text style={styles.sectionCount}>{confirmed.length} inbounds</Text>
                  {totalAmount > 0 && (
                    <AmountText amount={totalAmount} currency={dominantCurrency} style={styles.sectionAmount} />
                  )}
                  <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={20} color="#636E72" />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loading && list.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color="#6C5CE7" />
              <Text style={styles.emptyText}>Loading...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="arrow-down-circle-outline" size={64} color="#BDC3C7" />
              <Text style={styles.emptyText}>No inbound yet</Text>
              <Text style={styles.emptySubtext}>Tap + to add an inbound</Text>
            </View>
          )
        }
        contentContainerStyle={sections.length === 0 ? styles.emptyList : styles.listContent}
        stickySectionHeadersEnabled={false}
      />

      <View style={styles.fabContainer}>
        {showFabActions && (
          <View style={styles.fabActionsContainer}>
            <Animated.View style={{ opacity: fabAnimation }}>
              <TouchableOpacity style={styles.fabAction} onPress={handleScanFromFab} activeOpacity={0.8}>
                <Ionicons name="camera-outline" size={28} color="#6C5CE7" />
              </TouchableOpacity>
            </Animated.View>
            <Animated.View style={{ marginTop: 8, opacity: fabAnimation }}>
              <TouchableOpacity style={styles.fabAction} onPress={handleChatFromFab} activeOpacity={0.8}>
                <Ionicons name="chatbubble-outline" size={28} color="#6C5CE7" />
              </TouchableOpacity>
            </Animated.View>
            <Animated.View style={{ marginTop: 8, opacity: fabAnimation }}>
              <TouchableOpacity style={styles.fabAction} onPress={handleAddFromFab} activeOpacity={0.8}>
                <Ionicons name="add" size={28} color="#6C5CE7" />
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

      <Modal animationType="fade" transparent visible={showSuccessModal} onRequestClose={() => setShowSuccessModal(false)}>
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={64} color="#00B894" />
            </View>
            <Text style={styles.successTitle}>已提交</Text>
            <Text style={styles.successSubtitle}>入库单正在识别中</Text>
            <View style={styles.successButtons}>
              <TouchableOpacity style={styles.successButton} onPress={() => { setShowSuccessModal(false); scanDocument(); }}>
                <Ionicons name="camera-outline" size={24} color="#6C5CE7" />
                <Text style={styles.successButtonText}>再拍一张</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.successButton, !lastInboundId && { opacity: 0.5 }]}
                disabled={!lastInboundId}
                onPress={() => {
                  setShowSuccessModal(false);
                  if (lastInboundId) router.push(`/inbound-details/${lastInboundId}`);
                }}
              >
                {lastInboundId ? <Ionicons name="eye-outline" size={24} color="#6C5CE7" /> : <ActivityIndicator size="small" color="#6C5CE7" />}
                <Text style={styles.successButtonText}>{lastInboundId ? '查看详情' : '上传中...'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.successButton} onPress={() => setShowSuccessModal(false)}>
                <Ionicons name="checkmark-outline" size={24} color="#6C5CE7" />
                <Text style={styles.successButtonText}>完成</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
              {(['month', 'recordDate', 'createdBy'] as const).map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.pickerOption, groupBy === key && styles.pickerOptionSelected]}
                  onPress={() => { setGroupBy(key); setShowSortMenu(false); }}
                >
                  {key === 'month' && <Ionicons name="calendar-outline" size={20} color={groupBy === key ? '#6C5CE7' : '#636E72'} style={{ marginRight: 12 }} />}
                  {key === 'recordDate' && <Ionicons name="time-outline" size={20} color={groupBy === key ? '#6C5CE7' : '#636E72'} style={{ marginRight: 12 }} />}
                  {key === 'createdBy' && <Ionicons name="person-outline" size={20} color={groupBy === key ? '#6C5CE7' : '#636E72'} style={{ marginRight: 12 }} />}
                  <Text style={[styles.pickerOptionText, groupBy === key && styles.pickerOptionTextSelected, { flex: 1 }]}>
                    {key === 'month' && 'Transaction Month'}
                    {key === 'recordDate' && 'Record Date'}
                    {key === 'createdBy' && 'Recorder'}
                  </Text>
                  {groupBy === key && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showFilterMenu} transparent animationType="slide" onRequestClose={() => { setShowFilterMenu(false); setFilterSubMenu('main'); }}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => { setShowFilterMenu(false); setFilterSubMenu('main'); }}>
          <View style={styles.pickerBottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              {filterSubMenu !== 'main' ? (
                <>
                  <TouchableOpacity onPress={() => setFilterSubMenu('main')} style={styles.pickerBackButton}>
                    <Ionicons name="chevron-back" size={20} color="#6C5CE7" />
                  </TouchableOpacity>
                  <Text style={styles.pickerTitle}>
                    {filterSubMenu === 'month' && 'Select Transaction Months'}
                    {filterSubMenu === 'recordDate' && 'Select Record Dates'}
                    {filterSubMenu === 'creator' && 'Select Recorders'}
                  </Text>
                  <TouchableOpacity onPress={() => setFilterSubMenu('main')} style={styles.pickerCloseButton}>
                    <Text style={styles.pickerCloseText}>Done</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.pickerTitle}>Filter</Text>
                  <View style={styles.pickerHeaderRight}>
                    {(selectedMonths.size > 0 || selectedRecordDates.size > 0 || selectedCreators.size > 0) && (
                      <TouchableOpacity onPress={() => { setSelectedMonths(new Set()); setSelectedRecordDates(new Set()); setSelectedCreators(new Set()); }} style={styles.clearFilterButton}>
                        <Text style={styles.clearFilterText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => { setShowFilterMenu(false); setFilterSubMenu('main'); }} style={styles.pickerCloseButton}>
                      <Text style={styles.pickerCloseText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
            <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
              {filterSubMenu === 'main' && (
                <>
                  <TouchableOpacity style={styles.filterMainOption} onPress={() => setFilterSubMenu('month')}>
                    <View style={styles.filterMainOptionLeft}>
                      <Ionicons name="calendar-outline" size={20} color="#636E72" />
                      <Text style={styles.filterMainOptionText}>Transaction Month</Text>
                    </View>
                    <View style={styles.filterMainOptionRight}>
                      {selectedMonths.size > 0 && <Text style={styles.filterCountBadge}>{selectedMonths.size}</Text>}
                      <Ionicons name="chevron-forward" size={20} color="#95A5A6" />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.filterMainOption} onPress={() => setFilterSubMenu('recordDate')}>
                    <View style={styles.filterMainOptionLeft}>
                      <Ionicons name="time-outline" size={20} color="#636E72" />
                      <Text style={styles.filterMainOptionText}>Record Date</Text>
                    </View>
                    <View style={styles.filterMainOptionRight}>
                      {selectedRecordDates.size > 0 && <Text style={styles.filterCountBadge}>{selectedRecordDates.size}</Text>}
                      <Ionicons name="chevron-forward" size={20} color="#95A5A6" />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.filterMainOption} onPress={() => setFilterSubMenu('creator')}>
                    <View style={styles.filterMainOptionLeft}>
                      <Ionicons name="person-outline" size={20} color="#636E72" />
                      <Text style={styles.filterMainOptionText}>Recorder</Text>
                    </View>
                    <View style={styles.filterMainOptionRight}>
                      {selectedCreators.size > 0 && <Text style={styles.filterCountBadge}>{selectedCreators.size}</Text>}
                      <Ionicons name="chevron-forward" size={20} color="#95A5A6" />
                    </View>
                  </TouchableOpacity>
                </>
              )}
              {filterSubMenu === 'month' && filterOptions.months.map((m) => {
                const isSelected = selectedMonths.has(m.key);
                return (
                  <TouchableOpacity key={m.key} style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]} onPress={() => setSelectedMonths(prev => { const s = new Set(prev); if (s.has(m.key)) s.delete(m.key); else s.add(m.key); return s; })}>
                    <View style={styles.filterOptionLeft}>
                      <View style={[styles.filterCheckbox, isSelected && styles.filterCheckboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                      <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{m.label}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                  </TouchableOpacity>
                );
              })}
              {filterSubMenu === 'recordDate' && filterOptions.recordDates.map((d) => {
                const isSelected = selectedRecordDates.has(d.key);
                return (
                  <TouchableOpacity key={d.key} style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]} onPress={() => setSelectedRecordDates(prev => { const s = new Set(prev); if (s.has(d.key)) s.delete(d.key); else s.add(d.key); return s; })}>
                    <View style={styles.filterOptionLeft}>
                      <View style={[styles.filterCheckbox, isSelected && styles.filterCheckboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                      <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{d.label}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                  </TouchableOpacity>
                );
              })}
              {filterSubMenu === 'creator' && filterOptions.creators.map((c) => {
                const isSelected = selectedCreators.has(c.id);
                return (
                  <TouchableOpacity key={c.id} style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]} onPress={() => setSelectedCreators(prev => { const s = new Set(prev); if (s.has(c.id)) s.delete(c.id); else s.add(c.id); return s; })}>
                    <View style={styles.filterOptionLeft}>
                      <View style={[styles.filterCheckbox, isSelected && styles.filterCheckboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                      <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{c.name}</Text>
                    </View>
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

