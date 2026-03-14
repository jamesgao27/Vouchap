/**
 * ProjectInfoTab — 可嵌入 index.tsx 的项目信息面板（无导航头操作）。
 * 默认导出的 ProjectInfoScreen 保留作独立路由兜底（向后兼容），
 * 实际交互入口已迁移至 index.tsx 的页签系统。
 *
 * 布局：
 *   Card 1 — Hero：放大封面（176px）+ 名称 + 描述
 *   Card 2 — Classification：税季 / 国别 / 场景 / 自定义标签
 *   Card 3 — Firm & Order：事务所信息 + 订单主要字段
 *
 * 编辑态设计原则（参考 receipt-details）：
 *   各字段原地转为 TextInput / 选项组，布局不跳动。
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  getOrderById,
  getProjectById,
  getSpaceProjectTags,
  updateProject,
  type FirmProjectInfo,
} from '@/lib/firm';
import { supabase, uploadProjectCover } from '@/lib/supabase';
import { showToast } from '@/lib/toast';

// ── Stage display configs（4 态，与 firm.orders.status 一致） ──
const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  onboarding: { label: 'Onboarding', color: '#6C5CE7', bg: '#EDE9FD' },
  processing: { label: 'Processing', color: '#0288D1', bg: '#E1F5FE' },
  completed:  { label: 'Completed',  color: '#00875A', bg: '#E3FCEF' },
  cancelled:  { label: 'Cancelled',  color: '#636E72', bg: '#F0F2F5' },
};

// ── Tax season 颜色（与 index.tsx headerStyles 保持一致） ──
const TAX_SEASON_COLORS = [
  '#6C5CE7', '#E17055', '#00B894', '#0984E3', '#FDCB6E',
  '#E84393', '#00CEC9', '#74B9FF', '#A29BFE', '#FD79A8',
];
function getTaxSeasonColor(year: number): string {
  return TAX_SEASON_COLORS[Math.abs(year) % 10] ?? TAX_SEASON_COLORS[0];
}

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

const COVER_SIZE = 176;

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const TAG_PALETTE: [string, string][] = [
  ['#EDE9FD', '#6C5CE7'],  // violet
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

// ─────────────────────────────────────────────────────────────────────────────
// ProjectInfoTab  —  嵌入式项目信息面板
// ─────────────────────────────────────────────────────────────────────────────
export interface ProjectInfoTabHandle {
  /** 由外部（index.tsx 操作行按钮）触发进入编辑态 */
  startEditing: () => void;
  /** 由外部触发取消编辑，恢复原值 */
  cancelEditing: () => void;
  /** 由外部触发保存编辑，返回是否保存成功 */
  saveEditing: () => Promise<boolean>;
}

