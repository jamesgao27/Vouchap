import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Keyboard,
  Animated,
  InteractionManager,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { recognizeReceiptFromText, recognizeReceiptFromAudio, recognizeVoucherFromText, recognizeVoucherFromAudio, recognizeInboundFromText, recognizeInboundFromAudio, recognizeOutboundFromText, recognizeOutboundFromAudio } from '@/lib/gemini';
import { runWithRecognitionRetry, getUserFacingMessage } from '@/lib/recognition-retry';
import { saveReceipt, updateReceipt, getReceiptById } from '@/lib/database';
import { saveInvoice, getInvoiceById } from '@/lib/invoices';
import { saveInbound, getInboundById } from '@/lib/inbound';
import { saveOutbound, getOutboundById } from '@/lib/outbound';
import { saveChatLog, getChatLogsPaginated, VoucherLogType } from '@/lib/chat-logs';
import { showAiInventory } from '@/lib/feature-flags';
import { ReceiptStatus, Receipt, Invoice, Inbound, Outbound } from '@/types';
import { convertGeminiResultToReceipt, convertGeminiResultToInvoice, convertGeminiResultToInbound, convertGeminiResultToOutbound } from '@/lib/receipt-helpers';
import { format } from 'date-fns';
import { 
  startRecording, 
  stopRecording, 
  cancelRecording, 
  uploadAudioFile, 
  playAudio, 
  stopPlayback,
  requestAudioPermission,
} from '@/lib/audio';

// 语音识别置信度阈值：与照片 needs_retake 一致，低于此值视为无可识别内容，提示重新提交
const VOICE_CONFIDENCE_THRESHOLD = 0.4;

/** 语音/文字识别结果置信度过低（噪音/乱码/无可识别内容）时视为不可用，不保存记录 */
function isRecognitionResultUnrecognizable(result: { confidence?: number }): boolean {
  const c = result.confidence;
  if (c === undefined) return false;
  return c < VOICE_CONFIDENCE_THRESHOLD;
}

// 与列表页 receipts/invoices 统一的货币符号
const getCurrencySymbol = (currency?: string): string => {
  const symbols: Record<string, string> = {
    USD: '$', CAD: 'C$', CNY: '¥', JPY: '¥', EUR: '€', GBP: '£', AUD: 'A$',
    HKD: 'HK$', TWD: 'NT$', KRW: '₩', SGD: 'S$', MXN: 'MX$', INR: '₹',
    THB: '฿', VND: '₫', PHP: '₱', MYR: 'RM', IDR: 'Rp',
  };
  return symbols[currency || 'USD'] || (currency ? `${currency} ` : '$');
};

// 金额展示：符号弱化、数字突出（与列表页一致）
const AmountText = ({ amount, currency, style }: { amount: number; currency?: string; style?: any }) => {
  const symbol = getCurrencySymbol(currency);
  const baseSize = style?.fontSize || 16;
  return (
    <Text style={style}>
      <Text style={{ color: '#2D3436', fontSize: baseSize - 2 }}>{symbol}</Text>
      <Text style={{ fontWeight: '600' }}>{amount.toFixed(2)}</Text>
    </Text>
  );
};

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  receiptPreview?: Receipt;
  invoicePreview?: Invoice;
  inboundPreview?: Inbound;
  outboundPreview?: Outbound;
  receiptDeleted?: boolean;
  invoiceDeleted?: boolean;
  inboundDeleted?: boolean;
  outboundDeleted?: boolean;
  voucherType?: VoucherLogType; // 当前记录类别，用于详情跳转
  audioUrl?: string;
  isPlayingAudio?: boolean;
}

