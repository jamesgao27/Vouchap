/**
 * Firm - Service Catalog: 平铺多列宫格卡片，海报样式（封面图 + 名称 + 介绍），支持每个服务包编辑（图片、介绍）。
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Image,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentSpace } from '@/lib/auth';
import { getFirmTemplates, updateFirmSku } from '@/lib/firm';
import { uploadFirmSkuImage } from '@/lib/supabase';
import RightSidePanel from '@/components/RightSidePanel';
import type { FirmTemplate } from '@/types';

const CARD_MIN_WIDTH = 240;   // 160 * 1.5
const CARD_MAX_WIDTH = 360;   // 220 * 1.5
const GRID_GAP = 16;
/** 图片区域：1/POSTER_ASPECT 为 width/height，POSTER_ASPECT 越大图片越高 */
const POSTER_ASPECT = 4 / 3;

export default function FirmServiceCatalogScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [templates, setTemplates] = useState<FirmTemplate[]>([]);
  const [editingSku, setEditingSku] = useState<FirmTemplate | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImageUri, setEditImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { width: windowWidth } = useWindowDimensions();

  const loadData = useCallback(async (forceRefresh = false) => {
    const space = await getCurrentSpace(forceRefresh);
    if (!space?.id || space.kind !== 'firm') {
      router.replace('/');
      return;
    }
    const list = await getFirmTemplates(space.id);
    setTemplates(list);
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

  const openEdit = useCallback((t: FirmTemplate) => {
    setEditingSku(t);
    setEditName(t.name);
    setEditDescription(t.description ?? '');
    setEditImageUri(null);
  }, []);

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        setEditImageUri(result.assets[0].uri);
      }
    } catch (e) {
      if (typeof window !== 'undefined') window.alert('Failed to pick image.');
    }
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingSku) return;
    setSaving(true);
    try {
      let imageUrl: string | null = editingSku.imageUrl ?? null;
      if (editImageUri) {
        const url = await uploadFirmSkuImage(editImageUri, editingSku.id);
        imageUrl = url;
      }
      const { error } = await updateFirmSku(editingSku.id, {
        name: editName.trim() || editingSku.name,
        description: editDescription.trim() || null,
        imageUrl: imageUrl ?? undefined,
      });
      if (error) {
        if (typeof window !== 'undefined') window.alert(error.message);
        return;
      }
      setEditingSku(null);
      await loadData(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (typeof window !== 'undefined') window.alert(msg || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [editingSku, editName, editDescription, editImageUri, loadData]);

  const numColumns = Platform.select({
    web: Math.max(2, Math.floor((windowWidth - 48) / (CARD_MIN_WIDTH + GRID_GAP))),
    default: 2,
  });
  const cardWidth =
    Platform.OS === 'web'
      ? Math.min(CARD_MAX_WIDTH, (windowWidth - 48 - GRID_GAP * (numColumns - 1)) / numColumns)
      : (windowWidth - 40 - GRID_GAP) / 2;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.subtitle}>
        Here you can edit the standard service content and document checklist of the service packages you offer to clients, and publish them to Vouchap's service marketplace.
      </Text>
      {loading ? (
        <ActivityIndicator size="large" color="#6C5CE7" style={styles.loader} />
      ) : templates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No service catalog yet. Add in Supabase firm.skus and firm.sku_items.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {templates.map((t) => {
            const imageUrl = t.imageUrl ?? null;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.card, { width: cardWidth }]}
                activeOpacity={0.85}
                onPress={() => openEdit(t)}
              >
                <View style={[styles.posterImageWrap, { aspectRatio: 1 / POSTER_ASPECT }]}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.posterImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.posterPlaceholder}>
                      <Ionicons name="image-outline" size={40} color="#B2BEC3" />
                      <Text style={styles.posterPlaceholderText}>Cover</Text>
                    </View>
                  )}
                </View>
                <View style={styles.posterBody}>
                  <View style={styles.posterBodyContent}>
                    <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                      {t.name}
                    </Text>
                    {t.description ? (
                      <Text style={styles.cardDesc} numberOfLines={3} ellipsizeMode="tail">
                        {t.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.itemRow}>
                    <Text style={styles.itemCount}>Items: {t.items?.length ?? 0}</Text>
                    <Ionicons
                      name={t.isPublished ? 'eye' : 'eye-off-outline'}
                      size={18}
                      color={t.isPublished ? '#27AE60' : '#95A5A6'}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <RightSidePanel
        visible={!!editingSku}
        title="Edit Service Catalog"
        onClose={() => setEditingSku(null)}
      >
        {editingSku && (
          <>
            <TouchableOpacity style={styles.editImageWrap} onPress={pickImage} activeOpacity={0.8}>
              {editImageUri ? (
                <Image source={{ uri: editImageUri }} style={styles.editImage} resizeMode="cover" />
              ) : editingSku.imageUrl ? (
                <Image
                  source={{ uri: editingSku.imageUrl }}
                  style={styles.editImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.editImagePlaceholder}>
                  <Ionicons name="image-outline" size={48} color="#B2BEC3" />
                  <Text style={styles.editImagePlaceholderText}>Tap to add cover</Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.editLabel}>Name</Text>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Service catalog name"
              placeholderTextColor="#95A5A6"
            />
            <Text style={styles.editLabel}>Intro / Description</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMultiline]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Short intro or description"
              placeholderTextColor="#95A5A6"
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={saveEdit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </RightSidePanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 20, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: '#636E72', marginBottom: 24 },
  loader: { marginTop: 40 },
  empty: { marginTop: 24 },
  emptyText: { fontSize: 14, color: '#95A5A6' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  posterImageWrap: {
    width: '100%',
    backgroundColor: '#E9ECEF',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPlaceholderText: { fontSize: 12, color: '#95A5A6', marginTop: 4 },
  posterBody: {
    padding: 18,
    height: 140,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  posterBodyContent: { flex: 1, minHeight: 80, overflow: 'hidden' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#2D3436', lineHeight: 20 },
  cardDesc: { fontSize: 13, color: '#636E72', marginTop: 6, lineHeight: 18 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  itemCount: { fontSize: 11, color: '#95A5A6' },
  modalOverlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    width: 400,
    maxWidth: '90%',
    height: '100%',
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    padding: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#2D3436' },
  modalBody: { flex: 1, minHeight: 0 },
  modalBodyContent: { paddingBottom: 24 },
  editImageWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    maxHeight: 200,
    backgroundColor: '#E9ECEF',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  editImage: { width: '100%', height: '100%' },
  editImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editImagePlaceholderText: { fontSize: 14, color: '#95A5A6', marginTop: 8 },
  editLabel: { fontSize: 14, fontWeight: '500', color: '#2D3436', marginBottom: 6 },
  editInput: {
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#2D3436',
    marginBottom: 16,
  },
  editInputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6C5CE7',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
