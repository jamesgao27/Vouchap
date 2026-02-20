/**
 * Web 端右下角聊天气泡 FAB，与列表页统一样式（加大、聊天 icon）。
 * 点击打开聊天侧栏（context，不切换路由）。
 */
import { StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatPanel } from '../contexts/ChatPanelContext';

const FAB_SIZE = 80;
const FAB_BOTTOM = 40;
const FAB_RIGHT = 40;
const CHAT_ICON_SIZE = 36;

export type WebFabVariant = 'chat' | 'add';

interface WebChatFabProps {
  /** 打开右侧栏时的默认类型 */
  type?: 'invoice' | 'receipt';
  /** 展示形态：chat 聊天气泡，add 加号（样式一致，均用聊天 icon） */
  variant?: WebFabVariant;
  /** 嵌入列表页时由父级定位，不使用绝对定位 */
  embedded?: boolean;
}

export default function WebChatFab({ type = 'receipt', variant = 'chat', embedded }: WebChatFabProps) {
  const { open, openPanel, closePanel } = useChatPanel();

  if (Platform.OS !== 'web') return null;
  if (open) return null;

  const onPress = () => {
    if (open) closePanel();
    else openPanel(type === 'invoice' ? 'invoice' : 'receipt');
  };

  return (
    <TouchableOpacity
      style={embedded ? styles.fabEmbedded : styles.fab}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name="chatbubble-outline" size={CHAT_ICON_SIZE} color="#fff" />
    </TouchableOpacity>
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
  justifyContent: 'center',
  alignItems: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 8,
};

const styles = StyleSheet.create({
  fab: {
    ...webFabStyle,
  },
  fabEmbedded: {
    width: webFabStyle.width,
    height: webFabStyle.height,
    borderRadius: (webFabStyle.width as number) / 2,
    backgroundColor: webFabStyle.backgroundColor as string,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
});
