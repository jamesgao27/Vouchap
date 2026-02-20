/**
 * Web 聊天侧栏：由 context 控制，非 pin 时浮层且点击主区收缩为气泡，pin 时常驻并压缩主区。
 */
import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatPanel } from '../contexts/ChatPanelContext';
import { VoiceInputContent } from '../app/voice-input';

const PANEL_WIDTH = 420;

const PANEL_NATIVE_ID = 'web-chat-panel';

export default function WebChatPanel() {
  const { open, pinned, type, setType, closePanel, togglePin } = useChatPanel();

  useEffect(() => {
    if (Platform.OS !== 'web' || !open || pinned) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const panelEl = typeof document !== 'undefined' ? document.getElementById(PANEL_NATIVE_ID) : null;
      if (panelEl && !panelEl.contains(target)) closePanel();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, pinned, closePanel]);

  if (Platform.OS !== 'web' || !open) return null;

  return (
    <View
      nativeID={PANEL_NATIVE_ID}
      style={[styles.panel, pinned ? styles.panelPinned : styles.panelFloating]}
      collapsable={false}
    >
      <View style={styles.header}>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleTab, type === 'invoice' && styles.toggleTabActive]}
            onPress={() => setType('invoice')}
          >
            <Text style={[styles.toggleText, type === 'invoice' && styles.toggleTextActive]}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleTab, type === 'receipt' && styles.toggleTabActive]}
            onPress={() => setType('receipt')}
          >
            <Text style={[styles.toggleText, type === 'receipt' && styles.toggleTextActive]}>Expenses</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={togglePin}>
            <Ionicons name={pinned ? 'bookmark' : 'bookmark-outline'} size={22} color="#2D3436" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={closePanel}>
            <Ionicons name="close" size={24} color="#2D3436" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.body}>
        <VoiceInputContent voucherType={type} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleTabActive: {
    backgroundColor: '#6C5CE7',
  },
  toggleText: {
    fontSize: 15,
    color: '#2D3436',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#fff',
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
