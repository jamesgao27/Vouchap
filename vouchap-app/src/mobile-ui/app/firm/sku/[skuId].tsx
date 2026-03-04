/**
 * Firm — SKU 配置页
 *
 * 双 Tab 架构（与 project/[projectId]/index.tsx 对齐）：
 *   WBS  tab  — SkuItemsTreeView（与 TaxFilingTodosView 相同视觉）
 *   Info tab  — Hero card + Classification card（与 info.tsx 完全相同样式）
 *
 * Op row：
 *   WBS 激活  → "Add phase" 按钮
 *   Info 激活 → "Edit" 图标  /  editing 时显示 "Cancel" + "Save"
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
  TouchableOpacity, TextInput, Alert, Platform, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  getSkuById, getSkuItems, updateFirmSku,
  createSkuItem, updateSkuItem, deleteSkuItem, updateSkuItemDependsOn,
} from '@/lib/firm';
import type { FirmSku, FirmSkuItem } from '@/types';
import { uploadFirmSkuImage } from '@/lib/supabase';
import { showToast } from '@/lib/toast';
import { SkuItemsTreeView } from '@/components/SkuItemsTreeView';

// ─────────────────────────────────────────
// 常量（与 info.tsx 保持一致）
// ─────────────────────────────────────────
const TAX_COUNTRY_OPTIONS = [
  { value: '', label: '—' },
  { value: 'CANADA', label: 'Canada' },
  { value: 'USA', label: 'USA' },
];
const TAX_SCENARIO_OPTIONS = [
  { value: '', label: '—' },
  { value: 'T1', label: 'T1' },
  { value: 'T2', label: 'T2' },
  { value: '1040', label: '1040' },
  { value: '1120-S', label: '1120-S' },
];

// tag 调色板（与 info.tsx 一致）
const TAG_PALETTE: [string, string][] = [
  ['#EDE9FD', '#6C5CE7'],
  ['#E3F2FD', '#1E88E5'],
  ['#E8F5E9', '#27AE60'],
  ['#FFF3E0', '#E67E22'],
  ['#FCE4EC', '#E91E63'],
  ['#E8EAF6', '#3F51B5'],
  ['#E0F7FA', '#00838F'],
  ['#FFF8E1', '#F9A825'],
];
function getTagColor(s: string): [string, string] {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xfffff;
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length]!;
}

const COVER_H = 88;

// ─────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────
export default function FirmSkuDetailScreen() {
  const { skuId } = useLocalSearchParams<{ skuId: string }>();
  const router = useRouter();

  // ── 数据状态 ──
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [sku, setSku]           = useState<FirmSku | null>(null);
  const [items, setItems]       = useState<FirmSkuItem[]>([]);

  // ── Tab / Edit ──
  const [activeTab, setActiveTab]   = useState<'wbs' | 'info'>('wbs');
  const [infoEditing, setInfoEditing] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [uploading, setUploading]   = useState(false);

  // ── Info 编辑草稿 ──
  const [editName, setEditName]             = useState('');
  const [editDesc, setEditDesc]             = useState('');
  const [editImageUrl, setEditImageUrl]     = useState<string | null>(null);
  const [editTaxCountry, setEditTaxCountry] = useState('');
  const [editTaxScenario, setEditTaxScenario] = useState('');
  const [editPublished, setEditPublished]   = useState(false);

  // ─────────────── load ───────────────
  const load = useCallback(async () => {
    if (!skuId) { setError('Missing SKU ID'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [skuData, itemsData] = await Promise.all([getSkuById(skuId), getSkuItems(skuId)]);
      if (!skuData) { setError('SKU not found'); setLoading(false); return; }
      setSku(skuData);
      setItems(itemsData);
      resetDraft(skuData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [skuId]);

  function resetDraft(data: FirmSku) {
    setEditName(data.name ?? '');
    setEditDesc(data.description ?? '');
    setEditImageUrl(data.imageUrl ?? null);
    setEditTaxCountry(data.taxCountry ?? '');
    setEditTaxScenario(data.taxScenario ?? '');
    setEditPublished(data.isPublished ?? false);
  }

  useEffect(() => { load(); }, [load]);

  // ─────────────── Info: save ───────────────
  const handleSaveInfo = useCallback(async () => {
    if (!skuId) return;
    setSaving(true);
    const { error: err } = await updateFirmSku(skuId, {
      name: editName.trim() || sku?.name,
      description: editDesc.trim() || null,
      imageUrl: editImageUrl,
      taxCountry: editTaxCountry || null,
      taxScenario: editTaxScenario || null,
      isPublished: editPublished,
    });
    setSaving(false);
    if (err) { showToast('Failed to save', 'error'); return; }
    showToast('Saved', 'success');
    setInfoEditing(false);
    await load();
  }, [skuId, editName, editDesc, editImageUrl, editTaxCountry, editTaxScenario, editPublished, sku?.name, load]);

  const handleCancelEdit = useCallback(() => {
    if (sku) resetDraft(sku);
    setInfoEditing(false);
  }, [sku]);

  // ─────────────── Info: cover ───────────────
  const handlePickImage = useCallback(async () => {
    if (!infoEditing) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showToast('Need photo library access', 'info'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0] || !skuId) return;
    setUploading(true);
    try {
      const url = await uploadFirmSkuImage(result.assets[0].uri, skuId);
      const { error: err } = await updateFirmSku(skuId, { imageUrl: url });
      if (err) throw err;
      setEditImageUrl(url);
      showToast('Cover updated', 'success');
    } catch {
      showToast('Failed to upload cover', 'error');
    } finally {
      setUploading(false);
    }
  }, [skuId, infoEditing]);

  // ─────────────── WBS: dependency ───────────────
  const handleSetDependsOn = useCallback(async (itemId: string, dependsOnId: string | null) => {
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, dependsOnId } : it));
    const { error: err } = await updateSkuItemDependsOn(itemId, dependsOnId);
    if (err) { showToast('Failed to update dependency', 'error'); await load(); }
  }, [load]);

  // ─────────────── guards ───────────────
  if (loading) return <View style={s.centered}><ActivityIndicator size="large" color="#6C5CE7" /></View>;
  if (error || !sku) {
    return (
      <View style={s.centered}>
        <Text style={s.errorText}>{error ?? 'Not found'}</Text>
        <TouchableOpacity style={s.backBtnFull} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#6C5CE7" />
          <Text style={s.backBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────
  const displayName = infoEditing ? editName : (sku.name ?? '—');

  // 右侧 op row context area
  const opContextArea = activeTab === 'wbs' ? (
    <TouchableOpacity
      style={s.addPhaseBtn}
      onPress={async () => {
        const { error: err } = await createSkuItem({
          skuId: skuId!,
          parentId: null,
          itemKind: 'phase',
          type: 'client',
          title: 'New phase',
        });
        if (err) { showToast('Failed to add phase', 'error'); return; }
        await load();
      }}
      activeOpacity={0.7}
    >
      <Ionicons name="add" size={16} color="#6C5CE7" />
      <Text style={s.addPhaseBtnText}>Add phase</Text>
    </TouchableOpacity>
  ) : infoEditing ? (
    <View style={s.editActions}>
      <TouchableOpacity style={s.cancelBtn} onPress={handleCancelEdit} activeOpacity={0.7}>
        <Text style={s.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.saveBtn, saving && s.saveBtnDisabled]}
        onPress={handleSaveInfo}
        disabled={saving}
        activeOpacity={0.8}
      >
        {saving
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={s.saveBtnText}>Save</Text>}
      </TouchableOpacity>
    </View>
  ) : (
    <TouchableOpacity style={s.editIconBtn} onPress={() => setInfoEditing(true)} activeOpacity={0.7}>
      <Ionicons name="pencil-outline" size={18} color="#6C5CE7" />
    </TouchableOpacity>
  );

  // ─────────────────────────────────────────
  // Info Tab Content
  // ─────────────────────────────────────────
  const infoContent = (
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

      {/* ══ Card 1 — Hero ══ */}
      <View style={s.card}>
        <View style={s.heroRow}>
          {/* 封面 */}
          <TouchableOpacity
            style={s.coverWrap}
            onPress={handlePickImage}
            activeOpacity={infoEditing ? 0.8 : 1}
            disabled={!infoEditing}
          >
            {editImageUrl
              ? <Image source={{ uri: editImageUrl }} style={s.coverImg} resizeMode="cover" />
              : <View style={s.coverPlaceholder}>
                  {uploading
                    ? <ActivityIndicator size="small" color="#6C5CE7" />
                    : <Ionicons name="image-outline" size={30} color="#BDC3C7" />}
                </View>}
            {infoEditing && !uploading && (
              <View style={s.coverOverlay as any}>
                <Ionicons name="camera" size={20} color="#fff" />
              </View>
            )}
            {uploading && (
              <View style={s.coverOverlay as any}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {/* 名称 + 描述 */}
          <View style={s.heroMeta}>
            {infoEditing
              ? <TextInput
                  style={s.nameInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Service name"
                  placeholderTextColor="#B2BEC3"
                />
              : <Text style={s.nameText} numberOfLines={3}>{sku.name ?? '—'}</Text>}

            {infoEditing
              ? <TextInput
                  style={s.descInput}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder="Brief description…"
                  placeholderTextColor="#B2BEC3"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              : sku.description
                  ? <Text style={s.descText} numberOfLines={5}>{sku.description}</Text>
                  : <Text style={s.descEmpty}>No description</Text>}
          </View>
        </View>
      </View>

      {/* ══ Card 2 — Classification ══ */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Classification</Text>

        {/* Jurisdiction */}
        <View style={s.cfRow}>
          <View style={s.cfTagCol}><Text style={s.cfLabel}>Jurisdiction</Text></View>
          <View style={s.cfValueCol}>
            {infoEditing ? (
              <View style={s.optionRow}>
                {TAX_COUNTRY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value || '_c'}
                    style={[s.optChip, editTaxCountry === opt.value && s.optChipActive]}
                    onPress={() => setEditTaxCountry(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.optChipText, editTaxCountry === opt.value && s.optChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : sku.taxCountry ? (() => {
              const [bg, fg] = getTagColor(sku.taxCountry);
              return <View style={[s.valueTagPill, { backgroundColor: bg }]}><Text style={[s.valueTagText, { color: fg }]}>{sku.taxCountry}</Text></View>;
            })() : <Text style={s.cfEmptyTag}>—</Text>}
          </View>
        </View>

        <View style={s.divider} />

        {/* Scenario */}
        <View style={s.cfRow}>
          <View style={s.cfTagCol}><Text style={s.cfLabel}>Scenario</Text></View>
          <View style={s.cfValueCol}>
            {infoEditing ? (
              <View style={s.optionRow}>
                {TAX_SCENARIO_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value || '_s'}
                    style={[s.optChip, editTaxScenario === opt.value && s.optChipActive]}
                    onPress={() => setEditTaxScenario(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.optChipText, editTaxScenario === opt.value && s.optChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : sku.taxScenario ? (() => {
              const [bg, fg] = getTagColor(sku.taxScenario);
              return <View style={[s.valueTagPill, { backgroundColor: bg }]}><Text style={[s.valueTagText, { color: fg }]}>{sku.taxScenario}</Text></View>;
            })() : <Text style={s.cfEmptyTag}>—</Text>}
          </View>
        </View>

        <View style={s.divider} />

        {/* Published */}
        <View style={s.cfRow}>
          <View style={s.cfTagCol}><Text style={s.cfLabel}>Status</Text></View>
          <View style={s.cfValueCol}>
            {infoEditing ? (
              <TouchableOpacity
                style={[s.publishedToggle, editPublished && s.publishedToggleActive]}
                onPress={() => setEditPublished((v) => !v)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={editPublished ? 'eye-outline' : 'eye-off-outline'}
                  size={13}
                  color={editPublished ? '#fff' : '#636E72'}
                />
                <Text style={[s.publishedToggleText, editPublished && s.publishedToggleTextActive]}>
                  {editPublished ? 'Published' : 'Draft'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[s.valueTagPill, { backgroundColor: sku.isPublished ? '#E8F5E9' : '#F0F2F5' }]}>
                <Text style={[s.valueTagText, { color: sku.isPublished ? '#27AE60' : '#636E72' }]}>
                  {sku.isPublished ? 'Published' : 'Draft'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

    </ScrollView>
  );

  // ─────────────────────────────────────────
  // Full Render
  // ─────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* ── 顶行 ── */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7} style={s.backIcon}>
          <Ionicons name="arrow-back" size={22} color="#2D3436" />
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>{displayName}</Text>
        <TouchableOpacity
          style={s.tabToggleIcon}
          onPress={() => setActiveTab((t) => t === 'wbs' ? 'info' : 'wbs')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'info' ? 'list-outline' : 'information-circle-outline'}
            size={22}
            color={activeTab === 'info' ? '#6C5CE7' : '#636E72'}
          />
        </TouchableOpacity>
      </View>

      {/* ── Op row（tab chips + 上下文操作）── */}
      <View style={s.opRow}>
        <View style={s.tabChips}>
          <TouchableOpacity
            style={[s.tabChip, activeTab === 'wbs' && s.tabChipActive]}
            onPress={() => setActiveTab('wbs')}
            activeOpacity={0.7}
          >
            <Text style={[s.tabChipText, activeTab === 'wbs' && s.tabChipTextActive]}>WBS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabChip, activeTab === 'info' && s.tabChipActive]}
            onPress={() => setActiveTab('info')}
            activeOpacity={0.7}
          >
            <Text style={[s.tabChipText, activeTab === 'info' && s.tabChipTextActive]}>Info</Text>
          </TouchableOpacity>
        </View>
        {opContextArea}
      </View>

      {/* ── Content ── */}
      {activeTab === 'wbs' ? (
        <SkuItemsTreeView
          items={items}
          onEditTitle={async (id, title) => {
            setItems((prev) => prev.map((it) => it.id === id ? { ...it, title } : it));
            const it = items.find((x) => x.id === id);
            await updateSkuItem(id, { title, description: it?.description, itemKind: it?.itemKind });
          }}
          onEditKind={async (id, kind) => {
            setItems((prev) => prev.map((it) => it.id === id ? { ...it, itemKind: kind } : it));
            const it = items.find((x) => x.id === id);
            if (it) await updateSkuItem(id, { title: it.title, description: it.description, itemKind: kind });
          }}
          onEditType={async (id, type) => {
            setItems((prev) => prev.map((it) => it.id === id ? { ...it, type } : it));
            await updateSkuItem(id, { type });
          }}
          onSetDependsOn={handleSetDependsOn}
          onDelete={async (id) => {
            const deleteAction = async () => {
              const { error: err } = await deleteSkuItem(id);
              if (err) { showToast('Failed to delete', 'error'); return; }
              await load();
            };
            if (Platform.OS === 'web') {
              if (!window.confirm('Delete this item? Child items will also be removed.')) return;
              await deleteAction();
            } else {
              Alert.alert('Delete item', 'Child items will also be removed.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: deleteAction },
              ]);
            }
          }}
          onAddChild={async (parentId, title, kind) => {
            const { error: err } = await createSkuItem({ skuId: skuId!, parentId, itemKind: kind, type: 'client', title });
            if (err) { showToast('Failed to add item', 'error'); return; }
            await load();
          }}
          onAddRoot={async (title) => {
            const { error: err } = await createSkuItem({ skuId: skuId!, parentId: null, itemKind: 'phase', type: 'client', title });
            if (err) { showToast('Failed to add phase', 'error'); return; }
            await load();
          }}
        />
      ) : infoContent}

    </View>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 15, color: '#636E72', marginBottom: 16 },

  // ── 顶行 ──
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9ECEF',
    gap: 8,
  },
  backIcon:     { padding: 4 },
  topTitle:     { flex: 1, fontSize: 16, fontWeight: '700', color: '#2D3436', minWidth: 0 },
  tabToggleIcon: { padding: 4 },

  // ── Op row ──
  opRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9ECEF',
    gap: 10,
  },
  tabChips: { flexDirection: 'row', gap: 6 },
  tabChip: {
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
    borderColor: '#DFE6E9', backgroundColor: '#F8F9FA',
  },
  tabChipActive: { borderColor: '#6C5CE7', backgroundColor: '#EDE9FD' },
  tabChipText: { fontSize: 13, fontWeight: '600', color: '#636E72' },
  tabChipTextActive: { color: '#6C5CE7' },

  // ── Op context ──
  addPhaseBtn: {
    marginLeft: 'auto' as any,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, backgroundColor: '#EDE9FD',
  },
  addPhaseBtnText: { fontSize: 12, fontWeight: '600', color: '#6C5CE7' },
  editIconBtn: { marginLeft: 'auto' as any, padding: 4 },
  editActions: { marginLeft: 'auto' as any, flexDirection: 'row', gap: 8 },
  cancelBtn:   { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#F0F2F5' },
  cancelBtnText: { fontSize: 13, fontWeight: '500', color: '#636E72' },
  saveBtn:      { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: '#6C5CE7' },
  saveBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
  saveBtnDisabled: { opacity: 0.5 },

  backBtnFull:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  backBtnText:  { fontSize: 16, color: '#6C5CE7', fontWeight: '500' },

  // ── Info scroll ──
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48, gap: 12 },

  // ── 通用卡片（与 info.tsx 完全对齐）──
  card: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  cardTitle: {
    fontSize: 11, fontWeight: '700', color: '#95A5A6',
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10,
  },

  // ── Card 1: Hero ──
  heroRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 8 },
  coverWrap: {
    width: COVER_H, height: COVER_H,
    borderRadius: 10, backgroundColor: '#E9ECEF',
    overflow: 'hidden', flexShrink: 0,
  },
  coverImg: { width: COVER_H, height: COVER_H },
  coverPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroMeta: { flex: 1, gap: 6, paddingTop: 2 },
  nameText:  { fontSize: 17, fontWeight: '700', color: '#2D3436', lineHeight: 23 },
  nameInput: {
    fontSize: 16, fontWeight: '600', color: '#2D3436',
    borderWidth: 1, borderColor: '#6C5CE7', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: '#fff', lineHeight: 22,
  },
  descText:  { fontSize: 13, color: '#636E72', lineHeight: 19 },
  descEmpty: { fontSize: 13, color: '#B2BEC3', fontStyle: 'italic' },
  descInput: {
    fontSize: 13, color: '#2D3436',
    borderWidth: 1, borderColor: '#6C5CE7', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: '#fff', minHeight: 60, lineHeight: 19,
  },

  // ── Card 2: Classification（与 info.tsx 完全一致）──
  cfRow: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: 44, paddingHorizontal: 4, gap: 16,
  },
  cfTagCol: { width: 90, alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
  cfLabel:  { fontSize: 13, fontWeight: '500', color: '#636E72' },
  cfEmptyTag: { fontSize: 13, color: '#B2BEC3' },
  cfValueCol: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E9ECEF' },

  valueTagPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  valueTagText: { fontSize: 12, fontWeight: '600' },

  optionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  optChip: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20,
    borderWidth: 1, borderColor: '#DFE6E9', backgroundColor: '#F8F9FA',
  },
  optChipActive: { borderColor: '#6C5CE7', backgroundColor: '#EDE9FD' },
  optChipText: { fontSize: 12, color: '#636E72', fontWeight: '500' },
  optChipTextActive: { color: '#6C5CE7', fontWeight: '700' },

  publishedToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    backgroundColor: '#F0F2F5',
  },
  publishedToggleActive: { backgroundColor: '#00B894' },
  publishedToggleText: { fontSize: 12, fontWeight: '600', color: '#636E72' },
  publishedToggleTextActive: { color: '#fff' },
});
