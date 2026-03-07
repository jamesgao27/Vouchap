/**
 * Firm - Service Catalog: 完全复用 client 侧项目列表的卡片/列表（ProjectListCardAndRow），样式与交互一致。
 * 点击卡片/行进入 SKU 详情（Info Tab），列表末尾提供「New service」入口。
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentSpace } from '@/lib/auth';
import { getFirmSkus, updateFirmSku } from '@/lib/firm';
import { supabase } from '@/lib/supabase';
import {
  ProjectListCard,
  ProjectListRow,
  GRID_GAP,
  LIST_ROW_MIN_HEIGHT,
  projectListStyles,
  type ProjectListCardItem,
} from '@/components/ProjectListCardAndRow';
import type { FirmSku } from '@/types';

const CARD_MAX_WIDTH = 320;

// 与 SKU Info 页的标签配色保持一致的调色板与 hash 映射
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

type ViewMode = 'grid' | 'list';

function skuToItem(
  sku: FirmSku,
): ProjectListCardItem {
  const isPublished = sku.isPublished === true;
  const hasSetup = !!sku.taxCountry || !!sku.taxScenario;

  let statusLabel: 'Draft' | 'Private' | 'Published';
  let statusColor: string;
  if (sku.templateStatus === 'draft' || sku.templateStatus === 'private' || sku.templateStatus === 'published') {
    statusLabel = sku.templateStatus === 'published' ? 'Published' : sku.templateStatus === 'private' ? 'Private' : 'Draft';
    statusColor = statusLabel === 'Published' ? '#00B894' : statusLabel === 'Private' ? '#0984E3' : '#636E72';
  } else if (isPublished) {
    statusLabel = 'Published';
    statusColor = '#00B894';
  } else if (hasSetup) {
    statusLabel = 'Private';
    statusColor = '#0984E3';
  } else {
    statusLabel = 'Draft';
    statusColor = '#636E72';
  }

  const classificationTags: { label: string; bg: string; fg: string }[] = [];
  if (sku.taxCountry) {
    const [bg, fg] = getTagColor(sku.taxCountry);
    classificationTags.push({ label: sku.taxCountry, bg, fg });
  }
  if (sku.taxScenario) {
    const [bg, fg] = getTagColor(sku.taxScenario);
    classificationTags.push({ label: sku.taxScenario, bg, fg });
  }

  let statusCorner: { label: string; bg: string } | null = null;
  if (statusLabel === 'Draft') {
    statusCorner = { label: 'Draft', bg: statusColor };
  } else if (statusLabel === 'Private') {
    statusCorner = { label: 'Private', bg: statusColor };
  } else if (statusLabel === 'Published') {
    statusCorner = { label: 'Published', bg: statusColor };
  }

  return {
    id: sku.id,
    displayName: sku.name ?? '—',
    imageUrl: sku.imageUrl ?? null,
    tagPill: null,
    statusLabel,
    statusColor,
    statusCorner,
    classificationTags: classificationTags.length > 0 ? classificationTags : null,
    footerText: null,
    progress: null,
    action: null,
  };
}

export default function FirmServiceCatalogScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [skus, setSkus] = useState<FirmSku[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const { width: windowWidth } = useWindowDimensions();

  const loadData = useCallback(async (forceRefresh = false) => {
    const space = await getCurrentSpace(forceRefresh);
    if (!space?.id || space.kind !== 'firm') {
      router.replace('/');
      return;
    }
    const list = await getFirmSkus(space.id);
    setSkus(list);
  }, [router]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData(true);
      setLoading(false);
    })();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData(true);
    }, [loadData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  const openEdit = useCallback((s: FirmSku) => {
    router.push(`/firm/sku/${s.id}?tab=info&edit=1`);
  }, [router]);

  const goToDetail = useCallback((sku: FirmSku) => {
    router.push(`/firm/sku/${sku.id}`);
  }, [router]);

  const handleCreateSku = useCallback(async () => {
    try {
      const space = await getCurrentSpace(true);
      if (!space?.id || space.kind !== 'firm') return;
      const { data, error } = await supabase
        .schema('firm')
        .from('skus')
        .insert({
          firm_space_id: space.id,
          name: 'New Template',
          description: null,
          image_url: null,
          is_published: false,
          template_status: 'draft',
        })
        .select('*')
        .single();
      if (error || !data) {
        if (typeof window !== 'undefined') window.alert('Failed to create service');
        return;
      }
      router.push(`/firm/sku/${data.id}?tab=todos&edit=1&isNew=1`);
    } catch {
      if (typeof window !== 'undefined') window.alert('Failed to create service');
    }
  }, [loadData, router]);

  const numColumns = Platform.select({
    web: Math.max(2, Math.floor((windowWidth - 48) / (200 + GRID_GAP))),
    default: 2,
  });
  const cardWidth =
    Platform.OS === 'web'
      ? Math.min(CARD_MAX_WIDTH, (windowWidth - 48 - GRID_GAP * (numColumns - 1)) / numColumns)
      : (windowWidth - 40 - GRID_GAP) / 2;
  const listStyle = projectListStyles.list;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.subtitle}>
        Manage your Service Catalog: edit each Service Template and its document checklist.
      </Text>
      {loading ? (
        <ActivityIndicator size="large" color="#6C5CE7" style={styles.loader} />
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.sectionTitle}>Service Templates</Text>
            <View style={styles.viewToggle}>
              <TouchableOpacity
                style={[styles.viewToggleBtn, viewMode === 'grid' && styles.viewToggleBtnActive]}
                onPress={() => setViewMode('grid')}
                activeOpacity={0.7}
              >
                <Ionicons name="grid-outline" size={20} color={viewMode === 'grid' ? '#6C5CE7' : '#636E72'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
                onPress={() => setViewMode('list')}
                activeOpacity={0.7}
              >
                <Ionicons name="list" size={22} color={viewMode === 'list' ? '#6C5CE7' : '#636E72'} />
              </TouchableOpacity>
            </View>
          </View>
          {viewMode === 'list' ? (
            <View style={listStyle}>
              {skus.map((s) => {
                const item = skuToItem(s);
                return (
                  <ProjectListRow
                    key={s.id}
                    item={item}
                    onPress={() => goToDetail(s)}
                    onSettings={() => openEdit(s)}
                  />
                );
              })}
              <TouchableOpacity style={styles.addListRow} onPress={handleCreateSku} activeOpacity={0.8}>
                <View style={styles.addListRowSpacer} />
                <View style={styles.addListRowContent}>
                  <Ionicons name="add-circle-outline" size={26} color="#6C5CE7" />
                  <Text style={styles.addListRowText}>New Template</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.grid}>
              {skus.map((s) => {
                const item = skuToItem(s);
                return (
                  <ProjectListCard
                    key={s.id}
                    item={item}
                    cardWidth={cardWidth}
                    onPress={() => goToDetail(s)}
                    onSettings={() => openEdit(s)}
                  />
                );
              })}
              <TouchableOpacity
                style={[styles.addCardWrap, { width: cardWidth }]}
                onPress={handleCreateSku}
                activeOpacity={0.85}
              >
                <View style={styles.addCardInner}>
                  <Ionicons name="add-circle-outline" size={26} color="#6C5CE7" />
                  <Text style={styles.addCardText}>New Template</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 20, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: '#636E72', marginBottom: 24 },
  loader: { marginTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#2D3436' },
  viewToggle: { flexDirection: 'row', gap: 4 },
  viewToggleBtn: { padding: 8, borderRadius: 8 },
  viewToggleBtnActive: { backgroundColor: '#EDE9FE' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  addCardWrap: {
    maxWidth: CARD_MAX_WIDTH,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FBFCFF',
  },
  addCardInner: {
    width: '100%',
    height: '100%',
    minHeight: 180,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  addCardText: { fontSize: 14, fontWeight: '600', color: '#6C5CE7' },
  addListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: LIST_ROW_MIN_HEIGHT,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  addListRowSpacer: {
    width: 28,
    minWidth: 28,
    marginLeft: -12,
    marginRight: 0,
  },
  addListRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 4 + 64 + 12,
  },
  addListRowText: { fontSize: 14, fontWeight: '600', color: '#6C5CE7' },
});
