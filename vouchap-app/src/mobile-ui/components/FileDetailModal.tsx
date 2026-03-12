/**
 * 文件详情大浮窗：左侧预览（图/PDF/其他），右侧识别内容（docType、summary、extractedPreview）。
 * 供 TaxFilingTodosView 与 chat-to-log 识别后卡片共用。
 */
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  Platform,
  Dimensions,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buildExtractedPreview, type AttachmentPreviewField } from '@/lib/firm';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'];
function getPreviewType(url: string | null | undefined, docType: string | null | undefined): 'image' | 'pdf' | 'other' {
  const ext = (url ? url.split(/[#?]/)[0].split('.').pop()?.toLowerCase() : '') ?? '';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

// 原生端若未链接 react-native-webview（如 Expo Go），require 会抛 RNCWebViewModule；避免顶层 require 导致整应用崩溃
const WebView =
  Platform.OS === 'web'
    ? null
    : (() => {
        try {
          return require('react-native-webview').WebView;
        } catch {
          return null;
        }
      })();

export interface FileDetailModalFile {
  id: string;
  name?: string | null;
  imageUrl?: string | null;
  docType?: string | null;
  status?: string;
  extracted_data?: unknown;
  extractedPreview?: AttachmentPreviewField[];
  /**
   * 当为 true 时，仅展示左侧内嵌文档预览，不展示右侧识别内容。
   * 供 expenses / income / chat 提交气泡等场景使用。
   */
  hideRightPanel?: boolean;
}

export interface FileDetailModalProps {
  file: FileDetailModalFile;
  onClose: () => void;
}

const WEB_CARD_NATIVE_ID = 'file-detail-modal-card';
const WEB_LEFT_NATIVE_ID = 'file-detail-modal-left';

export function FileDetailModal({ file, onClose }: FileDetailModalProps) {
  const extractedPreview =
    file.extractedPreview ?? (file.extracted_data ? buildExtractedPreview(file.extracted_data) : []);
  const showRightPanel = !file.hideRightPanel;

  // Web：内嵌预览区左右滚动时禁止触发浏览器前进/后退（横向 wheel + overscroll）
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const cardEl = document.getElementById(WEB_CARD_NATIVE_ID);
    const leftEl = document.getElementById(WEB_LEFT_NATIVE_ID);
    const targets = [cardEl, leftEl].filter(Boolean) as HTMLElement[];
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0) e.preventDefault();
    };
    targets.forEach((el) => el.addEventListener('wheel', onWheel, { passive: false }));
    return () => targets.forEach((el) => el.removeEventListener('wheel', onWheel));
  }, []);

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View nativeID={WEB_CARD_NATIVE_ID} style={[styles.card, Platform.OS === 'web' && styles.cardWeb]}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={24} color="#636E72" />
        </TouchableOpacity>
        <View style={styles.body}>
          <View
            nativeID={WEB_LEFT_NATIVE_ID}
            style={[
              styles.left,
              Platform.OS === 'web' && styles.leftWeb,
              !showRightPanel && styles.leftSolo,
            ]}
          >
            {!file.imageUrl ? (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="document-outline" size={48} color="#BDC3C7" />
              </View>
            ) : getPreviewType(file.imageUrl, file.docType) === 'image' ? (
              <Image source={{ uri: file.imageUrl }} style={styles.thumb} resizeMode="contain" />
            ) : WebView ? (
              <WebView
                source={{ uri: file.imageUrl }}
                style={styles.thumb}
                originWhitelist={['*']}
                scalesPageToFit
              />
            ) : Platform.OS === 'web' && file.imageUrl ? (
              <View style={styles.thumb}>
                {React.createElement('iframe', {
                  src: file.imageUrl,
                  style: { width: '100%', height: '100%', border: 'none', borderRadius: 10 },
                  title: 'Preview',
                })}
              </View>
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="document-text-outline" size={40} color="#BDC3C7" />
                <Text style={styles.openInNewHint}>Preview not supported</Text>
                <TouchableOpacity style={styles.openInNewBtn} onPress={() => { if (file.imageUrl) Linking.openURL(file.imageUrl); }}>
                  <Text style={styles.openInNewBtnText}>Open in new tab</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {showRightPanel && (
            <ScrollView
              style={styles.right}
              contentContainerStyle={styles.rightContent}
              showsVerticalScrollIndicator
            >
              <Text style={styles.docType}>
                {file.docType ?? (file.status === 'PENDING_AI' ? 'Processing…' : 'Attachment')}
              </Text>
              {file.status === 'PENDING_AI' && <Text style={styles.pending}>Recognition in progress</Text>}
              {file.name && file.name !== 'Attachment' && file.name !== 'Processing...' && (
                <Text style={styles.summary}>{file.name}</Text>
              )}
              {extractedPreview.length > 0 && (
                <View style={styles.preview}>
                  {extractedPreview.map((p, i) => (
                    <View key={i} style={styles.previewRow}>
                      <Text style={styles.previewLabel}>{p.label}:</Text>
                      <Text style={styles.previewValue}>{p.value}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  card: {
    width: Math.min(Dimensions.get('window').width * 0.98, 960),
    height: '95%',
    maxHeight: '95%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  cardWeb: {
    overscrollBehavior: 'contain',
  } as const,
  closeBtn: { position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 },
  body: { flexDirection: 'row', flex: 1, minHeight: 0 },
  left: {
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    aspectRatio: 440 / 600,
    alignSelf: 'stretch',
  },
  leftSolo: {
    flex: 1,
    maxWidth: '100%',
  },
  leftWeb: {
    overscrollBehavior: 'contain',
  } as const,
  thumb: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: '#FFF' },
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  openInNewHint: { fontSize: 12, color: '#95A5A6', marginTop: 8, textAlign: 'center' },
  openInNewBtn: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#6C5CE7', borderRadius: 8 },
  openInNewBtnText: { fontSize: 13, color: '#FFF', fontWeight: '600' },
  right: { flex: 1, minWidth: 0 },
  rightContent: { padding: 24, paddingTop: 44, paddingBottom: 24 },
  docType: { fontSize: 16, fontWeight: '700', color: '#6C5CE7', marginBottom: 10 },
  pending: { fontSize: 13, color: '#95A5A6', fontStyle: 'italic', marginBottom: 12 },
  summary: { fontSize: 15, color: '#2D3436', marginBottom: 16, lineHeight: 24 },
  preview: { gap: 12 },
  previewRow: { marginBottom: 10 },
  previewLabel: { fontSize: 12, color: '#95A5A6', marginBottom: 2, textTransform: 'capitalize' },
  previewValue: { fontSize: 15, color: '#2D3436', fontWeight: '600', lineHeight: 22 },
});
