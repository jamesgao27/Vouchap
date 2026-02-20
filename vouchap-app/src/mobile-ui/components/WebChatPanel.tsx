/**
 * Web 聊天侧栏：由 context 控制，打开即常驻并压缩主区（无 pin 切换）。
 */
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatPanel } from '../contexts/ChatPanelContext';
import { ChatToLogContent } from '../app/chat-to-log';

const PANEL_WIDTH = 420;

const PANEL_NATIVE_ID = 'web-chat-panel';

export default function WebChatPanel() {
  const { open, type, closePanel } = useChatPanel();

  if (Platform.OS !== 'web' || !open) return null;

  return (
    <View
      nativeID={PANEL_NATIVE_ID}
      style={[styles.panel, styles.panelPinned]}
      collapsable={false}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat to log</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={closePanel}>
            <Ionicons name="close" size={24} color="#2D3436" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.body}>
        <ChatToLogContent voucherType={type} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: PANEL_WIDTH,
    backgroundColor: '#fff',
    flexDirection: 'column',
    borderLeftWidth: 1,
    borderLeftColor: '#E9ECEF',
  },
  panelFloating: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  panelPinned: {
    flexShrink: 0,
  },
  panelFloating: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2D3436',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    padding: 4,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});

export { PANEL_WIDTH };
