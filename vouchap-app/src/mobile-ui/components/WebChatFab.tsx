/**
 * Web 端聊天气泡 FAB；悬停展开为与右栏一致的底部输入区（嵌入/非嵌入均支持），移开延迟还原。
 * 图片选择与完整 chat-to-log 一致，打开右栏时已选图片会带入暂存区。
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
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useChatPanel } from '../contexts/ChatPanelContext';
import type { ChatPanelType, StagedAttachmentFile } from '../contexts/ChatPanelContext';
import { PANEL_WIDTH } from './WebChatPanel';
import { getCurrentSpace } from '@/lib/auth';
import { getChatToLogAllowedTypes } from '@/lib/chat-to-log-allowed-types';
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

function getPlaceholder(type: ChatPanelType): string {
  if (type === 'tax-filing') return 'Upload tax documents...';
  if (type === 'invoice') return 'Describe your incomes...';
  if (type === 'inbound') return 'Describe your inbound...';
  if (type === 'outbound') return 'Describe your outbound...';
  return 'Describe your expenses...';
}

export default function WebChatFab({ type = 'receipt', variant = 'chat', embedded }: WebChatFabProps) {
  const { open, openPanel, type: contextType, setType, setInitialStagedFiles } = useChatPanel();
  const [hovered, setHovered] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [stagedAttachmentFiles, setStagedAttachmentFiles] = useState<StagedAttachmentFile[]>([]);
  const [currentSpace, setCurrentSpace] = useState<{ kind?: string } | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentSpace().then((space) => {
      if (!cancelled) setCurrentSpace(space ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  const typeOptions = getChatToLogAllowedTypes(currentSpace);
  const currentType: ChatPanelType =
    typeOptions.some((o) => o.value === contextType) ? contextType : (typeOptions[0]?.value ?? 'receipt');
  const currentLabel = typeOptions.find((o) => o.value === currentType)?.label ?? 'Expenses';

  const pickImagesForSend = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
      if (status !== 'granted' && status !== 'undetermined') {
        showToast('Need photo library permission.', 'info');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      const now = Date.now();
      setStagedAttachmentFiles(prev => [...prev, ...result.assets.map((a, i) => ({ id: `${a.uri}-${now}-${i}`, uri: a.uri!, name: a.fileName }))]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to add files', 'error');
    }
  }, []);

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

  const openFullPanel = () => {
    if (stagedAttachmentFiles.length) {
      setInitialStagedFiles(stagedAttachmentFiles);
    }
    openPanel(currentType);
    setStagedAttachmentFiles([]);
    setHovered(false);
    setShowTypeDropdown(false);
  };

  // 悬停时只显示展开的输入栏；点击输入区或发送按钮呼出完整右栏，图片按钮与 chat-to-log 一致
  if (hovered) {
    const thumbAlignTopLeft = Platform.select({
      web: { objectFit: 'cover' as const, objectPosition: 'top left' as const },
      default: {},
    });
    return (
      <View
        style={styles.expandedOuter}
        onMouseEnter={handleEnter}
        onMouseLeave={scheduleCollapse}
      >
        <View style={styles.expandedBlock}>
          {stagedAttachmentFiles.length > 0 ? (
            <View style={styles.stagedFilesRow}>
              <View style={styles.stagedFilesList}>
                {stagedAttachmentFiles.map((f) => (
                  <View key={f.id} style={styles.stagedFileChip}>
                    <View style={styles.stagedFileThumbWrap}>
                      <Image source={{ uri: f.uri }} style={[styles.stagedFileThumb, thumbAlignTopLeft]} resizeMode="cover" />
                    </View>
                    <Text style={styles.stagedFileChipText} numberOfLines={1}>{f.name ?? 'Image'}</Text>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => setStagedAttachmentFiles(prev => prev.filter(x => x.id !== f.id))}
                    >
                      <Ionicons name="close-circle" size={18} color="#636E72" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          <TouchableOpacity style={styles.expandedRow} onPress={openFullPanel} activeOpacity={1}>
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
          </TouchableOpacity>
          <View style={styles.expandedActionsRow}>
            <View style={styles.expandedActionsLeft}>
              <TouchableOpacity style={styles.expandedActionIcon} onPress={pickImagesForSend}>
                <Ionicons name="image-outline" size={22} color="#636E72" />
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
                  {typeOptions.map((opt) => (
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
      </View>
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
  stagedFilesRow: {
    marginBottom: 8,
  },
  stagedFilesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stagedFileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 6,
    borderRadius: 12,
    backgroundColor: '#F1F3F5',
    width: '48%',
    minWidth: 0,
  },
  stagedFileThumbWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E9ECEF',
  },
  stagedFileThumb: {
    width: '100%',
    height: '100%',
  },
  stagedFileChipText: {
    fontSize: 12,
    color: '#2D3436',
    flex: 1,
    minWidth: 0,
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
