import React, { useEffect, useState } from 'react';
import { Modal, View, Image, Text, Pressable, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { saveAttachmentImageToDevice } from '@/lib/save-image-to-device';
import { getTaxFilingViewUrl } from '@/lib/supabase';
import { useOverlayViewportSize } from '../lib/web-viewport';

export function promptSaveAttachmentImage(uri: string) {
  if (!uri) return;
  if (Platform.OS === 'web') {
    void saveAttachmentImageToDevice(uri);
    return;
  }
  Alert.alert('Save image', 'Save this image to your device?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Save', onPress: () => { void saveAttachmentImageToDevice(uri); } },
  ]);
}

interface AttachmentImagePreviewModalProps {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

/** Full-screen image preview. Web uses a DOM img (same as FileDetailModal); native uses RN Image. */
/** blob:/data:/file: 是本地引用，不能也不需要换成 storage 签名 URL */
function isLocalUri(value: string) {
  return /^(blob:|data:|file:)/i.test(value);
}

export function AttachmentImagePreviewModal({ visible, uri, onClose }: AttachmentImagePreviewModalProps) {
  const { width, height } = useOverlayViewportSize();
  const [viewUri, setViewUri] = useState<string | null>(uri);
  const [failed, setFailed] = useState(false);

  // 私有 bucket（如 tax-filing）的公共 URL 会 403，必须换成签名 URL 才能显示
  useEffect(() => {
    setFailed(false);
    setViewUri(uri);
    if (!uri || !visible || isLocalUri(uri)) return;
    let cancelled = false;
    void getTaxFilingViewUrl(uri)
      .then((signed) => { if (!cancelled && signed) setViewUri(signed); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uri, visible]);

  const frameStyle = {
    width: Math.max(width * 0.92, 1),
    height: Math.max(height * 0.88, 1),
    zIndex: 1,
  } as const;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {viewUri && Platform.OS === 'web' ? (
          <View style={frameStyle} pointerEvents="box-none">
            {failed ? (
              <View style={styles.failed}>
                <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.7)" />
                <Text style={styles.failedText}>Preview unavailable. Use the download button above.</Text>
              </View>
            ) : (
              React.createElement('img', {
                src: viewUri,
                alt: '',
                style: {
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                },
                onError: () => setFailed(true),
                onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
              })
            )}
          </View>
        ) : viewUri ? (
          <Image
            source={{ uri: viewUri }}
            style={styles.imageFill}
            resizeMode="contain"
            onLongPress={() => promptSaveAttachmentImage(viewUri)}
            delayLongPress={350}
          />
        ) : null}
        <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={8}>
          <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        {viewUri ? (
          <TouchableOpacity
            style={styles.save}
            onPress={() => promptSaveAttachmentImage(viewUri)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Save image"
          >
            <Ionicons name="download-outline" size={28} color="rgba(255,255,255,0.95)" />
          </TouchableOpacity>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageFill: {
    width: '100%',
    height: '100%',
  },
  failed: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  failedText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
  },
  close: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    right: 20,
    zIndex: 2,
  },
  save: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    right: 68,
    padding: 4,
    zIndex: 2,
  },
});