export default function VoiceInputScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const voucherType: VoucherLogType = (params.type === 'invoice' || params.type === 'inbound' || params.type === 'outbound') ? params.type : 'receipt';
  const isAiInventoryType = voucherType === 'inbound' || voucherType === 'outbound';
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmedReceipts, setConfirmedReceipts] = useState<Set<string>>(new Set());
  const [confirmedInvoices, setConfirmedInvoices] = useState<Set<string>>(new Set());
  const [confirmedInbounds, setConfirmedInbounds] = useState<Set<string>>(new Set());
  const [confirmedOutbounds, setConfirmedOutbounds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [oldestLoadedAt, setOldestLoadedAt] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
  const messagesRef = useRef<Message[]>([]);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // 语音模式相关状态（默认语音模式）
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const recordingAnimation = useRef(new Animated.Value(1)).current;
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const isStartingRecording = useRef(false);
  const isRecordingRef = useRef(false); // 用 ref 跟踪录音状态，避免闭包问题
  const recordingDurationRef = useRef(0);
  const isLongPressMode = useRef(false); // 是否是长按模式（按住录音）
  const pressStartTime = useRef(0); // 按下的时间戳
  
  // 组件挂载状态，后台重试完成后仅在校验通过后更新 UI
  const mountedRef = useRef(true);

  // Toast 提示
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  
  // 显示 Toast
  const showToast = (message: string, duration: number = 1500) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(duration),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastMessage(null);
    });
  };

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (isAiInventoryType && !showAiInventory) router.replace('/');
  }, [isAiInventoryType]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const current = messagesRef.current;
      const hasPreviews = current.some(
        (m) => m.receiptPreview?.id || m.invoicePreview?.id || m.inboundPreview?.id || m.outboundPreview?.id,
      );
      if (!hasPreviews || current.length === 0) return;
      (async () => {
        const enriched = await Promise.all(
          current.map(async (msg) => {
            if (msg.invoicePreview?.id) {
              try {
                const invoice = await getInvoiceById(msg.invoicePreview.id);
                if (!invoice) return { ...msg, invoiceDeleted: true };
                return { ...msg, invoicePreview: invoice, invoiceDeleted: false };
              } catch {
                return { ...msg, invoiceDeleted: true };
              }
            }
            if (msg.inboundPreview?.id) {
              try {
                const inbound = await getInboundById(msg.inboundPreview.id);
                if (!inbound) return { ...msg, inboundDeleted: true };
                return { ...msg, inboundPreview: inbound, inboundDeleted: false };
              } catch {
                return { ...msg, inboundDeleted: true };
              }
            }
            if (msg.outboundPreview?.id) {
              try {
                const outbound = await getOutboundById(msg.outboundPreview.id);
                if (!outbound) return { ...msg, outboundDeleted: true };
                return { ...msg, outboundPreview: outbound, outboundDeleted: false };
              } catch {
                return { ...msg, outboundDeleted: true };
              }
            }
            if (!msg.receiptPreview?.id) return msg;
            try {
              const receipt = await getReceiptById(msg.receiptPreview.id);
              if (!receipt) return { ...msg, receiptDeleted: true };
              return { ...msg, receiptPreview: receipt, receiptDeleted: false };
            } catch {
              return { ...msg, receiptDeleted: true };
            }
          }),
        );
        if (isActive) setMessages(enriched);
      })();
      return () => {
        isActive = false;
      };
    }, []),
  );

  useEffect(() => {
    // 首次加载：拉取最近 5 条历史（从下往上显示，避免卡顿）
    const loadInitialHistory = async () => {
      try {
        setIsLoadingHistory(true);
        const logs = await getChatLogsPaginated(5, undefined, voucherType);

        if (!logs || logs.length === 0) {
          let welcomeText: string;
          if (voucherType === 'invoice') {
            welcomeText = 'Hi! Describe your income (sale / money received). I\'ll extract customer, amount, and items.\n\nExample: "Client ABC paid $500 on March 15 for consulting. Items: Service $500"';
          } else if (voucherType === 'inbound') {
            welcomeText = 'Hi! Describe your inbound (goods received from supplier). I\'ll extract supplier, date, and items with quantity and unit.\n\nExample: "ABC Supplier delivered on March 15: Widget A 10 boxes @ $50, Widget B 20 pcs"';
          } else if (voucherType === 'outbound') {
            welcomeText = 'Hi! Describe your outbound (goods shipped to customer). I\'ll extract customer, date, and items with quantity and unit.\n\nExample: "Shipped to XYZ Customer on March 15: Product A 5 boxes @ $60, Product B 10 pcs"';
          } else {
            welcomeText = 'Hi! I can help you create expenses from text. Just describe your purchase, and I\'ll extract the details.\n\nExample: "I spent $25.50 at Starbucks on March 15th, 2024. Items: Coffee $5.50, Sandwich $20.00"';
          }
          setMessages([{ id: 'welcome', text: welcomeText, isUser: false, timestamp: new Date() }]);
          setHasMoreHistory(false);
          return;
        }

        // Supabase 是按 created_at 降序返回，这里反转成时间正序显示
        const sorted = [...logs].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        // 首次加载：先 push 提交内容再 push 卡片，reverse 后为 [最新…最早]，inverted 下卡片在下、提交在上
        const restoredMessages: Message[] = [];

        for (const log of sorted) {
          if (log.prompt) {
            restoredMessages.push({
              id: `${log.id}-prompt`,
              text: log.audioUrl ? `🎤 Voice` : log.prompt,
              isUser: true,
              timestamp: new Date(log.createdAt),
              audioUrl: log.audioUrl,
            });
          }
          const logType = log.voucherType ?? 'receipt';
          if (log.responseData?.invoicePreview && logType === 'invoice') {
            const preview = log.responseData.invoicePreview as Invoice;
            restoredMessages.push({
              id: `${log.id}-preview`,
              text: '',
              isUser: false,
              timestamp: new Date(log.createdAt),
              invoicePreview: preview,
              voucherType: 'invoice',
            });
          } else if (log.responseData?.inboundPreview && logType === 'inbound') {
            const preview = log.responseData.inboundPreview as Inbound;
            restoredMessages.push({
              id: `${log.id}-preview`,
              text: '',
              isUser: false,
              timestamp: new Date(log.createdAt),
              inboundPreview: preview,
              voucherType: 'inbound',
            });
          } else if (log.responseData?.outboundPreview && logType === 'outbound') {
            const preview = log.responseData.outboundPreview as Outbound;
            restoredMessages.push({
              id: `${log.id}-preview`,
              text: '',
              isUser: false,
              timestamp: new Date(log.createdAt),
              outboundPreview: preview,
              voucherType: 'outbound',
            });
          } else if (log.responseData?.receiptPreview) {
            const preview = log.responseData.receiptPreview as Receipt;
            restoredMessages.push({
              id: `${log.id}-preview`,
              text: '',
              isUser: false,
              timestamp: new Date(log.createdAt),
              receiptPreview: preview,
              voucherType: 'receipt',
            });
          } else if (log.response) {
            restoredMessages.push({
              id: `${log.id}-response`,
              text: log.response,
              isUser: false,
              timestamp: new Date(log.createdAt),
            });
          }
        }

        if (restoredMessages.length === 0) {
          let welcomeText: string;
          if (voucherType === 'invoice') welcomeText = 'Hi! Describe your income (sale / money received). I\'ll extract customer, amount, and items.';
          else if (voucherType === 'inbound') welcomeText = 'Hi! Describe your inbound (goods received). I\'ll extract supplier, date, and items with quantity and unit.';
          else if (voucherType === 'outbound') welcomeText = 'Hi! Describe your outbound (goods shipped). I\'ll extract customer, date, and items with quantity and unit.';
          else welcomeText = 'Hi! I can help you create expenses from text. Just describe your purchase, and I\'ll extract the details.\n\nExample: "I spent $25.50 at Starbucks on March 15th, 2024. Items: Coffee $5.50, Sandwich $20.00"';
          setMessages([{ id: 'welcome', text: welcomeText, isUser: false, timestamp: new Date() }]);
          setHasMoreHistory(false);
        } else {
          const enriched = await Promise.all(
            restoredMessages.map(async (msg) => {
              if (msg.invoicePreview?.id) {
                try {
                  const invoice = await getInvoiceById(msg.invoicePreview.id);
                  if (!invoice) return { ...msg, invoiceDeleted: true };
                  return { ...msg, invoicePreview: invoice, invoiceDeleted: false };
                } catch {
                  return { ...msg, invoiceDeleted: true };
                }
              }
              if (msg.inboundPreview?.id) {
                try {
                  const inbound = await getInboundById(msg.inboundPreview.id);
                  if (!inbound) return { ...msg, inboundDeleted: true };
                  return { ...msg, inboundPreview: inbound, inboundDeleted: false };
                } catch {
                  return { ...msg, inboundDeleted: true };
                }
              }
              if (msg.outboundPreview?.id) {
                try {
                  const outbound = await getOutboundById(msg.outboundPreview.id);
                  if (!outbound) return { ...msg, outboundDeleted: true };
                  return { ...msg, outboundPreview: outbound, outboundDeleted: false };
                } catch {
                  return { ...msg, outboundDeleted: true };
                }
              }
              if (!msg.receiptPreview?.id) return msg;
              try {
                const receipt = await getReceiptById(msg.receiptPreview.id);
                if (!receipt) return { ...msg, receiptDeleted: true };
                return { ...msg, receiptPreview: receipt, receiptDeleted: false };
              } catch {
                return { ...msg, receiptDeleted: true };
              }
            }),
          );

          // 存为 [最新…最早]，配合 inverted FlatList：最新在底部，往上滑加载更早
          setMessages(enriched.reverse());
          const oldest = sorted[sorted.length - 1];
          setOldestLoadedAt(oldest.createdAt);
          setHasMoreHistory(sorted.length >= 5);
        }
      } catch (error) {
        console.error('Error loading initial chat history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    // 先完成转场再加载历史，不阻塞前端
    const task = InteractionManager.runAfterInteractions(() => {
      loadInitialHistory();
    });

    // 自动聚焦输入框
    setTimeout(() => {
      inputRef.current?.focus();
    }, 300);

    // 监听键盘事件
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      task.cancel();
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [voucherType]);

  // 往上滑（看更早消息）时提前加载历史，由 FlatList onEndReached 触发
  const loadMoreHistory = useCallback(async () => {
    if (!hasMoreHistory || isLoadingHistory || !oldestLoadedAt) return;
    try {
      setIsLoadingHistory(true);
      const moreLogs = await getChatLogsPaginated(20, oldestLoadedAt, voucherType);

      if (!moreLogs || moreLogs.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      const sorted = [...moreLogs].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      // 每条记录顺序：先卡片（靠下），再提交内容（靠上），inverted 下显示为卡片在下、提交在上
      const moreMessagesRaw: Message[] = [];
      for (const log of sorted) {
        const logType = log.voucherType ?? 'receipt';
        if (log.responseData?.invoicePreview && logType === 'invoice') {
          const preview = log.responseData.invoicePreview as Invoice;
          moreMessagesRaw.push({
            id: `${log.id}-preview`,
            text: '',
            isUser: false,
            timestamp: new Date(log.createdAt),
            invoicePreview: preview,
            voucherType: 'invoice',
          });
        } else if (log.responseData?.inboundPreview && logType === 'inbound') {
          const preview = log.responseData.inboundPreview as Inbound;
          moreMessagesRaw.push({
            id: `${log.id}-preview`,
            text: '',
            isUser: false,
            timestamp: new Date(log.createdAt),
            inboundPreview: preview,
            voucherType: 'inbound',
          });
        } else if (log.responseData?.outboundPreview && logType === 'outbound') {
          const preview = log.responseData.outboundPreview as Outbound;
          moreMessagesRaw.push({
            id: `${log.id}-preview`,
            text: '',
            isUser: false,
            timestamp: new Date(log.createdAt),
            outboundPreview: preview,
            voucherType: 'outbound',
          });
        } else if (log.responseData?.receiptPreview) {
          const preview = log.responseData.receiptPreview as Receipt;
          moreMessagesRaw.push({
            id: `${log.id}-preview`,
            text: '',
            isUser: false,
            timestamp: new Date(log.createdAt),
            receiptPreview: preview,
            voucherType: 'receipt',
          });
        } else if (log.response) {
          moreMessagesRaw.push({
            id: `${log.id}-response`,
            text: log.response,
            isUser: false,
            timestamp: new Date(log.createdAt),
          });
        }
        if (log.prompt) {
          moreMessagesRaw.push({
            id: `${log.id}-prompt`,
            text: log.prompt,
            isUser: true,
            timestamp: new Date(log.createdAt),
          });
        }
      }

      const moreMessages = await Promise.all(
        moreMessagesRaw.map(async (msg) => {
          if (msg.invoicePreview?.id) {
            try {
              const invoice = await getInvoiceById(msg.invoicePreview.id);
              if (!invoice) return { ...msg, invoiceDeleted: true };
              return { ...msg, invoicePreview: invoice, invoiceDeleted: false };
            } catch {
              return { ...msg, invoiceDeleted: true };
            }
          }
          if (msg.inboundPreview?.id) {
            try {
              const inbound = await getInboundById(msg.inboundPreview.id);
              if (!inbound) return { ...msg, inboundDeleted: true };
              return { ...msg, inboundPreview: inbound, inboundDeleted: false };
            } catch {
              return { ...msg, inboundDeleted: true };
            }
          }
          if (msg.outboundPreview?.id) {
            try {
              const outbound = await getOutboundById(msg.outboundPreview.id);
              if (!outbound) return { ...msg, outboundDeleted: true };
              return { ...msg, outboundPreview: outbound, outboundDeleted: false };
            } catch {
              return { ...msg, outboundDeleted: true };
            }
          }
          if (!msg.receiptPreview?.id) return msg;
          try {
            const receipt = await getReceiptById(msg.receiptPreview.id);
            if (!receipt) return { ...msg, receiptDeleted: true };
            return { ...msg, receiptPreview: receipt, receiptDeleted: false };
          } catch {
            return { ...msg, receiptDeleted: true };
          }
        }),
      );

      // 按 id 去重，避免分页重叠导致重复 key
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newOnes = moreMessages.filter((m) => !existingIds.has(m.id));
        return newOnes.length ? [...prev, ...newOnes] : prev;
      });
      const oldest = sorted[sorted.length - 1];
      setOldestLoadedAt(oldest.createdAt);
      setHasMoreHistory(sorted.length >= 20);
    } catch (error) {
      console.error('Error loading more chat history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [hasMoreHistory, isLoadingHistory, oldestLoadedAt, voucherType]);

  const handlePreviewDetails = async (message: Message) => {
    const invoiceId = message.invoicePreview?.id;
    if (invoiceId) {
      try {
        const invoice = await getInvoiceById(invoiceId);
        if (!invoice) {
          setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, invoiceDeleted: true } : m)));
          Alert.alert('Income Deleted', 'This income has been deleted.');
          return;
        }
        router.push(`/invoice-details/${invoiceId}`);
      } catch (error) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, invoiceDeleted: true } : m)));
        Alert.alert('Income Deleted', 'This income has been deleted.');
      }
      return;
    }
    const inboundId = message.inboundPreview?.id;
    if (inboundId) {
      try {
        const inbound = await getInboundById(inboundId);
        if (!inbound) {
          setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, inboundDeleted: true } : m)));
          Alert.alert('Inbound Deleted', 'This inbound has been deleted.');
          return;
        }
        router.push(`/inbound-details/${inboundId}`);
      } catch (error) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, inboundDeleted: true } : m)));
        Alert.alert('Inbound Deleted', 'This inbound has been deleted.');
      }
      return;
    }
    const outboundId = message.outboundPreview?.id;
    if (outboundId) {
      try {
        const outbound = await getOutboundById(outboundId);
        if (!outbound) {
          setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, outboundDeleted: true } : m)));
          Alert.alert('Outbound Deleted', 'This outbound has been deleted.');
          return;
        }
        router.push(`/outbound-details/${outboundId}`);
      } catch (error) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, outboundDeleted: true } : m)));
        Alert.alert('Outbound Deleted', 'This outbound has been deleted.');
      }
      return;
    }
    const receiptId = message.receiptPreview?.id;
    if (!receiptId) return;
    try {
      const receipt = await getReceiptById(receiptId);
      if (!receipt) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, receiptDeleted: true } : m)));
        Alert.alert('Expense Deleted', 'This expense has been deleted.');
        return;
      }
      router.push(`/receipt-details/${receiptId}`);
    } catch (error) {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, receiptDeleted: true } : m)));
      Alert.alert('Expense Deleted', 'This expense has been deleted.');
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isProcessing) return;

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      text: text,
      isUser: true,
      timestamp: new Date(),
    };
    setMessages(prev => [userMessage, ...prev]);
    setInputText('');
    setIsProcessing(true);

    // 滚动到底部
    setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);

    // 识别：先试一次，可重试错误则后台静默重试直至成功；内容质量差则直接提示重新提交
    const recognizeFn = () => {
      if (voucherType === 'invoice') return recognizeVoucherFromText(text, 'invoice');
      if (voucherType === 'inbound') return recognizeInboundFromText(text);
      if (voucherType === 'outbound') return recognizeOutboundFromText(text);
      return recognizeReceiptFromText(text);
    };

    const addTextSuccess = async (result: Awaited<ReturnType<typeof recognizeFn>>) => {
      const scrollToBottom = () => setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
      if (voucherType === 'invoice') {
        const invoice = await convertGeminiResultToInvoice(result as Awaited<ReturnType<typeof recognizeVoucherFromText>>);
        const invoiceToSave = { ...invoice, status: 'pending' as const, inputType: 'text' as const };
        const invoiceId = await saveInvoice(invoiceToSave);
        const previewMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: '',
          isUser: false,
          timestamp: new Date(),
          invoicePreview: {
            ...invoiceToSave,
            id: invoiceId,
            status: 'pending',
            account: (result as Awaited<ReturnType<typeof recognizeVoucherFromText>>).paymentAccountName ? { id: invoice.accountId || '', spaceId: invoice.spaceId, name: (result as Awaited<ReturnType<typeof recognizeVoucherFromText>>).paymentAccountName!, isAiRecognized: true } : undefined,
          } as Invoice,
          voucherType: 'invoice',
        };
        setMessages(prev => [previewMessage, ...prev]);
        await saveChatLog({ receiptId: undefined, voucherType: 'invoice', type: 'text', modelName: 'gemini', prompt: text, response: '', requestData: { rawText: text }, responseData: { invoicePreview: previewMessage.invoicePreview }, success: true });
      } else if (voucherType === 'inbound') {
        const inbound = await convertGeminiResultToInbound(result as Awaited<ReturnType<typeof recognizeInboundFromText>>);
        const inboundToSave = { ...inbound, status: 'pending' as const, inputType: 'text' as const };
        const inboundId = await saveInbound(inboundToSave);
        const previewMessage: Message = { id: (Date.now() + 1).toString(), text: '', isUser: false, timestamp: new Date(), inboundPreview: { ...inboundToSave, id: inboundId, status: 'pending' }, voucherType: 'inbound' };
        setMessages(prev => [previewMessage, ...prev]);
        await saveChatLog({ receiptId: undefined, voucherType: 'inbound', type: 'text', modelName: 'gemini', prompt: text, response: '', requestData: { rawText: text }, responseData: { inboundPreview: previewMessage.inboundPreview }, success: true });
      } else if (voucherType === 'outbound') {
        const outbound = await convertGeminiResultToOutbound(result as Awaited<ReturnType<typeof recognizeOutboundFromText>>);
        const outboundToSave = { ...outbound, status: 'pending' as const, inputType: 'text' as const };
        const outboundId = await saveOutbound(outboundToSave);
        const previewMessage: Message = { id: (Date.now() + 1).toString(), text: '', isUser: false, timestamp: new Date(), outboundPreview: { ...outboundToSave, id: outboundId, status: 'pending' }, voucherType: 'outbound' };
        setMessages(prev => [previewMessage, ...prev]);
        await saveChatLog({ receiptId: undefined, voucherType: 'outbound', type: 'text', modelName: 'gemini', prompt: text, response: '', requestData: { rawText: text }, responseData: { outboundPreview: previewMessage.outboundPreview }, success: true });
      } else {
        const receipt = await convertGeminiResultToReceipt(result as Awaited<ReturnType<typeof recognizeReceiptFromText>>);
        const receiptToSave = { ...receipt, status: 'pending' as ReceiptStatus, inputType: 'text' as const };
        const receiptId = await saveReceipt(receiptToSave);
        const previewMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: '',
          isUser: false,
          timestamp: new Date(),
          receiptPreview: {
            ...receiptToSave,
            id: receiptId,
            status: 'pending' as ReceiptStatus,
            account: (result as Awaited<ReturnType<typeof recognizeReceiptFromText>>).paymentAccountName ? { id: receipt.accountId || '', spaceId: receipt.spaceId, name: (result as Awaited<ReturnType<typeof recognizeReceiptFromText>>).paymentAccountName!, isAiRecognized: true } : undefined,
          },
        };
        setMessages(prev => [previewMessage, ...prev]);
        await saveChatLog({ receiptId, voucherType: 'receipt', type: 'text', modelName: 'gemini', prompt: text, response: previewMessage.text, requestData: { rawText: text }, responseData: { receiptPreview: previewMessage.receiptPreview }, success: true });
      }
      scrollToBottom();
    };

    try {
      const first = await runWithRecognitionRetry(recognizeFn as () => Promise<Awaited<ReturnType<typeof recognizeFn>>>, { maxAttempts: 1 });
      if (first.success) {
        if (isRecognitionResultUnrecognizable(first.result)) {
          const errorMessage: Message = { id: (Date.now() + 1).toString(), text: '❌ Content unclear or not recognized. Please resubmit.', isUser: false, timestamp: new Date() };
          setMessages(prev => [errorMessage, ...prev]);
          setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
          return;
        }
        await addTextSuccess(first.result);
        return;
      }
      if (first.isContentQuality) {
        const errorMessage: Message = { id: (Date.now() + 1).toString(), text: `❌ ${getUserFacingMessage(first)}`, isUser: false, timestamp: new Date() };
        setMessages(prev => [errorMessage, ...prev]);
        setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
        return;
      }
      // 可重试错误：先解除 loading，后台静默重试直至成功
      setIsProcessing(false);
      runWithRecognitionRetry(recognizeFn as () => Promise<Awaited<ReturnType<typeof recognizeFn>>>, { maxAttempts: 4, delayMs: 2000 }).then(async (r) => {
        if (!mountedRef.current) return;
        if (r.success) {
          if (isRecognitionResultUnrecognizable(r.result)) {
            const errorMessage: Message = { id: (Date.now() + 1).toString(), text: '❌ Content unclear or not recognized. Please resubmit.', isUser: false, timestamp: new Date() };
            setMessages(prev => [errorMessage, ...prev]);
            setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
            return;
          }
          await addTextSuccess(r.result);
        } else {
          const errorMessage: Message = { id: (Date.now() + 1).toString(), text: `❌ ${getUserFacingMessage(r)}`, isUser: false, timestamp: new Date() };
          setMessages(prev => [errorMessage, ...prev]);
          setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
        }
      });
      return;
    } catch (error) {
      console.error('Error processing text:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `❌ ${error instanceof Error ? error.message : 'Failed to recognize from text'}`,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [errorMessage, ...prev]);
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
    } finally {
      setIsProcessing(false);
    }
  };

  // 开始录音
  const handleStartRecording = async () => {
    // 防止重复触发
    if (isRecordingRef.current || isStartingRecording.current || isProcessing) {
      console.log('handleStartRecording: already recording or starting, skip');
      return;
    }
    
    isStartingRecording.current = true;
    console.log('handleStartRecording: starting...');
    
    try {
      const hasPermission = await requestAudioPermission();
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Please allow microphone access to use voice input.');
        return;
      }

      const started = await startRecording();
      if (started) {
        isRecordingRef.current = true;
        recordingDurationRef.current = 0;
        setIsRecording(true);
        setRecordingDuration(0);
        
        // 开始计时
        recordingTimer.current = setInterval(() => {
          recordingDurationRef.current += 1;
          setRecordingDuration(prev => prev + 1);
        }, 1000);
        
        // 录音动画（脉动效果）
        Animated.loop(
          Animated.sequence([
            Animated.timing(recordingAnimation, {
              toValue: 1.2,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(recordingAnimation, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        ).start();
        
        console.log('handleStartRecording: recording started successfully');
      }
    } finally {
      isStartingRecording.current = false;
    }
  };

  // 停止录音并发送
  const handleStopRecording = async () => {
    console.log('handleStopRecording: called, isRecordingRef=', isRecordingRef.current);
    
    // 使用 ref 检查，避免闭包问题
    if (!isRecordingRef.current) {
      console.log('handleStopRecording: not recording, skip');
      return;
    }
    
    // 立即标记为不再录音
    isRecordingRef.current = false;
    
    // 停止计时和动画
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
    recordingAnimation.stopAnimation();
    recordingAnimation.setValue(1);
    setIsRecording(false);
    
    const duration = recordingDurationRef.current;
    console.log('handleStopRecording: duration=', duration);
    
    // 录音时长太短（小于3秒），取消
    if (duration < 3) {
      await cancelRecording();
      showToast('Recording too short');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // 停止录音获取本地文件
      const localUri = await stopRecording();
      if (!localUri) {
        throw new Error('Failed to get recording');
      }

      // 添加用户语音消息（先显示，稍后更新 audioUrl）
      const userMessageId = Date.now().toString();
      const userMessage: Message = {
        id: userMessageId,
        text: `🎤 Voice (${duration}s)`,
        isUser: true,
        timestamp: new Date(),
        audioUrl: localUri, // 暂用本地 URI，上传后更新
      };
      setMessages(prev => [userMessage, ...prev]);
      
      // 滚动到底部
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);

      // 上传录音文件
      const audioUrl = await uploadAudioFile(localUri);
      if (!audioUrl) {
        throw new Error('Failed to upload audio');
      }
      
      // 更新消息中的 audioUrl
      setMessages(prev => prev.map(msg => 
        msg.id === userMessageId ? { ...msg, audioUrl } : msg
      ));

      // 识别：先试一次，可重试错误则后台静默重试直至成功；内容质量差则直接提示重新提交
      const recognizeFn = () => {
        if (voucherType === 'invoice') return recognizeVoucherFromAudio(localUri, 'invoice');
        if (voucherType === 'inbound') return recognizeInboundFromAudio(localUri);
        if (voucherType === 'outbound') return recognizeOutboundFromAudio(localUri);
        return recognizeReceiptFromAudio(localUri);
      };

      const addVoiceSuccess = async (result: Awaited<ReturnType<typeof recognizeFn>>) => {
        const scrollToBottom = () => setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
        if (voucherType === 'invoice') {
          const invoice = await convertGeminiResultToInvoice(result as Awaited<ReturnType<typeof recognizeVoucherFromAudio>>);
          const invoiceToSave = { ...invoice, status: 'pending' as const, inputType: 'audio' as const };
          const invoiceId = await saveInvoice(invoiceToSave);
          const previewMessage: Message = {
            id: (Date.now() + 1).toString(),
            text: '',
            isUser: false,
            timestamp: new Date(),
            invoicePreview: {
              ...invoiceToSave,
              id: invoiceId,
              status: 'pending',
              account: (result as Awaited<ReturnType<typeof recognizeVoucherFromAudio>>).paymentAccountName ? { id: invoice.accountId || '', spaceId: invoice.spaceId, name: (result as Awaited<ReturnType<typeof recognizeVoucherFromAudio>>).paymentAccountName!, isAiRecognized: true } : undefined,
            } as Invoice,
            voucherType: 'invoice',
          };
          setMessages(prev => [previewMessage, ...prev]);
          await saveChatLog({ receiptId: undefined, voucherType: 'invoice', type: 'audio', modelName: 'gemini', prompt: `Voice input (${duration}s)`, response: '', requestData: { audioUrl }, responseData: { invoicePreview: previewMessage.invoicePreview }, success: true, audioUrl });
        } else if (voucherType === 'inbound') {
          const inbound = await convertGeminiResultToInbound(result as Awaited<ReturnType<typeof recognizeInboundFromAudio>>);
          const inboundToSave = { ...inbound, status: 'pending' as const, inputType: 'audio' as const };
          const inboundId = await saveInbound(inboundToSave);
          const previewMessage: Message = { id: (Date.now() + 1).toString(), text: '', isUser: false, timestamp: new Date(), inboundPreview: { ...inboundToSave, id: inboundId, status: 'pending' }, voucherType: 'inbound' };
          setMessages(prev => [previewMessage, ...prev]);
          await saveChatLog({ receiptId: undefined, voucherType: 'inbound', type: 'audio', modelName: 'gemini', prompt: `Voice input (${duration}s)`, response: '', requestData: { audioUrl }, responseData: { inboundPreview: previewMessage.inboundPreview }, success: true, audioUrl });
        } else if (voucherType === 'outbound') {
          const outbound = await convertGeminiResultToOutbound(result as Awaited<ReturnType<typeof recognizeOutboundFromAudio>>);
          const outboundToSave = { ...outbound, status: 'pending' as const, inputType: 'audio' as const };
          const outboundId = await saveOutbound(outboundToSave);
          const previewMessage: Message = { id: (Date.now() + 1).toString(), text: '', isUser: false, timestamp: new Date(), outboundPreview: { ...outboundToSave, id: outboundId, status: 'pending' }, voucherType: 'outbound' };
          setMessages(prev => [previewMessage, ...prev]);
          await saveChatLog({ receiptId: undefined, voucherType: 'outbound', type: 'audio', modelName: 'gemini', prompt: `Voice input (${duration}s)`, response: '', requestData: { audioUrl }, responseData: { outboundPreview: previewMessage.outboundPreview }, success: true, audioUrl });
        } else {
          const receipt = await convertGeminiResultToReceipt(result as Awaited<ReturnType<typeof recognizeReceiptFromAudio>>);
          const receiptToSave = { ...receipt, status: 'pending' as ReceiptStatus, inputType: 'audio' as const };
          const receiptId = await saveReceipt(receiptToSave);
          const previewMessage: Message = {
            id: (Date.now() + 1).toString(),
            text: '',
            isUser: false,
            timestamp: new Date(),
            receiptPreview: {
              ...receiptToSave,
              id: receiptId,
              status: 'pending' as ReceiptStatus,
              account: (result as Awaited<ReturnType<typeof recognizeReceiptFromAudio>>).paymentAccountName ? { id: receipt.accountId || '', spaceId: receipt.spaceId, name: (result as Awaited<ReturnType<typeof recognizeReceiptFromAudio>>).paymentAccountName!, isAiRecognized: true } : undefined,
            },
          };
          setMessages(prev => [previewMessage, ...prev]);
          await saveChatLog({ receiptId, voucherType: 'receipt', type: 'audio', modelName: 'gemini', prompt: `Voice input (${duration}s)`, response: previewMessage.text, requestData: { audioUrl }, responseData: { receiptPreview: previewMessage.receiptPreview }, success: true, audioUrl });
        }
        scrollToBottom();
      };

      const first = await runWithRecognitionRetry(recognizeFn as () => Promise<Awaited<ReturnType<typeof recognizeFn>>>, { maxAttempts: 1 });
      if (first.success) {
        if (isRecognitionResultUnrecognizable(first.result)) {
          const errorMessage: Message = { id: (Date.now() + 1).toString(), text: '❌ Content unclear or not recognized. Please resubmit.', isUser: false, timestamp: new Date() };
          setMessages(prev => [errorMessage, ...prev]);
          setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
          return;
        }
        await addVoiceSuccess(first.result);
        return;
      }
      if (first.isContentQuality) {
        const errorMessage: Message = { id: (Date.now() + 1).toString(), text: `❌ ${getUserFacingMessage(first)}`, isUser: false, timestamp: new Date() };
        setMessages(prev => [errorMessage, ...prev]);
        setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
        return;
      }
      // 可重试错误：先解除 loading，后台静默重试直至成功
      setIsProcessing(false);
      setRecordingDuration(0);
      recordingDurationRef.current = 0;
      runWithRecognitionRetry(recognizeFn as () => Promise<Awaited<ReturnType<typeof recognizeFn>>>, { maxAttempts: 4, delayMs: 2000 }).then(async (r) => {
        if (!mountedRef.current) return;
        if (r.success) {
          if (isRecognitionResultUnrecognizable(r.result)) {
            const errorMessage: Message = { id: (Date.now() + 1).toString(), text: '❌ Content unclear or not recognized. Please resubmit.', isUser: false, timestamp: new Date() };
            setMessages(prev => [errorMessage, ...prev]);
            setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
            return;
          }
          await addVoiceSuccess(r.result);
        } else {
          const errorMessage: Message = { id: (Date.now() + 1).toString(), text: `❌ ${getUserFacingMessage(r)}`, isUser: false, timestamp: new Date() };
          setMessages(prev => [errorMessage, ...prev]);
          setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
        }
      });
      return;
    } catch (error) {
      console.error('Error processing voice:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `❌ ${error instanceof Error ? error.message : 'Failed to recognize receipt from voice'}`,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [errorMessage, ...prev]);
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
    } finally {
      setIsProcessing(false);
      setRecordingDuration(0);
      recordingDurationRef.current = 0;
    }
  };

  // 取消录音
  const handleCancelRecording = async () => {
    isRecordingRef.current = false;
    recordingDurationRef.current = 0;
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
    recordingAnimation.stopAnimation();
    recordingAnimation.setValue(1);
    setIsRecording(false);
    setRecordingDuration(0);
    await cancelRecording();
  };

  // 播放/停止音频
  const handlePlayAudio = async (messageId: string, audioUrl: string) => {
    if (playingAudioId === messageId) {
      // 正在播放这条，停止
      await stopPlayback();
      setPlayingAudioId(null);
    } else {
      // 播放新的
      setPlayingAudioId(messageId);
      await playAudio(audioUrl, () => {
        // 播放完成后重置状态
        setPlayingAudioId(null);
      });
    }
  };

  // 格式化录音时长
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isAiInventoryType && !showAiInventory) return null;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      {/* 返回按钮 - 绝对定位在顶栏 */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={24} color="#2D3436" />
      </TouchableOpacity>

      <FlatList
        ref={listRef}
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onEndReached={loadMoreHistory}
        onEndReachedThreshold={1.2}
        ListHeaderComponent={
          isProcessing ? (
            <View style={[styles.messageContainer, styles.botMessage]}>
              <ActivityIndicator size="small" color="#6C5CE7" />
              <Text style={[styles.messageText, styles.botMessageText]}>
                Processing...
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item: message }) => (
          <View>
            {/* 用户消息上方显示时间戳 */}
            {message.isUser && (message.text || message.audioUrl) && (
              <View style={styles.timestampDivider}>
                <Text style={styles.timestampText}>
                  {format(message.timestamp, 'MMM dd, HH:mm')}
                </Text>
              </View>
            )}
            
            {/* 只在有内容时显示消息气泡 */}
            {(message.text || message.audioUrl) && (
              <View
                style={[
                  styles.messageContainer,
                  message.isUser ? styles.userMessage : styles.botMessage,
                ]}
              >
                {/* 语音消息：显示播放按钮 */}
                {message.audioUrl ? (
                  <TouchableOpacity
                    style={styles.audioMessageContent}
                    onPress={() => handlePlayAudio(message.id, message.audioUrl!)}
                  >
                    <Ionicons 
                      name={playingAudioId === message.id ? 'pause-circle' : 'play-circle'} 
                      size={32} 
                      color={message.isUser ? '#fff' : '#6C5CE7'} 
                    />
                    <Text style={[
                      styles.messageText,
                      message.isUser ? styles.userMessageText : styles.botMessageText,
                      { marginLeft: 8 }
                    ]}>
                      {message.text}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[
                    styles.messageText,
                    message.isUser ? styles.userMessageText : styles.botMessageText,
                  ]}>
                    {message.text}
                  </Text>
                )}
              </View>
            )}
            
            {/* 识别结果预览卡片 */}
            {message.receiptPreview && (
              <View style={styles.receiptPreviewCard}>
                <View style={styles.receiptPreviewHeader}>
                  <Ionicons name="receipt" size={20} color="#6C5CE7" />
                  <Text style={styles.receiptPreviewTitle}>Expenses Preview</Text>
                </View>
                <View style={styles.receiptPreviewContent}>
                  <View style={styles.receiptPreviewRow}>
                    <Text style={styles.receiptPreviewLabel}>Marked as:</Text>
                    <Text style={styles.receiptPreviewValue}>{message.receiptPreview.supplierName}</Text>
                  </View>
                  <View style={styles.receiptPreviewRow}>
                    <Text style={styles.receiptPreviewLabel}>Date:</Text>
                    <Text style={styles.receiptPreviewValue}>
                      {(() => {
                        try {
                          // 解析日期字符串为本地时区，避免 UTC 时区转换问题
                          const [year, month, day] = message.receiptPreview.date.split('-').map(Number);
                          const date = new Date(year, month - 1, day);
                          return format(date, 'MMM dd, yyyy');
                        } catch {
                          return message.receiptPreview.date;
                        }
                      })()}
                    </Text>
                  </View>
                  <View style={styles.receiptPreviewRow}>
                    <Text style={styles.receiptPreviewLabel}>Amount:</Text>
                    <AmountText
                      amount={message.receiptPreview.totalAmount}
                      currency={message.receiptPreview.currency}
                      style={[styles.receiptPreviewValue, styles.receiptPreviewAmount]}
                    />
                  </View>
                  {message.receiptPreview.account && (
                    <View style={styles.receiptPreviewRow}>
                      <Text style={styles.receiptPreviewLabel}>Account:</Text>
                      <Text style={styles.receiptPreviewValue}>
                        {message.receiptPreview.account.name}
                      </Text>
                    </View>
                  )}
                  {message.receiptPreview.items && message.receiptPreview.items.length > 0 && (
                    <View style={styles.receiptPreviewItems}>
                      <Text style={styles.receiptPreviewLabel}>Items:</Text>
                      {message.receiptPreview.items.map((item, index) => (
                        <View key={index} style={styles.receiptPreviewItemRow}>
                          <Text style={styles.receiptPreviewItemName}>{item.name}</Text>
                          <Text style={styles.receiptPreviewItemPrice}>
                            {item.price.toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.receiptPreviewActions}>
                  {/* 左侧：仅在小票未删除时展示详情按钮 */}
                  {!message.receiptDeleted && (
                    <TouchableOpacity
                      style={styles.previewActionButton}
                      onPress={() => {
                        handlePreviewDetails(message);
                      }}
                    >
                      <Ionicons name="eye-outline" size={16} color="#6C5CE7" />
                      <Text style={styles.previewActionText}>View Details</Text>
                    </TouchableOpacity>
                  )}

                  {/* 右侧按钮：根据实际状态显示“Confirm / Confirmed / Deleted” */}
                  <TouchableOpacity
                    style={[
                      styles.previewActionButton,
                      message.receiptDeleted
                        ? styles.previewActionButtonDisabled
                        : confirmedReceipts.has(message.receiptPreview!.id!) ||
                          message.receiptPreview!.status === 'confirmed'
                        ? styles.previewActionButtonConfirmed
                        : styles.previewActionButtonPrimary,
                    ]}
                    onPress={async () => {
                      if (!message.receiptPreview?.id) return;

                      // 已删除的记录，不再允许确认，直接提示
                      if (message.receiptDeleted) {
                        Alert.alert('Expense Deleted', 'This expense has been deleted.');
                        return;
                      }

                      // 如果已经确认，不做任何操作
                      if (
                        confirmedReceipts.has(message.receiptPreview.id) ||
                        message.receiptPreview.status === 'confirmed'
                      ) {
                        return;
                      }

                      try {
                        // 再次确认小票是否存在，避免已被删除的情况；与 invoice/inbound/outbound 一致，用完整对象更新，避免 supplier 被置空
                        const receipt = await getReceiptById(message.receiptPreview.id);
                        if (!receipt) {
                          setMessages((prev) =>
                            prev.map((msg) =>
                              msg.id === message.id ? { ...msg, receiptDeleted: true } : msg,
                            ),
                          );
                          Alert.alert('Expense Deleted', 'This expense has been deleted.');
                          return;
                        }

                        // 更新小票状态为已确认（传完整 receipt 与 invoice/inbound/outbound 确认逻辑一致）
                        await updateReceipt(message.receiptPreview.id, { ...receipt, status: 'confirmed' });

                        // 更新本地状态
                        setConfirmedReceipts((prev) => new Set(prev).add(message.receiptPreview!.id!));

                        // 更新消息中的 receipt 状态
                        setMessages((prev) =>
                          prev.map((msg) => {
                            if (msg.id === message.id && msg.receiptPreview) {
                              return {
                                ...msg,
                                receiptPreview: {
                                  ...msg.receiptPreview,
                                  status: 'confirmed' as ReceiptStatus,
                                },
                              };
                            }
                            return msg;
                          }),
                        );

                        // 清空输入框，准备下一条
                        setInputText('');
                        // 不自动聚焦，避免触发键盘
                      } catch (error) {
                        console.error('Error confirming receipt:', error);
                        Alert.alert('Error', 'Failed to confirm receipt. Please try again.');
                      }
                    }}
                    disabled={
                      message.receiptDeleted ||
                      confirmedReceipts.has(message.receiptPreview!.id!) ||
                      message.receiptPreview!.status === 'confirmed'
                    }
                  >
                    {message.receiptDeleted ? (
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                    ) : (
                      <Ionicons
                        name={
                          confirmedReceipts.has(message.receiptPreview!.id!) ||
                          message.receiptPreview!.status === 'confirmed'
                            ? 'checkmark-circle'
                            : 'checkmark-circle-outline'
                        }
                        size={16}
                        color="#fff"
                      />
                    )}
                    <Text style={[styles.previewActionText, styles.previewActionTextPrimary]}>
                      {message.receiptDeleted
                        ? 'Deleted'
                        : confirmedReceipts.has(message.receiptPreview!.id!) ||
                          message.receiptPreview!.status === 'confirmed'
                        ? 'Confirmed'
                        : 'Confirm'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 发票识别结果预览卡片 */}
            {message.invoicePreview && (
              <View style={styles.receiptPreviewCard}>
                <View style={styles.receiptPreviewHeader}>
                  <Ionicons name="document-text" size={20} color="#6C5CE7" />
                  <Text style={styles.receiptPreviewTitle}>Income Preview</Text>
                </View>
                <View style={styles.receiptPreviewContent}>
                  <View style={styles.receiptPreviewRow}>
                    <Text style={styles.receiptPreviewLabel}>Customer:</Text>
                    <Text style={styles.receiptPreviewValue}>{message.invoicePreview.customerName}</Text>
                  </View>
                  <View style={styles.receiptPreviewRow}>
                    <Text style={styles.receiptPreviewLabel}>Date:</Text>
                    <Text style={styles.receiptPreviewValue}>
                      {(() => {
                        try {
                          const [y, m, d] = message.invoicePreview.date.split('-').map(Number);
                          return format(new Date(y, m - 1, d), 'MMM dd, yyyy');
                        } catch {
                          return message.invoicePreview.date;
                        }
                      })()}
                    </Text>
                  </View>
                  <View style={styles.receiptPreviewRow}>
                    <Text style={styles.receiptPreviewLabel}>Amount:</Text>
                    <AmountText
                      amount={message.invoicePreview.totalAmount}
                      currency={message.invoicePreview.currency}
                      style={[styles.receiptPreviewValue, styles.receiptPreviewAmount, { color: '#D35400' }]}
                    />
                  </View>
                  {message.invoicePreview.account && (
                    <View style={styles.receiptPreviewRow}>
                      <Text style={styles.receiptPreviewLabel}>Account:</Text>
                      <Text style={styles.receiptPreviewValue}>{message.invoicePreview.account.name}</Text>
                    </View>
                  )}
                  {message.invoicePreview.items && message.invoicePreview.items.length > 0 && (
                    <View style={styles.receiptPreviewItems}>
                      <Text style={styles.receiptPreviewLabel}>Items:</Text>
                      {message.invoicePreview.items.map((item, index) => (
                        <View key={index} style={styles.receiptPreviewItemRow}>
                          <Text style={styles.receiptPreviewItemName}>{item.name}</Text>
                          <Text style={[styles.receiptPreviewItemPrice, { color: '#D35400' }]}>{item.price.toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.receiptPreviewActions}>
                  {!message.invoiceDeleted && (
                    <TouchableOpacity style={styles.previewActionButton} onPress={() => handlePreviewDetails(message)}>
                      <Ionicons name="eye-outline" size={16} color="#6C5CE7" />
                      <Text style={styles.previewActionText}>View Details</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.previewActionButton,
                      message.invoiceDeleted ? styles.previewActionButtonDisabled
                        : confirmedInvoices.has(message.invoicePreview!.id!) || message.invoicePreview!.status === 'confirmed'
                        ? styles.previewActionButtonConfirmed
                        : styles.previewActionButtonPrimary,
                    ]}
                    onPress={async () => {
                      if (!message.invoicePreview?.id) return;
                      if (message.invoiceDeleted) return;
                      if (confirmedInvoices.has(message.invoicePreview.id) || message.invoicePreview.status === 'confirmed') return;
                      try {
                        const fullInvoice = await getInvoiceById(message.invoicePreview.id);
                        if (!fullInvoice) {
                          Alert.alert('Error', 'Income not found.');
                          return;
                        }
                        await saveInvoice({ ...fullInvoice, status: 'confirmed' });
                        setConfirmedInvoices((prev) => new Set(prev).add(message.invoicePreview!.id!));
                        setMessages((prev) => prev.map((msg) =>
                          msg.id === message.id && msg.invoicePreview
                            ? { ...msg, invoicePreview: { ...msg.invoicePreview, status: 'confirmed' as const } }
                            : msg
                        ));
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Failed to confirm invoice.';
                        Alert.alert('Error', msg);
                      }
                    }}
                    disabled={message.invoiceDeleted || confirmedInvoices.has(message.invoicePreview!.id!) || message.invoicePreview!.status === 'confirmed'}
                  >
                    <Ionicons name={confirmedInvoices.has(message.invoicePreview!.id!) || message.invoicePreview!.status === 'confirmed' ? 'checkmark-circle' : 'checkmark-circle-outline'} size={16} color="#fff" />
                    <Text style={[styles.previewActionText, styles.previewActionTextPrimary]}>
                      {message.invoiceDeleted ? 'Deleted' : confirmedInvoices.has(message.invoicePreview!.id!) || message.invoicePreview!.status === 'confirmed' ? 'Confirmed' : 'Confirm'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 入库单识别结果预览卡片 */}
            {message.inboundPreview && (
              <View style={styles.receiptPreviewCard}>
                <View style={styles.receiptPreviewHeader}>
                  <Ionicons name="arrow-down-circle" size={20} color="#6C5CE7" />
                  <Text style={styles.receiptPreviewTitle}>Inbound Preview</Text>
                </View>
                <View style={styles.receiptPreviewContent}>
                  <View style={styles.receiptPreviewRow}>
                    <Text style={styles.receiptPreviewLabel}>Supplier:</Text>
                    <Text style={styles.receiptPreviewValue}>{message.inboundPreview.supplierName || '—'}</Text>
                  </View>
                  <View style={styles.receiptPreviewRow}>
                    <Text style={styles.receiptPreviewLabel}>Date:</Text>
                    <Text style={styles.receiptPreviewValue}>
                      {(() => {
                        try {
                          const [y, m, d] = message.inboundPreview.date.split('-').map(Number);
                          return format(new Date(y, m - 1, d), 'MMM dd, yyyy');
                        } catch {
                          return message.inboundPreview.date;
                        }
                      })()}
                    </Text>
                  </View>
                  {(message.inboundPreview.totalAmount != null && message.inboundPreview.totalAmount > 0) && (
                    <View style={styles.receiptPreviewRow}>
                      <Text style={styles.receiptPreviewLabel}>Amount:</Text>
                      <AmountText
                        amount={message.inboundPreview.totalAmount ?? 0}
                        currency={message.inboundPreview.currency}
                        style={[styles.receiptPreviewValue, styles.receiptPreviewAmount]}
                      />
                    </View>
                  )}
                  {message.inboundPreview.items && message.inboundPreview.items.length > 0 && (
                    <View style={styles.receiptPreviewItems}>
                      <Text style={styles.receiptPreviewLabel}>Items:</Text>
                      {message.inboundPreview.items.map((item, index) => (
                        <View key={index} style={styles.receiptPreviewItemRow}>
                          <Text style={styles.receiptPreviewItemName}>{item.productName ?? ''}</Text>
                          <Text style={styles.receiptPreviewItemPrice}>
                            {item.quantity} {item.unit ?? '件'}{item.unitPrice != null ? ` @ ${item.unitPrice.toFixed(2)}` : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.receiptPreviewActions}>
                  {!message.inboundDeleted && (
                    <TouchableOpacity style={styles.previewActionButton} onPress={() => handlePreviewDetails(message)}>
                      <Ionicons name="eye-outline" size={16} color="#6C5CE7" />
                      <Text style={styles.previewActionText}>View Details</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.previewActionButton,
                      message.inboundDeleted ? styles.previewActionButtonDisabled
                        : confirmedInbounds.has(message.inboundPreview!.id!) || message.inboundPreview!.status === 'confirmed'
                        ? styles.previewActionButtonConfirmed
                        : styles.previewActionButtonPrimary,
                    ]}
                    onPress={async () => {
                      if (!message.inboundPreview?.id) return;
                      if (message.inboundDeleted) return;
                      if (confirmedInbounds.has(message.inboundPreview.id) || message.inboundPreview.status === 'confirmed') return;
                      try {
                        const full = await getInboundById(message.inboundPreview.id);
                        if (!full) { Alert.alert('Error', 'Inbound not found.'); return; }
                        await saveInbound({ ...full, status: 'confirmed' });
                        setConfirmedInbounds((prev) => new Set(prev).add(message.inboundPreview!.id!));
                        setMessages((prev) => prev.map((msg) =>
                          msg.id === message.id && msg.inboundPreview ? { ...msg, inboundPreview: { ...msg.inboundPreview, status: 'confirmed' as const } } : msg
                        ));
                      } catch (e) {
                        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to confirm inbound.');
                      }
                    }}
                    disabled={message.inboundDeleted || confirmedInbounds.has(message.inboundPreview!.id!) || message.inboundPreview!.status === 'confirmed'}
                  >
                    <Ionicons name={confirmedInbounds.has(message.inboundPreview!.id!) || message.inboundPreview!.status === 'confirmed' ? 'checkmark-circle' : 'checkmark-circle-outline'} size={16} color="#fff" />
                    <Text style={[styles.previewActionText, styles.previewActionTextPrimary]}>
                      {message.inboundDeleted ? 'Deleted' : confirmedInbounds.has(message.inboundPreview!.id!) || message.inboundPreview!.status === 'confirmed' ? 'Confirmed' : 'Confirm'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 出库单识别结果预览卡片 */}
            {message.outboundPreview && (
              <View style={styles.receiptPreviewCard}>
                <View style={styles.receiptPreviewHeader}>
                  <Ionicons name="arrow-up-circle" size={20} color="#6C5CE7" />
                  <Text style={styles.receiptPreviewTitle}>Outbound Preview</Text>
                </View>
                <View style={styles.receiptPreviewContent}>
                  <View style={styles.receiptPreviewRow}>
                    <Text style={styles.receiptPreviewLabel}>Customer:</Text>
                    <Text style={styles.receiptPreviewValue}>{message.outboundPreview.customerName || '—'}</Text>
                  </View>
                  <View style={styles.receiptPreviewRow}>
                    <Text style={styles.receiptPreviewLabel}>Date:</Text>
                    <Text style={styles.receiptPreviewValue}>
                      {(() => {
                        try {
                          const [y, m, d] = message.outboundPreview.date.split('-').map(Number);
                          return format(new Date(y, m - 1, d), 'MMM dd, yyyy');
                        } catch {
                          return message.outboundPreview.date;
                        }
                      })()}
                    </Text>
                  </View>
                  {(message.outboundPreview.totalAmount != null && message.outboundPreview.totalAmount > 0) && (
                    <View style={styles.receiptPreviewRow}>
                      <Text style={styles.receiptPreviewLabel}>Amount:</Text>
                      <AmountText
                        amount={message.outboundPreview.totalAmount ?? 0}
                        currency={message.outboundPreview.currency}
                        style={[styles.receiptPreviewValue, styles.receiptPreviewAmount, { color: '#D35400' }]}
                      />
                    </View>
                  )}
                  {message.outboundPreview.items && message.outboundPreview.items.length > 0 && (
                    <View style={styles.receiptPreviewItems}>
                      <Text style={styles.receiptPreviewLabel}>Items:</Text>
                      {message.outboundPreview.items.map((item, index) => (
                        <View key={index} style={styles.receiptPreviewItemRow}>
                          <Text style={styles.receiptPreviewItemName}>{item.productName ?? ''}</Text>
                          <Text style={[styles.receiptPreviewItemPrice, { color: '#D35400' }]}>
                            {item.quantity} {item.unit ?? '件'}{item.unitPrice != null ? ` @ ${item.unitPrice.toFixed(2)}` : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.receiptPreviewActions}>
                  {!message.outboundDeleted && (
                    <TouchableOpacity style={styles.previewActionButton} onPress={() => handlePreviewDetails(message)}>
                      <Ionicons name="eye-outline" size={16} color="#6C5CE7" />
                      <Text style={styles.previewActionText}>View Details</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.previewActionButton,
                      message.outboundDeleted ? styles.previewActionButtonDisabled
                        : confirmedOutbounds.has(message.outboundPreview!.id!) || message.outboundPreview!.status === 'confirmed'
                        ? styles.previewActionButtonConfirmed
                        : styles.previewActionButtonPrimary,
                    ]}
                    onPress={async () => {
                      if (!message.outboundPreview?.id) return;
                      if (message.outboundDeleted) return;
                      if (confirmedOutbounds.has(message.outboundPreview.id) || message.outboundPreview.status === 'confirmed') return;
                      try {
                        const full = await getOutboundById(message.outboundPreview.id);
                        if (!full) { Alert.alert('Error', 'Outbound not found.'); return; }
                        await saveOutbound({ ...full, status: 'confirmed' });
                        setConfirmedOutbounds((prev) => new Set(prev).add(message.outboundPreview!.id!));
                        setMessages((prev) => prev.map((msg) =>
                          msg.id === message.id && msg.outboundPreview ? { ...msg, outboundPreview: { ...msg.outboundPreview, status: 'confirmed' as const } } : msg
                        ));
                      } catch (e) {
                        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to confirm outbound.');
                      }
                    }}
                    disabled={message.outboundDeleted || confirmedOutbounds.has(message.outboundPreview!.id!) || message.outboundPreview!.status === 'confirmed'}
                  >
                    <Ionicons name={confirmedOutbounds.has(message.outboundPreview!.id!) || message.outboundPreview!.status === 'confirmed' ? 'checkmark-circle' : 'checkmark-circle-outline'} size={16} color="#fff" />
                    <Text style={[styles.previewActionText, styles.previewActionTextPrimary]}>
                      {message.outboundDeleted ? 'Deleted' : confirmedOutbounds.has(message.outboundPreview!.id!) || message.outboundPreview!.status === 'confirmed' ? 'Confirmed' : 'Confirm'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
          </View>
        )}
      >
      </FlatList>

      {/* Toast 提示 - 显示在输入区域上方 */}
      {toastMessage && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      <View style={[styles.inputContainer, { paddingBottom: Platform.OS === 'ios' ? (keyboardHeight ? keyboardHeight + 20 : 20) : (keyboardHeight ? keyboardHeight + 16 : 16) }]}>
        {/* 语音/键盘切换按钮 */}
        <TouchableOpacity
          style={styles.modeToggleButton}
          onPress={() => {
            setIsVoiceMode(!isVoiceMode);
            if (!isVoiceMode) {
              Keyboard.dismiss();
            }
          }}
          disabled={isProcessing || isRecording}
        >
          {isVoiceMode ? (
            <MaterialCommunityIcons name="keyboard-outline" size={24} color="#6C5CE7" />
          ) : (
            <Ionicons name="mic-outline" size={24} color="#6C5CE7" />
          )}
        </TouchableOpacity>

        {isVoiceMode ? (
          // Voice mode: tap to start/stop OR hold to talk
          <Pressable
            style={({ pressed }) => [
              styles.voiceButton,
              isRecording && styles.voiceButtonRecording,
              pressed && !isRecording && styles.voiceButtonPressed,
            ]}
            onPressIn={() => {
              // 记录按下时间
              pressStartTime.current = Date.now();
              isLongPressMode.current = false;
            }}
            onLongPress={() => {
              // 长按模式：开始录音
              if (!isRecordingRef.current && !isProcessing) {
                isLongPressMode.current = true;
                handleStartRecording();
              }
            }}
            onPressOut={() => {
              const pressDuration = Date.now() - pressStartTime.current;
              
              if (isLongPressMode.current && isRecordingRef.current) {
                // 长按模式：松手停止并提交
                handleStopRecording();
              } else if (pressDuration < 500) {
                // 短按模式：点击切换录音状态
                if (isRecordingRef.current) {
                  // 正在录音，停止并提交
                  handleStopRecording();
                } else if (!isProcessing) {
                  // 未在录音，开始录音
                  isLongPressMode.current = false;
                  handleStartRecording();
                }
              }
            }}
            delayLongPress={500}
            disabled={isProcessing}
          >
            {isRecording ? (
              <Animated.View style={{ transform: [{ scale: recordingAnimation }] }}>
                <View style={styles.voiceButtonContent}>
                  <Ionicons name="mic" size={24} color="#E74C3C" />
                  <Text style={styles.voiceButtonTextRecording}>
                    {formatDuration(recordingDuration)} - Tap to send
                  </Text>
                </View>
              </Animated.View>
            ) : (
              <View style={styles.voiceButtonContent}>
                <Ionicons name="mic-outline" size={24} color="#636E72" />
                <Text style={styles.voiceButtonText}>Tap or hold to record</Text>
              </View>
            )}
          </Pressable>
        ) : (
          // 文字模式：输入框
          <View style={styles.inputWrapper}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Describe your expenses..."
              placeholderTextColor="#95A5A6"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              editable={!isProcessing}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              onFocus={() => {
                setTimeout(() => {
                  listRef.current?.scrollToOffset({ offset: 0, animated: true });
                }, 100);
              }}
            />
            {inputText.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setInputText('')}
              >
                <Ionicons name="close-circle" size={20} color="#95A5A6" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 发送按钮（仅文字模式显示） */}
        {!isVoiceMode && (
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isProcessing) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  toast: {
    alignSelf: 'center',
    backgroundColor: 'rgba(45, 52, 54, 0.9)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 16 : 16,
    right: 16,
    zIndex: 1000,
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    padding: 12,
    paddingBottom: 16,
  },
  messageContainer: {
    maxWidth: '80%',
    marginBottom: 8,
    padding: 10,
    borderRadius: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#6C5CE7',
    borderBottomRightRadius: 4,
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#fff',
  },
  botMessageText: {
    color: '#2D3436',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingRight: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#2D3436',
  },
  clearButton: {
    padding: 4,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#BDC3C7',
  },
  timestampDivider: {
    alignItems: 'flex-end',
    marginTop: 12,
    marginBottom: 4,
    marginRight: 16,
  },
  timestampText: {
    fontSize: 11,
    color: '#95A5A6',
    fontWeight: '400',
  },
  receiptPreviewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginLeft: 16,
    marginRight: 16,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  receiptPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  receiptPreviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
  },
  receiptPreviewContent: {
    marginBottom: 8,
  },
  receiptPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  receiptPreviewLabel: {
    fontSize: 14,
    color: '#636E72',
    fontWeight: '500',
  },
  receiptPreviewValue: {
    fontSize: 14,
    color: '#2D3436',
    fontWeight: '600',
  },
  receiptPreviewAmount: {
    color: '#6C5CE7',
    fontSize: 16,
  },
  receiptPreviewItems: {
    marginTop: 8,
  },
  receiptPreviewItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingLeft: 8,
  },
  receiptPreviewItemName: {
    fontSize: 13,
    color: '#2D3436',
    flex: 1,
  },
  receiptPreviewItemPrice: {
    fontSize: 13,
    color: '#636E72',
    fontWeight: '500',
    marginLeft: 8,
  },
  receiptPreviewActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  previewActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6C5CE7',
    gap: 6,
  },
  previewActionButtonPrimary: {
    backgroundColor: '#6C5CE7',
    borderColor: '#6C5CE7',
  },
  previewActionButtonConfirmed: {
    backgroundColor: '#00B894',
    borderColor: '#00B894',
  },
  previewActionButtonDisabled: {
    backgroundColor: '#BDC3C7',
    borderColor: '#BDC3C7',
  },
  previewActionText: {
    fontSize: 14,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  previewActionTextPrimary: {
    color: '#fff',
  },
  // 语音模式相关样式
  modeToggleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButton: {
    flex: 1,
    height: 44,
    backgroundColor: '#F8F9FA',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButtonRecording: {
    backgroundColor: '#FFEBEE',
    borderColor: '#E74C3C',
  },
  voiceButtonPressed: {
    backgroundColor: '#F0F0F0',
    borderColor: '#6C5CE7',
  },
  voiceButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceButtonText: {
    fontSize: 15,
    color: '#636E72',
    fontWeight: '500',
  },
  voiceButtonTextRecording: {
    fontSize: 15,
    color: '#E74C3C',
    fontWeight: '600',
  },
  audioMessageContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
