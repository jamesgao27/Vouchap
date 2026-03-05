/**
 * 任务附件详情（client 侧 project 路由下）：原文件链接 + AI 识别内容
 * 使用 signed URL 以便在 bucket 私有时也能正常预览/打开。
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, Linking, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getProjectTodoAttachmentById } from '@/lib/firm';
import { getTaxFilingViewUrl } from '@/lib/supabase';

export default function ProjectAttachmentScreen() {
  const { projectId, attachmentId } = useLocalSearchParams<{ projectId: string; attachmentId: string }>();
  const [loading, setLoading] = useState(true);
  const [attachment, setAttachment] = useState<{
    id: string;
    attachment_url: string;
    summary: string | null;
    doc_type: string | null;
    status: string;
    extracted_data: unknown;
  } | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attachmentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setViewUrl(null);
      try {
        const row = await getProjectTodoAttachmentById(attachmentId);
        if (cancelled) return;
        setAttachment(row ?? null);
        if (!row) setError('Attachment not found');
        else {
          setLoading(false);
          const url = await getTaxFilingViewUrl(row.attachment_url);
          if (!cancelled) setViewUrl(url);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [attachmentId]);

  const openUrl = useCallback(() => {
    const url = viewUrl ?? attachment?.attachment_url;
    if (url) Linking.openURL(url);
  }, [attachment?.attachment_url, viewUrl]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }
  if (error || !attachment) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Not found'}</Text>
      </View>
    );
  }

  const isImage = /\.(jpg|jpeg|png|gif|webp)/i.test(attachment.attachment_url) || attachment.attachment_url.includes('storage');
  const imageUri = viewUrl ?? attachment.attachment_url;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {attachment.summary ? (
        <Text style={styles.summary}>{attachment.summary}</Text>
      ) : null}
      {attachment.doc_type ? (
        <Text style={styles.docType}>Type: {attachment.doc_type}</Text>
      ) : null}
      <Text style={styles.status}>Status: {attachment.status}</Text>
      {isImage ? (
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
      ) : null}
      <Text style={styles.linkLabel}>File link:</Text>
      <Text style={styles.link} onPress={openUrl} selectable>
        {attachment.attachment_url}
      </Text>
      {attachment.extracted_data != null && typeof attachment.extracted_data === 'object' ? (
        <>
          <Text style={styles.sectionTitle}>AI 识别内容</Text>
          <Text style={styles.json} selectable>
            {JSON.stringify(attachment.extracted_data, null, 2)}
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  errorText: { fontSize: 16, color: '#E74C3C' },
  summary: { fontSize: 17, fontWeight: '600', marginBottom: 8, color: '#2D3436' },
  docType: { fontSize: 14, color: '#636E72', marginBottom: 4 },
  status: { fontSize: 14, color: '#636E72', marginBottom: 16 },
  image: { width: '100%', height: 280, backgroundColor: '#F5F6FA', borderRadius: 8, marginBottom: 16 },
  linkLabel: { fontSize: 12, color: '#95A5A6', marginBottom: 4 },
  link: { fontSize: 13, color: '#0984E3', marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8, color: '#2D3436' },
  json: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#2D3436', backgroundColor: '#F5F6FA', padding: 12, borderRadius: 8 },
});
