/**
 * Web 端聊天气泡 FAB；悬停展开为与右栏一致的底部输入区（嵌入/非嵌入均支持），移开延迟还原。
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Platform,
  View,
  TextInput,
  Pressable,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatPanel } from '../contexts/ChatPanelContext';
import type { ChatPanelType } from '../contexts/ChatPanelContext';
import { PANEL_WIDTH } from './WebChatPanel';
import { showAiInventory } from '@/lib/feature-flags';
import { showToast } from '@/lib/toast';

const FAB_SIZE = 80;
const FAB_BOTTOM = 40;
const FAB_RIGHT = 40;
const CHAT_ICON_SIZE = 36;
const LEAVE_DELAY_MS = 280;

export type WebFabVariant = 'chat' | 'add';

interface WebChatFabProps {
  type?: ChatPanelType;
  variant?: WebFabVariant;
  embedded?: boolean;
}

const TYPE_OPTIONS: { value: ChatPanelType; label: string }[] = [
  { value: 'receipt', label: 'Expenses' },
  { value: 'invoice', label: 'Incomes' },
  ...(showAiInventory ? [{ value: 'inbound' as const, label: 'Inbound' }, { value: 'outbound' as const, label: 'Outbound' }] : []),
];

function getPlaceholder(type: ChatPanelType): string {
  if (type === 'invoice') return 'Describe your incomes...';
  if (type === 'inbound') return 'Describe your inbound...';
  if (type === 'outbound') return 'Describe your outbound...';
  return 'Describe your expenses...';
}

export default function WebChatFab({ type = 'receipt', variant = 'chat', embedded }: WebChatFabProps) {
  const { open, openPanel, type: contextType, setType } = useChatPanel();
  const [hovered, setHovered] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 与当前页一致：右侧栏关闭时同步提交类别
  useEffect(() => {
    if (!open) setType(type);
  }, [type, open, setType]);

  const clearLeaveTimeout = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  const scheduleCollapse = useCallback(() => {
    clearLeaveTimeout();
    leaveTimeoutRef.current = setTimeout(() => {
      leaveTimeoutRef.current = null;
      setHovered(false);
      setShowTypeDropdown(false);
    }, LEAVE_DELAY_MS);
  }, [clearLeaveTimeout]);

  const handleEnter = useCallback(() => {
    clearLeaveTimeout();
    setHovered(true);
  }, [clearLeaveTimeout]);

  // 选单打开时：点击选单外区域收起（仅 Web）。须放在所有条件 return 之前，保证 hooks 顺序稳定
  useEffect(() => {
    if (Platform.OS !== 'web' || !showTypeDropdown) return;
    const handler = (e: PointerEvent) => {
      const el = document.getElementById('webchatfab-type-dropdown');
      if (el && !el.contains(e.target as Node)) setShowTypeDropdown(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showTypeDropdown]);

  if (Platform.OS !== 'web') return null;
  if (open) return null;

  const currentType = contextType ?? type;
  const currentLabel = TYPE_OPTIONS.find(o => o.value === currentType)?.label ?? 'Expenses';

  const openFullPanel = () => {
    openPanel(currentType);
    setHovered(false);
    setShowTypeDropdown(false);
  };

  // 悬停时只显示展开的输入栏，整块为呼出完整右栏的热区；未悬停时只显示气泡
  if (hovered) {
    return (
      <Pressable
        style={styles.expandedOuter}
        onPress={openFullPanel}
        onMouseEnter={handleEnter}
        onMouseLeave={scheduleCollapse}
      >
        <View style={styles.expandedBlock}>
          <View style={styles.expandedRow}>
            <View style={styles.expandedInputWrap}>
              <TextInput
                style={styles.expandedInput}
                placeholder={getPlaceholder(currentType)}
                placeholderTextColor="#95A5A6"
                editable={false}
                multiline
                pointerEvents="none"
              />
            </View>
          </View>
          <View style={styles.expandedActionsRow}>
            <View style={styles.expandedActionsLeft}>
              <TouchableOpacity style={styles.expandedActionIcon} onPress={() => showToast('Upload images, PDF or audio – coming soon.', 'info')}>
                <Ionicons name="image-outline" size={22} color="#636E72" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.expandedActionIcon}>
                <Ionicons name="mic-outline" size={22} color="#636E72" />
              </TouchableOpacity>
            </View>
            <View style={styles.typeDropdownWrap} nativeID="webchatfab-type-dropdown">
              <Pressable
                style={({ hovered: h }) => [styles.typeDropdownTrigger, h && styles.typeDropdownTriggerHover]}
                onPress={() => setShowTypeDropdown(v => !v)}
              >
                <Text style={styles.typeDropdownLabel}>{currentLabel}</Text>
                <Ionicons name={showTypeDropdown ? 'chevron-up' : 'chevron-down'} size={16} color="#636E72" />
              </Pressable>
              {showTypeDropdown && (
                <View style={styles.typeDropdownMenu}>
                  {TYPE_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={({ hovered: h }) => [
                        styles.typeDropdownItem,
                        currentType === opt.value && styles.typeDropdownItemActive,
                        h && styles.typeDropdownItemHover,
                      ]}
                      onPress={() => { setType(opt.value); setShowTypeDropdown(false); }}
                    >
                      <Text style={[styles.typeDropdownItemText, currentType === opt.value && styles.typeDropdownItemTextActive]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.expandedSendBtn}
              onPress={openFullPanel}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.expandedDisclaimer}>AI may make mistakes.</Text>
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.fabWrapper, !embedded && styles.fabWrapperAbsolute]}
      onMouseEnter={handleEnter}
      onMouseLeave={scheduleCollapse}
    >
      <TouchableOpacity
        style={[styles.fab, embedded && styles.fabEmbedded]}
        onPress={openFullPanel}
        activeOpacity={0.85}
      >
        <Ionicons name="chatbubble-outline" size={CHAT_ICON_SIZE} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export const webFabStyle = {
  position: 'absolute' as const,
  right: FAB_RIGHT,
  bottom: FAB_BOTTOM,
  width: FAB_SIZE,
  height: FAB_SIZE,
  borderRadius: FAB_SIZE / 2,
  backgroundColor: '#6C5CE7',
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 8,
};

const styles = StyleSheet.create({
  fabWrapper: {},
  fabWrapperAbsolute: {
    position: 'absolute',
    right: FAB_RIGHT,
    bottom: FAB_BOTTOM,
    width: FAB_SIZE,
    height: FAB_SIZE,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  fabEmbedded: {
    // 嵌入时样式与 fab 一致，父级控制位置
  },
  // 展开区：与右栏 chat-to-log 的 inputContainer + webInputBlock 尺寸完全一致（padding、圆角、行高、按钮尺寸）
  expandedOuter: {
    position: 'fixed' as any,
    right: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#E9ECEF',
    zIndex: 999,
  },
  expandedBlock: {
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    minWidth: 0,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  expandedInputWrap: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 0,
  },
  expandedInput: {
    flex: 1,
    minHeight: 24,
    maxHeight: 120,
    padding: 0,
    fontSize: 15,
    color: '#2D3436',
    outlineStyle: 'none',
  },
  expandedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  expandedActionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expandedActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeDropdownWrap: {
    position: 'relative',
    marginRight: 4,
  },
  typeDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    minWidth: 100,
  },
  typeDropdownTriggerHover: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  typeDropdownLabel: {
    fontSize: 14,
    color: '#2D3436',
    fontWeight: '500',
  },
  typeDropdownMenu: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 120,
    zIndex: 50,
  },
  typeDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  typeDropdownItemActive: {
    backgroundColor: 'transparent',
  },
  typeDropdownItemHover: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  typeDropdownItemText: {
    fontSize: 14,
    color: '#2D3436',
  },
  typeDropdownItemTextActive: {
    color: '#6C5CE7',
    fontWeight: '600',
  },
  expandedSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedDisclaimer: {
    fontSize: 12,
    color: '#95A5A6',
    textAlign: 'center',
    marginTop: 10,
  },
});
