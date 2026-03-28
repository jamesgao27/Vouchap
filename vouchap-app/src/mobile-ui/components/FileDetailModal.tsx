/**
 * 文件详情大浮窗：左侧预览（图/PDF/其他），右侧识别内容（docType、summary、extractedPreview）。
 * 供 TaxFilingTodosView 与 chat-to-log 识别后卡片共用。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  BackHandler,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import {
  buildExtractedPreview,
  ensureProjectTodoAttachmentPreviewPdf,
  isSpreadsheetAttachmentUrl,
  isWordAttachmentUrl,
  summarySuggestsSpreadsheet,
  summarySuggestsWord,
  type AttachmentPreviewField,
} from '@/lib/firm';
import { getTaxFilingViewUrl } from '@/lib/supabase';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'];

/** project_todo_attachments.id UUID — avoid running preview ensure for receipt-doc-* 等临时 id */
function isProjectTodoAttachmentRowId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function getPreviewType(
  url: string | null | undefined,
  docType: string | null | undefined,
  summaryName?: string | null
): 'image' | 'pdf' {
  // 曾被误存为 .jpg 的 Excel 仍应按文档预览（避免用 Image 加载二进制表格）
  if (url && isSpreadsheetAttachmentUrl(url, docType)) return 'pdf';
  if (url && isWordAttachmentUrl(url, docType)) return 'pdf';
  if (summarySuggestsSpreadsheet(summaryName)) return 'pdf';
  if (summarySuggestsWord(summaryName)) return 'pdf';
  const ext = (url ? url.split(/[#?]/)[0].split('.').pop()?.toLowerCase() : '') ?? '';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  // 其余一律尝试按文档(PDF)预览，无法内嵌时再回退到 "Open in new tab"
  return 'pdf';
}

function deriveDownloadFileName(file: FileDetailModalFile): string {
  const raw = file.name?.trim();
  if (raw && /\.[a-z0-9]{1,8}$/i.test(raw)) {
    return raw.replace(/[/\\?%*:|"<>]/g, '_');
  }
  const path = file.imageUrl?.split(/[#?]/)[0] ?? '';
  const seg = path.split('/').pop() || '';
  const decoded = decodeURIComponent(seg).replace(/[/\\?%*:|"<>]/g, '_');
  if (decoded && decoded !== '') return decoded;
  return `attachment-${file.id.slice(0, 8)}`;
}

/** 统一包装原生调用，避免 TurboModule 抛异常直接导致崩溃，便于后续排查 */
async function callNativeSafe(label: string, fn: () => Promise<void> | void) {
  try {
    await fn();
  } catch (e) {
    console.error('[NativeCallError]', label, e);
  }
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
  /** Resolved embeddable document URL (e.g. signed PDF). Takes precedence over imageUrl for non-image preview. */
  documentPreviewUrl?: string | null;
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

  const [downloadBusy, setDownloadBusy] = useState(false);
  const downloadInFlightRef = useRef(false);
  const handleDownloadOriginal = useCallback(async () => {
    if (!file.imageUrl || downloadInFlightRef.current) return;
    downloadInFlightRef.current = true;
    setDownloadBusy(true);
    try {
      const viewUrl = await getTaxFilingViewUrl(file.imageUrl);
      const baseName = deriveDownloadFileName(file);

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const res = await fetch(viewUrl, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = baseName;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      const dest = `${FileSystem.cacheDirectory ?? ''}vouchap-download-${Date.now()}-${baseName}`;
      const { uri } = await FileSystem.downloadAsync(viewUrl, dest);
      try {
        await Share.share({
          title: baseName,
          url: uri,
        });
      } catch {
        await callNativeSafe('FileDetailModal.openDownloaded', () => Linking.openURL(uri));
      }
    } catch (e) {
      console.error('[FileDetailModal] download original:', e);
      try {
        const fallback = await getTaxFilingViewUrl(file.imageUrl);
        await callNativeSafe('FileDetailModal.downloadFallback', () => Linking.openURL(fallback));
      } catch {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert('Could not download this file. Try again or open the link from your browser.');
        }
        else Alert.alert('Download failed', 'Could not save this file. Please try opening it in a browser instead.');
      }
    } finally {
      downloadInFlightRef.current = false;
      setDownloadBusy(false);
    }
  }, [file.imageUrl, file.name, file.id]);

  const [resolvedSpreadsheetPreviewUrl, setResolvedSpreadsheetPreviewUrl] = useState<string | null>(null);
  const [spreadsheetPreviewLoading, setSpreadsheetPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolvedSpreadsheetPreviewUrl(null);
    const needResolve =
      !file.documentPreviewUrl &&
      !!file.imageUrl &&
      isProjectTodoAttachmentRowId(file.id) &&
      (isSpreadsheetAttachmentUrl(file.imageUrl, file.docType) ||
        isWordAttachmentUrl(file.imageUrl, file.docType) ||
        summarySuggestsSpreadsheet(file.name) ||
        summarySuggestsWord(file.name));
    if (!needResolve) {
      setSpreadsheetPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setSpreadsheetPreviewLoading(true);
    ensureProjectTodoAttachmentPreviewPdf(file.id)
      .then(({ documentPreviewSignedUrl }) => {
        if (cancelled) return;
        setSpreadsheetPreviewLoading(false);
        if (documentPreviewSignedUrl) setResolvedSpreadsheetPreviewUrl(documentPreviewSignedUrl);
      })
      .catch(() => {
        if (!cancelled) setSpreadsheetPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file.id, file.imageUrl, file.documentPreviewUrl, file.docType, file.name]);

  const docEmbedUrl = file.documentPreviewUrl ?? resolvedSpreadsheetPreviewUrl ?? null;
  const urlLooksSheetOrWord = !!(
    file.imageUrl &&
    (isSpreadsheetAttachmentUrl(file.imageUrl, file.docType) || isWordAttachmentUrl(file.imageUrl, file.docType))
  );
  const sheetOrSummaryHint =
    urlLooksSheetOrWord || summarySuggestsSpreadsheet(file.name) || summarySuggestsWord(file.name);
  const waitForLazySheetPdf =
    sheetOrSummaryHint && isProjectTodoAttachmentRowId(file.id) && !file.documentPreviewUrl;

  /** Web：部分浏览器对跨域 Storage PDF 的 iframe 渲染异常，拉成 blob: 后再嵌套更稳定 */
  const [webPdfBlobUrl, setWebPdfBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const isImage = !!(file.imageUrl && getPreviewType(file.imageUrl, file.docType, file.name) === 'image');
    if (isImage || !file.imageUrl) {
      setWebPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    const remoteForEmbed = waitForLazySheetPdf ? docEmbedUrl : (docEmbedUrl ?? file.imageUrl);
    if (!remoteForEmbed || (waitForLazySheetPdf && !docEmbedUrl)) {
      setWebPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(remoteForEmbed, { mode: 'cors', credentials: 'omit' });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const ct = blob.type || '';
        const pathLooksPdf =
          remoteForEmbed.toLowerCase().includes('.pdf') ||
          /\/preview_[^/]+\.pdf/i.test(remoteForEmbed);
        if (!ct.includes('pdf') && !pathLooksPdf) {
          if (!cancelled) {
            setWebPdfBlobUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return null;
            });
          }
          return;
        }
        const u = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        setWebPdfBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return u;
        });
      } catch {
        if (!cancelled) {
          setWebPdfBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      setWebPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [
    file.imageUrl,
    file.docType,
    file.name,
    file.id,
    file.documentPreviewUrl,
    docEmbedUrl,
    waitForLazySheetPdf,
  ]);

  const webIframeSrc =
    Platform.OS === 'web' ? (webPdfBlobUrl ?? docEmbedUrl ?? file.imageUrl) : (docEmbedUrl ?? file.imageUrl);
  const mayLazyPdf = waitForLazySheetPdf;
  const waitingSpreadsheetPdf = mayLazyPdf && spreadsheetPreviewLoading;
  const spreadsheetPreviewMiss = mayLazyPdf && !spreadsheetPreviewLoading && !docEmbedUrl;

  // Android：拦截硬件返回键，优先关闭预览浮窗而不是直接退出页面
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

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
            ) : getPreviewType(file.imageUrl, file.docType, file.name) === 'image' ? (
              <Image source={{ uri: file.imageUrl }} style={styles.thumb} resizeMode="contain" />
            ) : waitingSpreadsheetPdf ? (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <ActivityIndicator size="large" color="#6C5CE7" />
                <Text style={styles.openInNewHint}>Preparing preview…</Text>
              </View>
            ) : spreadsheetPreviewMiss ? (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="document-text-outline" size={40} color="#BDC3C7" />
                <Text style={styles.openInNewHint}>Preview not available</Text>
                {file.imageUrl ? (
                  <TouchableOpacity
                    style={styles.openInNewBtn}
                    onPress={() =>
                      callNativeSafe('FileDetailModal.openURL', () => Linking.openURL(file.imageUrl!))
                    }
                  >
                    <Text style={styles.openInNewBtnText}>Open in new tab</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : Platform.OS === 'web' && WebView ? (
              <WebView
                source={{ uri: (webIframeSrc || '') as string }}
                style={styles.thumb}
                originWhitelist={['*']}
                scalesPageToFit
              />
            ) : Platform.OS === 'web' && file.imageUrl ? (
              <View style={[styles.thumb, styles.thumbWebIframeHost]}>
                {React.createElement(
                  'object',
                  {
                    data: webIframeSrc as string,
                    type: 'application/pdf',
                    style: {
                      width: '100%',
                      height: '100%',
                      minHeight: 420,
                      border: 'none',
                      borderRadius: 10,
                      display: 'block',
                    } as any,
                    'aria-label': 'Document preview',
                  },
                  React.createElement(
                    'p',
                    { style: { padding: 16, color: '#636E72', fontSize: 14 } },
                    'Embedded preview is not available in this browser. Use “Open in new tab” below.',
                  ),
                )}
              </View>
            ) : WebView ? (
              <WebView
                source={{ uri: (webIframeSrc || file.imageUrl)! }}
                style={styles.thumb}
                originWhitelist={['*']}
                scalesPageToFit
              />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="document-text-outline" size={40} color="#BDC3C7" />
                <Text style={styles.openInNewHint}>Preview not supported</Text>
                {file.imageUrl ? (
                  <TouchableOpacity
                    style={styles.openInNewBtn}
                    onPress={() =>
                      callNativeSafe('FileDetailModal.openURL', () => Linking.openURL(file.imageUrl!))
                    }
                  >
                    <Text style={styles.openInNewBtnText}>Open in new tab</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
          {showRightPanel && (
            <ScrollView
              style={[styles.right, Platform.OS === 'web' && styles.rightWeb]}
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
              {file.imageUrl ? (
                <View style={styles.downloadSection}>
                  <Text style={styles.downloadSectionTitle}>Download original file</Text>
                  <Text style={styles.downloadSectionHint}>
                    If the preview does not load, save the file and open it on your device.
                  </Text>
                  <TouchableOpacity
                    style={styles.downloadBtn}
                    onPress={() => void handleDownloadOriginal()}
                    disabled={downloadBusy}
                    activeOpacity={0.85}
                  >
                    {downloadBusy ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={22} color="#FFF" style={styles.downloadBtnIcon} />
                        <Text style={styles.downloadBtnText}>Download file</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
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
    ...(Platform.OS === 'web'
      ? { flexDirection: 'column' as const, display: 'flex' as const }
      : null),
  },
  cardWeb: {
    overscrollBehavior: 'contain',
  } as const,
  closeBtn: { position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 },
  // Web 保持左右并排（约 0.618:0.382）；原生端改为上下布局，避免窄屏右侧溢出
  body: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web'
      ? { alignItems: 'stretch' as const, width: '100%', height: '100%' as const }
      : null),
  },
  left: {
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    // Web 端：左右布局，用固定长宽比；原生端：占用上半部分高度
    aspectRatio: Platform.OS === 'web' ? 440 / 600 : undefined,
    alignSelf: 'stretch',
    width: Platform.OS === 'web' ? '61.8%' : '100%',
    ...(Platform.OS === 'web'
      ? {
          flexShrink: 0,
          minWidth: 0,
          minHeight: 420,
        }
      : null),
  },
  leftSolo: {
    flex: 1,
    maxWidth: '100%',
  },
  leftWeb: {
    overscrollBehavior: 'contain',
  } as const,
  thumb: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: '#FFF' },
  /** Web：RN Web 下 iframe 父级若没有 minHeight，height:100% 常计算为 0 */
  thumbWebIframeHost:
    Platform.OS === 'web'
      ? {
          minHeight: 420,
          flexGrow: 1,
          alignSelf: 'stretch',
          position: 'relative',
          overflow: 'hidden',
        }
      : {},
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  openInNewHint: { fontSize: 12, color: '#95A5A6', marginTop: 8, textAlign: 'center' },
  openInNewBtn: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#6C5CE7', borderRadius: 8 },
  openInNewBtnText: { fontSize: 13, color: '#FFF', fontWeight: '600' },
  right: {
    flex: Platform.OS === 'web' ? undefined : 1,
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    width: Platform.OS === 'web' ? '38.2%' : '100%',
    flexShrink: 0,
  },
  /** Web：明确高度链，保证 ScrollView 有可视区域 */
  rightWeb: {
    height: '100%',
    maxHeight: '100%',
  },
  rightContent: { padding: 24, paddingTop: 44, paddingBottom: 24 },
  docType: { fontSize: 16, fontWeight: '700', color: '#6C5CE7', marginBottom: 10 },
  pending: { fontSize: 13, color: '#95A5A6', fontStyle: 'italic', marginBottom: 12 },
  summary: { fontSize: 15, color: '#2D3436', marginBottom: 16, lineHeight: 24 },
  preview: { gap: 12 },
  previewRow: { marginBottom: 10 },
  previewLabel: { fontSize: 12, color: '#95A5A6', marginBottom: 2, textTransform: 'capitalize' },
  previewValue: { fontSize: 15, color: '#2D3436', fontWeight: '600', lineHeight: 22 },
  downloadSection: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DFE6E9',
  },
  downloadSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 8,
  },
  downloadSectionHint: {
    fontSize: 13,
    color: '#636E72',
    lineHeight: 20,
    marginBottom: 14,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6C5CE7',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    minHeight: 48,
  },
  downloadBtnIcon: { marginRight: 10 },
  downloadBtnText: { fontSize: 16, color: '#FFF', fontWeight: '700' },
});
