import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  Platform,
  Animated,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  getSkus,
  createSku,
  updateSku,
  deleteSku,
  mergeSkus,
  unmergeSku,
  getSkusForMergeHistory,
  getSkuUsageCounts,
  type SkusMergeHistoryData,
  type SkuUsageCounts,
} from '@/lib/skus';
import { Sku } from '@/types';
import { GradientText } from '@/lib/GradientText';

export default function SkusManageScreen() {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('件');
  const [saving, setSaving] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<string>>(new Set());
  const [mergeHistoryData, setMergeHistoryData] = useState<SkusMergeHistoryData | null>(null);
  const [usageCounts, setUsageCounts] = useState<SkuUsageCounts | null>(null);
  const [expandedRootIds, setExpandedRootIds] = useState<Set<string>>(new Set());
  const [showQuickCleanModal, setShowQuickCleanModal] = useState(false);
  const [showMergeTargetModal, setShowMergeTargetModal] = useState(false);
  const [mergeTargetModalAccounts, setMergeTargetModalAccounts] = useState<Sku[] | null>(null);
  const [mergeTargetSelectedId, setMergeTargetSelectedId] = useState<string | null>(null);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [deleteSelectedModalAccounts, setDeleteSelectedModalAccounts] = useState<Sku[] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (message: string, duration: number = 1500) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(duration),
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToastMessage(null));
  };

  const load = async () => {
    try {
      const data = await getSkus();
      setSkus(data);
    } catch (e) {
      console.error('Load skus error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [])
  );

  const openAdd = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setUnit('件');
    setModalVisible(true);
  };

  const openEdit = (sku: Sku) => {
    setEditingId(sku.id);
    setName(sku.name);
    setCode(sku.code || '');
    setUnit(sku.unit || '件');
    setModalVisible(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateSku(editingId, { name: name.trim(), code: code.trim() || undefined, unit: unit.trim() || '件' });
      } else {
        await createSku({ name: name.trim(), code: code.trim() || undefined, unit: unit.trim() || '件' });
      }
      setModalVisible(false);
      load();
    } catch (e) {
      console.error('Save sku error:', e);
      Alert.alert('保存失败', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = (sku: Sku) => {
    Alert.alert('删除商品', `确定删除「${sku.name}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSku(sku.id);
            load();
          } catch (e) {
            Alert.alert('删除失败', (e as Error).message);
          }
        },
      },
    ]);
  };

  const toggleSkuSelection = (skuId: string) => {
    const next = new Set(selectedSkuIds);
    if (next.has(skuId)) next.delete(skuId);
    else next.add(skuId);
    setSelectedSkuIds(next);
  };

  const handleStartMerge = async () => {
    setMergeMode(true);
    setSelectedSkuIds(new Set());
    setModalVisible(false);
    setExpandedRootIds(new Set());
    try {
      const [historyData, counts] = await Promise.all([
        getSkusForMergeHistory(),
        getSkuUsageCounts(),
      ]);
      setMergeHistoryData(historyData);
      setUsageCounts(counts);
    } catch (e: any) {
      console.error('Error loading merge data:', e);
      Alert.alert('Error', e?.message ?? 'Failed to load merge data');
    }
  };

  const handleCancelMerge = () => {
    setMergeMode(false);
    setSelectedSkuIds(new Set());
    setMergeHistoryData(null);
    setUsageCounts(null);
    setExpandedRootIds(new Set());
  };

  const directUsage = (id: string) => usageCounts?.usageCountBySkuId[id] ?? 0;
  const totalCount = (root: Sku, children: Sku[]) =>
    directUsage(root.id) + children.reduce((s, c) => s + directUsage(c.id), 0);
  const directCount = (id: string) => directUsage(id);

  const cleanableRoots = (() => {
    if (!mergeHistoryData || !usageCounts) return [];
    return mergeHistoryData.roots.filter((root) => {
      const children = mergeHistoryData.childrenByRootId.get(root.id) ?? [];
      const hasUsage = directUsage(root.id) > 0;
      const hasChildUsage = children.some((c) => directUsage(c.id) > 0);
      const hasChildren = children.length > 0;
      return !hasUsage && !hasChildUsage && !hasChildren;
    });
  })();

  const handleCleanEmpty = () => {
    if (cleanableRoots.length === 0) {
      Alert.alert('Notice', 'No empty SKUs to clean.');
      return;
    }
    setShowQuickCleanModal(true);
  };

  const doQuickCleanConfirm = async () => {
    if (cleanableRoots.length === 0) return;
    setShowQuickCleanModal(false);
    try {
      for (const root of cleanableRoots) {
        await deleteSku(root.id);
      }
      await load();
      const [historyData, counts] = await Promise.all([
        getSkusForMergeHistory(),
        getSkuUsageCounts(),
      ]);
      setMergeHistoryData(historyData);
      setUsageCounts(counts);
      showToast(`Cleaned ${cleanableRoots.length} empty SKU(s).`);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  const setMergeTargetSelection = (skuId: string) => setMergeTargetSelectedId(skuId);
  const confirmMergeTarget = () => {
    if (!mergeTargetSelectedId) return;
    const sourceIds = Array.from(selectedSkuIds).filter((id) => id !== mergeTargetSelectedId);
    setShowMergeTargetModal(false);
    setMergeTargetModalAccounts(null);
    setMergeTargetSelectedId(null);
    performMerge(sourceIds, mergeTargetSelectedId);
  };

  const handleConfirmMerge = () => {
    if (selectedSkuIds.size < 2) {
      Alert.alert('Error', 'Please select at least 2 SKUs to merge');
      return;
    }
    const allInMerge = mergeHistoryData
      ? [...mergeHistoryData.roots, ...Array.from(mergeHistoryData.childrenByRootId.values()).flat()]
      : [];
    const selected = allInMerge.filter((s) => selectedSkuIds.has(s.id));
    setMergeTargetModalAccounts(selected);
    setMergeTargetSelectedId(null);
    setShowMergeTargetModal(true);
  };

  const performMerge = async (sourceSkuIds: string[], targetSkuId: string) => {
    try {
      await mergeSkus(sourceSkuIds, targetSkuId);
      await load();
      const [historyData, counts] = await Promise.all([
        getSkusForMergeHistory(),
        getSkuUsageCounts(),
      ]);
      setMergeHistoryData(historyData);
      setUsageCounts(counts);
      setSelectedSkuIds(new Set());
      setExpandedRootIds(new Set());
      showToast('SKUs merged successfully');
    } catch (error: any) {
      console.error('Error merging SKUs:', error);
      Alert.alert('Error', error.message || 'Failed to merge SKUs');
    }
  };

  const handleUnmerge = async (childId: string) => {
    try {
      await unmergeSku(childId);
      await load();
      const [historyData, counts] = await Promise.all([
        getSkusForMergeHistory(),
        getSkuUsageCounts(),
      ]);
      setMergeHistoryData(historyData);
      setUsageCounts(counts);
      setSelectedSkuIds((prev) => {
        const next = new Set(prev);
        next.delete(childId);
        return next;
      });
      showToast('Unmerged');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedSkuIds.size === 0) return;
    const allInMerge = mergeHistoryData
      ? [...mergeHistoryData.roots, ...Array.from(mergeHistoryData.childrenByRootId.values()).flat()]
      : [];
    const selected = allInMerge.filter((s) => selectedSkuIds.has(s.id));
    setDeleteSelectedModalAccounts(selected);
    setShowDeleteSelectedModal(true);
  };

  const doDeleteSelectedConfirm = async () => {
    const selected = deleteSelectedModalAccounts;
    setShowDeleteSelectedModal(false);
    setDeleteSelectedModalAccounts(null);
    if (!selected || selected.length === 0) return;
    try {
      for (const s of selected) {
        await deleteSku(s.id);
      }
      await load();
      const [historyData, counts] = await Promise.all([
        getSkusForMergeHistory(),
        getSkuUsageCounts(),
      ]);
      setMergeHistoryData(historyData);
      setUsageCounts(counts);
      setSelectedSkuIds(new Set());
      showToast(`Deleted ${selected.length} SKU(s).`);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  const toggleExpand = (rootId: string) => {
    setExpandedRootIds((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  if (loading && skus.length === 0 && !mergeMode) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {toastMessage && (
        <Animated.View style={[styles.toastWrapper, { opacity: toastOpacity }]} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </Animated.View>
      )}

      {/* Quick Clean */}
      <Modal visible={showQuickCleanModal} transparent animationType="fade" onRequestClose={() => setShowQuickCleanModal(false)}>
        <TouchableOpacity style={styles.actionModalOverlay} activeOpacity={1} onPress={() => setShowQuickCleanModal(false)}>
          <View style={styles.actionModalContentContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.actionModalContent}>
              <View style={styles.actionModalHeader}>
                <View style={styles.actionModalHeaderIconWrap}>
                  <Ionicons name="trash-outline" size={40} color="#E67E22" />
                </View>
                <Text style={styles.actionModalTitle}>Quick Clean</Text>
                <Text style={styles.actionModalSubtitle}>
                  Delete {cleanableRoots.length} empty SKU(s) (no usage, not merged):
                </Text>
              </View>
              <ScrollView style={styles.actionModalList} nestedScrollEnabled>
                {cleanableRoots.map((r) => (
                  <View key={r.id} style={styles.actionModalRow}>
                    <Text style={styles.actionModalRowText} numberOfLines={1}>{r.name}{r.code ? ` (${r.code})` : ''}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.actionModalButtons}>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonSecondary]} onPress={() => setShowQuickCleanModal(false)} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonWarning]} onPress={doQuickCleanConfirm} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonWarningText}>Clean</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Merge: choose which SKU to keep */}
      <Modal visible={showMergeTargetModal} transparent animationType="fade" onRequestClose={() => { setShowMergeTargetModal(false); setMergeTargetModalAccounts(null); setMergeTargetSelectedId(null); }}>
        <TouchableOpacity style={styles.actionModalOverlay} activeOpacity={1} onPress={() => { setShowMergeTargetModal(false); setMergeTargetModalAccounts(null); setMergeTargetSelectedId(null); }}>
          <View style={styles.actionModalContentContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.actionModalContent}>
              <View style={styles.actionModalHeader}>
                <View style={styles.actionModalHeaderIconWrap}>
                  <Ionicons name="git-merge-outline" size={40} color="#6C5CE7" />
                </View>
                <Text style={styles.actionModalTitle}>Choose which SKU to keep,</Text>
                <Text style={styles.actionModalSubtitle}>Others will be merged into it.</Text>
              </View>
              <ScrollView style={styles.actionModalList} nestedScrollEnabled>
                {(mergeTargetModalAccounts ?? []).map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.actionModalRowTappable, mergeTargetSelectedId === s.id && styles.actionModalRowSelected]}
                    onPress={() => setMergeTargetSelection(s.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionModalRowText} numberOfLines={1}>{s.name}{s.code ? ` (${s.code})` : ''}</Text>
                    {mergeTargetSelectedId === s.id ? (
                      <Ionicons name="checkmark-circle" size={22} color="#6C5CE7" />
                    ) : (
                      <Ionicons name="ellipse-outline" size={22} color="#BDC3C7" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.actionModalButtons}>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonSecondary]} onPress={() => { setShowMergeTargetModal(false); setMergeTargetModalAccounts(null); setMergeTargetSelectedId(null); }} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonPrimary]} onPress={confirmMergeTarget} disabled={!mergeTargetSelectedId} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonPrimaryText}>Merge</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete selected */}
      <Modal visible={showDeleteSelectedModal} transparent animationType="fade" onRequestClose={() => { setShowDeleteSelectedModal(false); setDeleteSelectedModalAccounts(null); }}>
        <TouchableOpacity style={styles.actionModalOverlay} activeOpacity={1} onPress={() => { setShowDeleteSelectedModal(false); setDeleteSelectedModalAccounts(null); }}>
          <View style={styles.actionModalContentContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.actionModalContent}>
              <View style={styles.actionModalHeader}>
                <View style={styles.actionModalHeaderIconWrap}>
                  <Ionicons name="trash-outline" size={40} color="#E74C3C" />
                </View>
                <Text style={styles.actionModalSubtitle}>
                  Delete {deleteSelectedModalAccounts?.length ?? 0} selected SKU(s)?
                </Text>
              </View>
              <ScrollView style={styles.actionModalList} nestedScrollEnabled>
                {(deleteSelectedModalAccounts ?? []).map((s) => (
                  <View key={s.id} style={styles.actionModalRow}>
                    <Text style={styles.actionModalRowText} numberOfLines={1}>{s.name}{s.code ? ` (${s.code})` : ''}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.actionModalButtons}>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonSecondary]} onPress={() => { setShowDeleteSelectedModal(false); setDeleteSelectedModalAccounts(null); }} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionModalButton, styles.actionModalButtonDanger]} onPress={doDeleteSelectedConfirm} activeOpacity={0.8}>
                  <Text style={styles.actionModalButtonDangerText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Header */}
      {mergeMode ? (
        <View style={styles.headerMerge}>
          <View style={styles.headerMergeTextBlock}>
            <GradientText
              text="Select two or more, then choose which to keep, others will be merged into it."
              style={styles.mergeHeaderTextInHeader}
              containerStyle={styles.mergeHeaderGradientContainer}
            />
          </View>
          <View style={styles.headerTableRow}>
            <View style={styles.checkboxContainer} />
            <View style={styles.headerTableRowNameCell}>
              <Text style={styles.tableHeaderNameLeft}>SKU</Text>
              <Text style={styles.headerSelectedCount}>
                （{selectedSkuIds.size}/{mergeHistoryData ? mergeHistoryData.roots.length : 0}）
              </Text>
            </View>
            <View style={styles.countsCell}>
              <Text style={styles.tableHeaderCount}>Records</Text>
            </View>
            <View style={styles.expandPlaceholderSmall} />
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>商品 SKU</Text>
        </View>
      )}

      {mergeMode && mergeHistoryData ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.scrollContentWithBottomBar]}>
          <View style={styles.skusList}>
            {mergeHistoryData.roots.map((root) => {
              const children = mergeHistoryData.childrenByRootId.get(root.id) ?? [];
              const expanded = expandedRootIds.has(root.id);
              const hasChildren = children.length > 0;
              return (
                <View key={root.id} style={styles.skuCard}>
                  <View style={[styles.mergeRowRoot, selectedSkuIds.has(root.id) && styles.skuRowSelected]}>
                    <TouchableOpacity style={styles.mergeRowSelectionArea} onPress={() => toggleSkuSelection(root.id)} activeOpacity={0.7}>
                      <View style={styles.checkboxContainer}>
                        {selectedSkuIds.has(root.id) ? <Ionicons name="checkbox" size={24} color="#6C5CE7" /> : <Ionicons name="checkbox-outline" size={24} color="#BDC3C7" />}
                      </View>
                      <Text style={styles.skuName} numberOfLines={1}>{root.name}{root.code ? ` (${root.code})` : ''}</Text>
                      <View style={styles.countsCell}>
                        <Text style={styles.countText}>{expanded ? directCount(root.id) : totalCount(root, children)}</Text>
                      </View>
                    </TouchableOpacity>
                    {hasChildren ? (
                      <TouchableOpacity style={styles.expandButtonSmall} onPress={() => toggleExpand(root.id)} hitSlop={{ left: 0, right: 48, top: 24, bottom: 24 }} activeOpacity={0.7}>
                        <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={14} color="#6C5CE7" />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.expandPlaceholderSmall} />
                    )}
                  </View>
                  {expanded && children.map((child) => (
                    <View key={child.id} style={[styles.childRow, selectedSkuIds.has(child.id) && styles.skuRowSelected]}>
                      <TouchableOpacity style={styles.mergeRowSelectionArea} onPress={() => toggleSkuSelection(child.id)} activeOpacity={0.7}>
                        <View style={styles.checkboxContainer}>
                          {selectedSkuIds.has(child.id) ? <Ionicons name="checkbox" size={24} color="#6C5CE7" /> : <Ionicons name="checkbox-outline" size={24} color="#BDC3C7" />}
                        </View>
                        <Text style={styles.childName} numberOfLines={1}>{child.name}{child.code ? ` (${child.code})` : ''}</Text>
                        <View style={styles.countsCell}>
                          <Text style={styles.countText}>{directCount(child.id)}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.childRowUnmergeButton} onPress={() => handleUnmerge(child.id)} hitSlop={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                        <Ionicons name="exit-outline" size={14} color="#6C5CE7" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={skus}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#6C5CE7']} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={48} color="#BDC3C7" />
              <Text style={styles.emptyText}>暂无商品 SKU</Text>
              <Text style={styles.emptyHint}>入库/出库明细可关联标准商品</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity style={styles.rowContent} onPress={() => openEdit(item)} activeOpacity={0.7}>
                <Text style={styles.skuName}>{item.name}</Text>
                <View style={styles.rowMeta}>
                  {item.code ? <Text style={styles.skuCode}>{item.code}</Text> : null}
                  <Text style={styles.skuUnit}>{item.unit}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(item)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={22} color="#E74C3C" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {!mergeMode && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomBarAddButton} onPress={openAdd}>
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.bottomBarAddButtonText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomBarMergeButton} onPress={handleStartMerge}>
            <Ionicons name="git-merge-outline" size={20} color="#fff" />
            <Text style={styles.bottomBarMergeButtonText}>Merge & Clean</Text>
          </TouchableOpacity>
        </View>
      )}

      {mergeMode && (
        <View style={[styles.bottomBar, styles.bottomBarMergeMode]}>
          {selectedSkuIds.size === 0 ? (
            <View style={styles.bottomBarCleanWrapper}>
              <TouchableOpacity style={styles.bottomBarCleanButton} onPress={handleCleanEmpty}>
                <Ionicons name="trash-outline" size={18} color="#E67E22" />
                <Text style={styles.bottomBarCleanButtonText}>Quick Clean</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.bottomBarMergeActions}>
              <TouchableOpacity style={styles.bottomBarCancelButton} onPress={handleCancelMerge}>
                <Text style={styles.bottomBarCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bottomBarConfirmButton} onPress={handleConfirmMerge} disabled={selectedSkuIds.size < 2}>
                <Text style={styles.bottomBarConfirmButtonText}>Merge</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bottomBarDeleteButton} onPress={handleDeleteSelected}>
                <Text style={styles.bottomBarDeleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{editingId ? '编辑商品' : '新增商品'}</Text>
            <TextInput style={styles.input} placeholder="名称 *" placeholderTextColor="#95A5A6" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="编码（可选）" placeholderTextColor="#95A5A6" value={code} onChangeText={setCode} />
            <TextInput style={styles.input} placeholder="单位" placeholderTextColor="#95A5A6" value={unit} onChangeText={setUnit} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModalVisible(false)} disabled={saving}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={save} disabled={saving || !name.trim()}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>保存</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  toastWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    alignSelf: 'center',
    backgroundColor: 'rgba(45, 52, 54, 0.9)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#636E72', marginTop: 12 },
  emptyHint: { fontSize: 14, color: '#95A5A6', marginTop: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  headerMerge: {
    flexDirection: 'column',
    paddingTop: 13,
    paddingBottom: 0,
    minHeight: 88,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerMergeTextBlock: { alignItems: 'flex-start', paddingBottom: 4, paddingLeft: 64, paddingRight: 16, paddingTop: 0 },
  mergeHeaderTextInHeader: { fontSize: 17, fontWeight: '600', textAlign: 'left' },
  mergeHeaderGradientContainer: { alignItems: 'flex-start', alignSelf: 'flex-start' },
  headerTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 6,
    paddingRight: 32,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: 24,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  headerTableRowNameCell: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  tableHeaderNameLeft: { fontSize: 13, fontWeight: '600', color: '#636E72' },
  headerSelectedCount: { fontSize: 13, fontWeight: '600', color: '#636E72', marginLeft: 4 },
  tableHeaderCount: { minWidth: 64, fontSize: 13, fontWeight: '600', color: '#636E72', textAlign: 'right' },
  checkboxContainer: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  expandPlaceholderSmall: { width: 18 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },
  scrollContentWithBottomBar: { paddingBottom: 88 },
  skusList: { gap: 12 },
  skuCard: { backgroundColor: '#fff', borderRadius: 8, padding: 10 },
  mergeRowRoot: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  mergeRowSelectionArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  countsCell: { alignItems: 'center', justifyContent: 'flex-end', minWidth: 64 },
  countText: { fontSize: 13, color: '#636E72', textAlign: 'right' },
  expandButtonSmall: { padding: 2, marginRight: 4 },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingVertical: 6,
    minHeight: 40,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  childName: { flex: 1, fontSize: 14, color: '#636E72' },
  childRowUnmergeButton: { width: 18, marginRight: 4, padding: 2, justifyContent: 'center', alignItems: 'center' },
  skuRowSelected: { backgroundColor: '#E8F4FD', borderRadius: 8, padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF' },
  rowContent: { flex: 1, padding: 16 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 12 },
  skuName: { fontSize: 16, fontWeight: '600', color: '#2D3436' },
  skuCode: { fontSize: 14, color: '#636E72' },
  skuUnit: { fontSize: 14, color: '#95A5A6' },
  deleteBtn: { padding: 16 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    flexDirection: 'row',
    gap: 12,
  },
  bottomBarMergeMode: { justifyContent: 'space-between', alignItems: 'stretch' },
  bottomBarCleanWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomBarMergeActions: { flexDirection: 'row', gap: 12, flex: 1, justifyContent: 'flex-end' },
  bottomBarCleanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 220,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E67E22',
  },
  bottomBarCleanButtonText: { fontSize: 16, fontWeight: '600', color: '#E67E22' },
  bottomBarAddButton: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    ...(Platform.OS === 'android' ? { elevation: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' } : { elevation: 4 }),
  },
  bottomBarAddButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  bottomBarMergeButton: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    ...(Platform.OS === 'android' ? { elevation: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' } : { elevation: 4 }),
  },
  bottomBarMergeButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  bottomBarCancelButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    ...(Platform.OS === 'android' ? { elevation: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' } : { elevation: 3 }),
  },
  bottomBarCancelButtonText: { fontSize: 16, color: '#636E72', fontWeight: '600' },
  bottomBarConfirmButton: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'android' ? { elevation: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' } : { elevation: 4 }),
  },
  bottomBarConfirmButtonText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  bottomBarDeleteButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E74C3C',
  },
  bottomBarDeleteButtonText: { fontSize: 16, color: '#E74C3C', fontWeight: '600' },
  actionModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  actionModalContentContainer: { width: '100%', maxWidth: 400, maxHeight: '80%', alignItems: 'center' },
  actionModalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  actionModalHeader: { alignItems: 'center', alignSelf: 'stretch', marginBottom: 20, paddingTop: 4 },
  actionModalHeaderIconWrap: { marginBottom: 8 },
  actionModalTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginTop: 8, marginBottom: 4, textAlign: 'center' },
  actionModalSubtitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },
  actionModalList: { width: '100%', minHeight: 180, maxHeight: 360, marginTop: 8, marginBottom: 20 },
  actionModalRow: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#E9ECEF' },
  actionModalRowTappable: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#E9ECEF' },
  actionModalRowSelected: { backgroundColor: '#E8F4FD', borderLeftWidth: 3, borderLeftColor: '#6C5CE7' },
  actionModalRowText: { fontSize: 16, color: '#2D3436', flex: 1 },
  actionModalButtons: { flexDirection: 'row', width: '100%', gap: 12, justifyContent: 'flex-end' },
  actionModalButton: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  actionModalButtonSecondary: { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E9ECEF' },
  actionModalButtonSecondaryText: { fontSize: 16, fontWeight: '600', color: '#636E72' },
  actionModalButtonPrimary: { backgroundColor: '#6C5CE7' },
  actionModalButtonPrimaryText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  actionModalButtonWarning: { backgroundColor: '#FFF5F0', borderWidth: 1, borderColor: '#E67E22' },
  actionModalButtonWarningText: { fontSize: 16, fontWeight: '600', color: '#E67E22' },
  actionModalButtonDanger: { backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#E74C3C' },
  actionModalButtonDangerText: { fontSize: 16, fontWeight: '600', color: '#E74C3C' },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#6C5CE7', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#2D3436', marginBottom: 20 },
  input: { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#2D3436', marginBottom: 12, borderWidth: 1, borderColor: '#E9ECEF' },
  modalButtons: { flexDirection: 'row', marginTop: 8, gap: 12 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#E9ECEF' },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#636E72' },
  saveBtn: { backgroundColor: '#6C5CE7' },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
