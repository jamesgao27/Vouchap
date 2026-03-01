/**
 * 任务附件详情（client 侧 project 路由下）：原文件链接 + AI 识别内容
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, Linking, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getProjectTodoAttachmentById } from '@/lib/firm';

export default function ProjectAttachmentScreen() {
  const { projectId, attachmentId } = useLocalSearchParams<{ projectId: string; attachmentId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [attachment, setAttachment] = useState<{
    id: string;
    attachment_url: string;
    summary: string | null;
    doc_type: string | null;
    status: string;
    extracted_data: unknown;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attachmentId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const row = await getProjectTodoAttachmentById(attachmentId);
        setAttachment(row ?? null);
        if (!row) setError('Attachment not found');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [attachmentId]);

  const openUrl = useCallback(() => {
    if (attachment?.attachment_url) Linking.openURL(attachment.attachment_url);
  }, [attachment?.attachment_url]);

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
        <Image source={{ uri: attachment.attachment_url }} style={styles.image} resizeMode="contain" />
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