export const ProjectInfoTab = forwardRef<ProjectInfoTabHandle, { projectId: string; mode?: 'client' | 'firm' }>(
function ProjectInfoTabInner({ projectId, mode = 'client' }, ref) {
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [order, setOrder]               = useState<Awaited<ReturnType<typeof getOrderById>>>(null);
  const [project, setProject]           = useState<FirmProjectInfo | null>(null);
  const [firmName, setFirmName]         = useState('');
  const [firmDesc, setFirmDesc]         = useState('');
  const [editing, setEditing]           = useState(false);

  // edit state
  const [editName, setEditName]               = useState('');
  const [editDesc, setEditDesc]               = useState('');
  const [editImageUrl, setEditImageUrl]       = useState<string | null>(null);
  const [editTaxCountry, setEditTaxCountry]   = useState('');
  const [editTaxScenario, setEditTaxScenario] = useState('');
  const [editTags, setEditTags]               = useState<string[]>([]);
  const [tagInput, setTagInput]               = useState('');
  const [allSpaceTags, setAllSpaceTags]       = useState<string[]>([]);
  const [uploadingCover, setUploadingCover]   = useState(false);
  const [editTaxSeasonYear, setEditTaxSeasonYear] = useState<string>('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const projectData = await getProjectById(projectId);
      if (!projectData) { setError('Project not found'); return; }
      setProject(projectData);

      const orderData = await getOrderById(projectData.orderId);
      if (!orderData) { setError('Order not found'); return; }
      setOrder(orderData);

      setEditName(projectData.name ?? '');
      setEditDesc(projectData.description ?? '');
      setEditImageUrl(projectData.imageUrl ?? null);
      setEditTaxCountry(projectData.taxCountry ?? '');
      setEditTaxScenario(projectData.taxScenario ?? '');
      setEditTags(projectData.tags ?? []);

      // 税季：默认使用项目已保存的 taxSeasonYear；若为空则回退到订单的 dueAt/createdAt 推断
      const derivedYear =
        orderData.dueAt || orderData.createdAt
          ? new Date((orderData.dueAt || orderData.createdAt)!).getFullYear()
          : null;
      const initialYear =
        projectData.taxSeasonYear != null ? projectData.taxSeasonYear : derivedYear;
      setEditTaxSeasonYear(initialYear != null ? String(initialYear) : '');

      if (orderData.clientSpaceId) {
        getSpaceProjectTags(orderData.clientSpaceId).then(setAllSpaceTags);
      }

      // firm 模式：显示 client 空间名；client 模式：显示 firm 空间名
      const spaceIdToFetch = mode === 'firm' ? orderData.clientSpaceId : orderData.firmSpaceId;
      if (spaceIdToFetch) {
        const { data: space } = await supabase
          .from('spaces')
          .select('name')
          .eq('id', spaceIdToFetch)
          .maybeSingle();
        setFirmName((space as any)?.name ?? '');
        setFirmDesc('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handlePickImage = useCallback(async () => {
    if (!editing || uploadingCover) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { showToast('Need photo library access', 'info'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      if (!project?.id) return;
      setUploadingCover(true);
      const imageUrl = await uploadProjectCover(result.assets[0].uri, project.id, order?.clientSpaceId ?? '');
      const { error: saveErr } = await updateProject(project.id, { imageUrl });
      if (saveErr) throw saveErr;
      setEditImageUrl(imageUrl);
      showToast('Cover updated', 'success');
    } catch {
      showToast('Failed to update cover', 'error');
    } finally {
      setUploadingCover(false);
    }
  }, [editing, uploadingCover, project?.id, order?.clientSpaceId]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!project?.id) return false;
    setSaving(true);
    try {
      const { error: err } = await updateProject(project.id, {
        name: editName.trim() || project.name,
        description: editDesc.trim() || null,
        imageUrl: editImageUrl ?? undefined,
        taxCountry: editTaxCountry.trim() || null,
        taxScenario: editTaxScenario.trim() || null,
        tags: editTags.length > 0 ? editTags : null,
        taxSeasonYear: (() => {
          const y = parseInt(editTaxSeasonYear.trim(), 10);
          return Number.isFinite(y) ? y : null;
        })(),
      });
      if (err) throw err;
      setEditing(false);
      showToast('Saved', 'success');
      load();
      return true;
    } catch {
      showToast('Failed to save', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [project?.id, editName, editDesc, editImageUrl, editTaxCountry, editTaxScenario, editTags, editTaxSeasonYear, load]);

  const handleCancelEdit = useCallback(() => {
    if (!project) return;
    setEditName(project.name ?? '');
    setEditDesc(project.description ?? '');
    setEditImageUrl(project.imageUrl ?? null);
    setEditTaxCountry(project.taxCountry ?? '');
    setEditTaxScenario(project.taxScenario ?? '');
    setEditTags(project.tags ?? []);
    setTagInput('');
    setEditing(false);
  }, [project]);

  // useImperativeHandle 放在 handleSave / handleCancelEdit 定义之后，避免暂时性死区
  useImperativeHandle(
    ref,
    () => ({
      startEditing: () => setEditing(true),
      cancelEditing: () => handleCancelEdit(),
      saveEditing: () => handleSave(),
    }),
    [handleCancelEdit, handleSave]
  );

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !editTags.includes(t)) { setEditTags((p) => [...p, t]); setTagInput(''); }
  };
  const removeTag = (t: string) => setEditTags((p) => p.filter((x) => x !== t));

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }
  if (error || !order || !project) {
    return (
      <View style={s.centered}>
        <Ionicons name="alert-circle-outline" size={36} color="#B2BEC3" style={{ marginBottom: 10 }} />
        <Text style={s.errorText}>{error ?? 'Project not found'}</Text>
      </View>
    );
  }

  const derivedTaxSeasonYear = order.dueAt || order.createdAt
    ? new Date((order.dueAt || order.createdAt)!).getFullYear()
    : null;
  const taxSeasonYear =
    project.taxSeasonYear != null ? project.taxSeasonYear : derivedTaxSeasonYear;
  const stageConfig = STAGE_CONFIG[order.status] ?? STAGE_CONFIG.onboarding;
  const displayImageUrl = editing ? editImageUrl : project.imageUrl;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

      {/* ══════════════════════════════════════════════
          Card 1 — Hero：封面 + 名称 + 描述
      ══════════════════════════════════════════════ */}
      <View style={s.card}>
        {/* 顶行：封面 + 右侧信息 */}
        <View style={s.heroRow}>
          {/* 封面 */}
          <TouchableOpacity
            style={s.coverWrap}
            onPress={handlePickImage}
            activeOpacity={editing ? 0.8 : 1}
            disabled={!editing || uploadingCover}
          >
            {displayImageUrl
              ? <Image source={{ uri: displayImageUrl }} style={s.coverImg} resizeMode="cover" />
              : <View style={s.coverPlaceholder}>
                  {uploadingCover
                    ? <ActivityIndicator size="small" color="#6C5CE7" />
                    : <Ionicons name="image-outline" size={44} color="#BDC3C7" />}
                </View>}
            {editing && !uploadingCover && (
              <View style={s.coverOverlay as any}>
                <Ionicons name="camera" size={22} color="#fff" />
              </View>
            )}
            {uploadingCover && (
              <View style={s.coverOverlay as any}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {/* 名称 + 描述 + 编辑按钮 */}
          <View style={s.heroMeta}>
            {/* 名称 */}
            {editing
              ? <TextInput
                  style={s.nameInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Project name"
                  placeholderTextColor="#B2BEC3"
                  multiline={false}
                />
              : <Text style={s.nameText} numberOfLines={3}>{project.name ?? '—'}</Text>}

            {/* 描述 */}
            {editing
              ? <TextInput
                  style={s.descInput}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder="Add a description…"
                  placeholderTextColor="#B2BEC3"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              : (project.description
                  ? <Text style={s.descText} numberOfLines={5}>{project.description}</Text>
                  : <Text style={s.descEmpty}>No description</Text>)}
          </View>
        </View>

      </View>

      {/* ══════════════════════════════════════════════
          Card 2 — Classification：税季 / 国别 / 场景 / 标签
          布局：左列为提示文字（右对齐），右列为实际标签（左对齐）
      ══════════════════════════════════════════════ */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Classification</Text>

        {/* Tax season — 彩色 pill；编辑态支持选择/自定义年份 */}
        <View style={s.cfRow}>
          <View style={s.cfTagCol}>
            <Text style={s.cfLabel}>Tax season</Text>
          </View>
          <View style={s.cfValueCol}>
            {editing ? (
              <View style={[s.optionRow, { alignItems: 'flex-start' }]}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {(() => {
                    const base = derivedTaxSeasonYear ?? new Date().getFullYear();
                    const candidates = Array.from(new Set([base - 1, base, base + 1]));
                    return candidates.map((y) => (
                      <TouchableOpacity
                        key={y}
                        style={[
                          s.optChip,
                          String(y) === editTaxSeasonYear.trim() && s.optChipActive,
                        ]}
                        onPress={() => setEditTaxSeasonYear(String(y))}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            s.optChipText,
                            String(y) === editTaxSeasonYear.trim() && s.optChipTextActive,
                          ]}
                        >
                          {y}
                        </Text>
                      </TouchableOpacity>
                    ));
                  })()}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[s.cfLabel, { marginRight: 4 }]}>Custom</Text>
                  <TextInput
                    style={[s.tagsInput, { flex: 0, minWidth: 80, maxWidth: 100 }]}
                    value={editTaxSeasonYear}
                    onChangeText={setEditTaxSeasonYear}
                    placeholder="YYYY"
                    placeholderTextColor="#B2BEC3"
                    keyboardType="numeric"
                    maxLength={4}
                  />
                </View>
              </View>
            ) : taxSeasonYear != null ? (
              <View
                style={[
                  s.taxSeasonPill,
                  { backgroundColor: getTaxSeasonColor(taxSeasonYear) },
                ]}
              >
                <Text style={s.taxSeasonPillText}>{taxSeasonYear}</Text>
              </View>
            ) : (
              <Text style={s.cfEmptyTag}>—</Text>
            )}
          </View>
        </View>

        <View style={s.divider} />

        {/* Tax jurisdiction */}
        <View style={s.cfRow}>
          <View style={s.cfTagCol}>
            <Text style={s.cfLabel}>Jurisdiction</Text>
          </View>
          <View style={s.cfValueCol}>
            {editing
              ? (
                <View style={s.optionRow}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[s.cfLabel, { marginRight: 4 }]}>Custom</Text>
                    <TextInput
                      style={[s.tagsInput, { flex: 1, maxWidth: 220 }]}
                      value={editTaxCountry}
                      onChangeText={setEditTaxCountry}
                      placeholder="Enter jurisdiction…"
                      placeholderTextColor="#B2BEC3"
                    />
                  </View>
                </View>
              )
              : project.taxCountry
                  ? (() => { const [bg, fg] = getTagColor(project.taxCountry); return <View style={[s.valueTagPill, { backgroundColor: bg }]}><Text style={[s.valueTagText, { color: fg }]}>{project.taxCountry}</Text></View>; })()
                  : <Text style={s.cfEmptyTag}>—</Text>}
          </View>
        </View>

        <View style={s.divider} />

        {/* Tax scenario */}
        <View style={s.cfRow}>
          <View style={s.cfTagCol}>
            <Text style={s.cfLabel}>Scenario</Text>
          </View>
          <View style={s.cfValueCol}>
            {editing
              ? (
                <View style={s.optionRow}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[s.cfLabel, { marginRight: 4 }]}>Custom</Text>
                    <TextInput
                      style={[s.tagsInput, { flex: 1, maxWidth: 220 }]}
                      value={editTaxScenario}
                      onChangeText={setEditTaxScenario}
                      placeholder="Enter scenario…"
                      placeholderTextColor="#B2BEC3"
                    />
                  </View>
                </View>
              )
              : project.taxScenario
                  ? (() => { const [bg, fg] = getTagColor(project.taxScenario); return <View style={[s.valueTagPill, { backgroundColor: bg }]}><Text style={[s.valueTagText, { color: fg }]}>{project.taxScenario}</Text></View>; })()
                  : <Text style={s.cfEmptyTag}>—</Text>}
          </View>
        </View>

        <View style={s.divider} />

        {/* Tags — 编辑态内联，行高与阅读态一致 */}
        <View style={editing ? [s.cfRow, { alignItems: 'flex-start', paddingTop: 12, paddingBottom: 4 }] : s.cfRow}>
          <View style={s.cfTagCol}>
            <Text style={s.cfLabel}>Tags</Text>
          </View>
          <View style={[s.cfValueCol, { gap: 8 }]}>
            {editing ? (
              <>
                {/* 已选标签 + 内联输入框 */}
                <View style={s.tagsRow}>
                  {editTags.map((t) => (
                    <View key={t} style={s.tagEditPill}>
                      <Text style={s.tagEditPillText}>{t}</Text>
                      <TouchableOpacity onPress={() => removeTag(t)} hitSlop={6} activeOpacity={0.7}>
                        <Ionicons name="close-circle" size={14} color="#6C5CE7" style={{ marginLeft: 2 }} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {/* 内联输入框，无蓝色边框 */}
                  <View style={s.tagInlineInputWrap}>
                    <TextInput
                      style={s.tagInlineInput}
                      value={tagInput}
                      onChangeText={setTagInput}
                      placeholder="New tag…"
                      placeholderTextColor="#B2BEC3"
                      onSubmitEditing={addTag}
                      returnKeyType="done"
                      blurOnSubmit={false}
                    />
                    {tagInput.trim() ? (
                      <TouchableOpacity onPress={addTag} hitSlop={6} activeOpacity={0.7}>
                        <Ionicons name="return-down-back-outline" size={15} color="#6C5CE7" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
                {/* 空间内已有标签建议（排除已选） */}
                {allSpaceTags.filter((t) => !editTags.includes(t)).length > 0 && (
                  <View style={s.tagsRow}>
                    {allSpaceTags.filter((t) => !editTags.includes(t)).map((t) => {
                      const [bg, fg] = getTagColor(t);
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[s.tagSuggestionPill, { backgroundColor: bg, borderColor: fg + '40' }]}
                          onPress={() => setEditTags((prev) => [...prev, t])}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.tagSuggestionText, { color: fg }]}>+ {t}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            ) : editTags.length > 0 ? (
              <View style={s.tagsRow}>
                {editTags.map((t) => {
                  const [bg, fg] = getTagColor(t);
                  return (
                    <View key={t} style={[s.tagPill, { backgroundColor: bg }]}>
                      <Text style={[s.tagPillText, { color: fg }]}>{t}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={s.cfEmptyTag}>—</Text>
            )}
          </View>
        </View>
      </View>

      {/* ══════════════════════════════════════════════
          Card 3 — Firm & Order
      ══════════════════════════════════════════════ */}
      <View style={s.card}>
        {/* ─── Firm / Client ─── */}
        <Text style={s.cardTitle}>{mode === 'firm' ? 'Client' : 'Firm'}</Text>

        <View style={s.infoRow}>
          <View style={s.infoIconWrap}>
            <Ionicons name="business-outline" size={16} color="#6C5CE7" />
          </View>
          <View style={s.infoBody}>
            <Text style={s.infoLabel}>Name</Text>
            <Text style={s.infoValue} numberOfLines={1}>{firmName || '—'}</Text>
          </View>
        </View>

        {firmDesc ? (
          <View style={[s.infoRow, s.infoRowBorder]}>
            <View style={s.infoIconWrap}>
              <Ionicons name="information-circle-outline" size={16} color="#636E72" />
            </View>
            <View style={s.infoBody}>
              <Text style={s.infoLabel}>About</Text>
              <Text style={s.infoValue} numberOfLines={3}>{firmDesc}</Text>
            </View>
          </View>
        ) : null}

        {/* ─── Order ─── */}
        <Text style={[s.cardTitle, s.cardTitleSecond]}>Order</Text>

        {/* 第一行：No. + Status */}
        <View style={s.tableRow}>
          <View style={s.tableCell}>
            <Text style={s.tableCellLabel}>No.</Text>
            <Text style={s.tableCellMono} numberOfLines={1}>
              {order.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
          <View style={[s.tableCell, s.tableCellBorderLeft]}>
            <Text style={s.tableCellLabel}>Status</Text>
            <View style={[s.stageBadge, { backgroundColor: stageConfig?.bg ?? '#F0F2F5', alignSelf: 'flex-start' }]}>
              <Text style={[s.stageBadgeText, { color: stageConfig?.color ?? '#636E72' }]}>
                {stageConfig?.label ?? order.status}
              </Text>
            </View>
          </View>
        </View>

        {/* 第二行：Created + Last updated */}
        <View style={[s.tableRow, s.tableRowBorder]}>
          <View style={s.tableCell}>
            <Text style={s.tableCellLabel}>Created</Text>
            <Text style={s.tableCellValue}>{formatDate(order.createdAt)}</Text>
          </View>
          <View style={[s.tableCell, s.tableCellBorderLeft]}>
            <Text style={s.tableCellLabel}>Last updated</Text>
            <Text style={s.tableCellValue}>{formatDate(order.updatedAt)}</Text>
          </View>
        </View>
      </View>

    </ScrollView>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Default export — 独立路由兜底（向后兼容，实际入口已迁至 index.tsx 页签）
// ─────────────────────────────────────────────────────────────────────────────
export default function ProjectInfoScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: '#F0F2F5' }}>
      <ProjectInfoTab projectId={projectId ?? ''} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { fontSize: 15, color: '#636E72', textAlign: 'center' },

  // ── 通用卡片 ──
  card: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    position: 'relative',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#95A5A6',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 10,
  },
  cardTitleSecond: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E9ECEF',
  },

  // ── Card 1: Hero ──
  heroRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  coverWrap: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 10,
    backgroundColor: '#E9ECEF',
    overflow: 'hidden',
    flexShrink: 0,
  },
  coverImg: { width: COVER_SIZE, height: COVER_SIZE },
  coverPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroMeta: { flex: 1, gap: 6, paddingTop: 2 },
  nameText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2D3436',
    lineHeight: 23,
  },
  nameInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    borderWidth: 1,
    borderColor: '#6C5CE7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fff',
    lineHeight: 22,
  },
  descText: { fontSize: 13, color: '#636E72', lineHeight: 19 },
  descEmpty: { fontSize: 13, color: '#B2BEC3', fontStyle: 'italic' },
  descInput: {
    fontSize: 13,
    color: '#2D3436',
    borderWidth: 1,
    borderColor: '#6C5CE7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fff',
    minHeight: 72,
    lineHeight: 19,
  },

  // ── Card 2: Classification（左列提示右对齐，右列内容左对齐） ──
  cfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,          // 统一行高基准，编辑/阅读态保持一致
    paddingHorizontal: 4,
    gap: 16,
  },
  // 左侧提示列：固定宽度，文字右对齐
  cfTagCol: {
    width: 90,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cfLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#636E72',
  },
  cfEmptyTag: { fontSize: 13, color: '#B2BEC3' },
  // 右侧内容列：占剩余空间，文字左对齐
  cfValueCol: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',   // 默认 flexDirection:column 时为垂直居中
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E9ECEF' },

  // 税季彩色 pill（与 index.tsx 同款）
  taxSeasonPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  taxSeasonPillText: { fontSize: 12, color: '#FFF', fontWeight: '700' },

  // 其他字段只读 tag（灰底深字）
  valueTagPill: {
    backgroundColor: '#E9ECEF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  valueTagText: { fontSize: 12, fontWeight: '600', color: '#2D3436' },

  optionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  optChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DFE6E9',
    backgroundColor: '#F8F9FA',
  },
  optChipActive: { borderColor: '#6C5CE7', backgroundColor: '#EDE9FD' },
  optChipText: { fontSize: 12, color: '#636E72', fontWeight: '500' },
  optChipTextActive: { color: '#6C5CE7', fontWeight: '700' },

  // Tags 行 — 阅读/编辑态共用同一 flex-wrap 容器，行高由 cfRow minHeight 保证
  // justifyContent: 'flex-start' 覆盖 cfValueCol 的 'center'，确保左端对齐
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  tagPill: {
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  tagPillText: { fontSize: 12, color: '#2D3436', fontWeight: '500' },
  tagEditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FD',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  tagEditPillText: { fontSize: 12, color: '#6C5CE7', fontWeight: '600' },
  // 内联输入框：与标签同一视觉体系的小 pill 套框，避免系统默认蓝色高亮边框
  tagInlineInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DFE6E9',
    backgroundColor: '#F8F9FA',
    gap: 4,
    minWidth: 72,
  },
  tagInlineInput: {
    fontSize: 12,
    color: '#2D3436',
    paddingVertical: 0,
    minWidth: 44,
    maxWidth: 110,
    // React Native Web: 关闭默认的蓝色 outline
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  // 已有标签建议 pill（带浅色彩色背景，点击即选）
  tagSuggestionPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagSuggestionText: { fontSize: 12, fontWeight: '500' },

  // ── Card 3: Firm ──
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    gap: 10,
  },
  infoRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E9ECEF',
  },
  infoIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#EBEBEB',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  infoBody: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 11, fontWeight: '600', color: '#95A5A6', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#2D3436' },
  stageBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  stageBadgeText: { fontSize: 12, fontWeight: '700' },

  // ── Card 3: Order 表格 ──
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
  },
  tableRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E9ECEF',
  },
  tableCell: {
    flex: 1,
    gap: 4,
    paddingRight: 8,
  },
  tableCellBorderLeft: {
    paddingRight: 0,
    paddingLeft: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#E9ECEF',
  },
  tableCellFull: { flex: 1, paddingRight: 0 },
  tableCellLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#95A5A6',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableCellValue: { fontSize: 13, fontWeight: '600', color: '#2D3436', lineHeight: 18 },
  tableCellMono: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2D3436',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },

  // ── 编辑操作行 ──
  editActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#636E72' },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
