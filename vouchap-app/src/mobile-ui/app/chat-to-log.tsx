import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Keyboard,
  Animated,
  InteractionManager,
  Image,
  Modal,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { recognizeReceipt, recognizeReceiptFromDocument, recognizeReceiptFromText, recognizeReceiptFromAudio, recognizeVoucherFromText, recognizeVoucherFromAudio, recognizeInvoiceFromDocument, recognizeInboundFromText, recognizeInboundFromAudio, recognizeOutboundFromText, recognizeOutboundFromAudio, recognizeInboundFromImage, recognizeOutboundFromImage, recognizeInboundFromDocument, recognizeOutboundFromDocument } from '@/lib/gemini';
import { runWithRecognitionRetry, getUserFacingMessage } from '@/lib/recognition-retry';
import { saveReceipt, updateReceipt, getReceiptById } from '@/lib/database';
import { checkDuplicateReceipt } from '@/lib/receipt-duplicate-checker';
import { saveInvoice, getInvoiceById } from '@/lib/invoices';
import { saveInbound, getInboundById } from '@/lib/inbound';
import { saveOutbound, getOutboundById } from '@/lib/outbound';
import { saveChatLog, getChatLogsPaginated, VoucherLogType } from '@/lib/chat-logs';
import { showAiInventory, showTaxFiling } from '@/lib/feature-flags';
import { getCurrentSpace } from '@/lib/auth';
import { uploadTaxFilingFile, uploadReceiptImageTempWithSpace } from '@/lib/supabase';
import { getProjectById, getProjectTodosTree, createProjectTodoAttachment, updateProjectTodoAttachment, type ProjectTodoNode } from '@/lib/firm';
import { classifyTaxDocumentAndPickTask } from '@/lib/tax-filing-task-matcher';
import { runTaxFilingRecognition } from '@/lib/tax-filing-recognition-run';
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
import { showToast } from '@/lib/toast';
import { useChatPanel } from '../contexts/ChatPanelContext';

// 语音识别置信度阈值：与照片 needs_retake 一致，低于此值视为无可识别内容，提示重新提交
const VOICE_CONFIDENCE_THRESHOLD = 0.4;

/** 语音/文字识别结果置信度过低（噪音/乱码/无可识别内容）时视为不可用，不保存记录 */
function isRecognitionResultUnrecognizable(result: { confidence?: number }): boolean {
  const c = result.confidence;
  if (c === undefined) return false;
  return c < VOICE_CONFIDENCE_THRESHOLD;
}

/** 是否图片类型（用于展示缩略图 vs 文档图标） */
const isImageMime = (mime?: string) => !mime || mime.startsWith('image/');
/** 是否 PDF（按文件名或 mime） */
const isPdfFile = (name?: string, mime?: string) =>
  (name?.toLowerCase().endsWith('.pdf')) || mime === 'application/pdf';

/** 在浏览器新标签或系统外部应用中打开文件链接（统一 PDF 打开行为） */
const openFileUrlExternal = (url: string) => {
  if (!url) return;
  if (Platform.OS === 'web') {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // ignore
    }
  } else {
    Linking.openURL(url).catch(() => {});
  }
};

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
  /** attachments 类型：报税附件上传记录，用于跳转 project/attachment（放在「收到消息」卡片）；imageUrl 用于聊天内就地小图预览 */
  attachmentPreview?: { id: string; projectId: string; todoId: string; name: string; summary?: string | null; imageUrl?: string | null };
  /** attachments 类型：发出消息中预览的图片 URL */
  attachmentImageUrl?: string | null;
  receiptDeleted?: boolean;
  invoiceDeleted?: boolean;
  inboundDeleted?: boolean;
  outboundDeleted?: boolean;
  voucherType?: VoucherLogType; // 当前记录类别，用于详情跳转
  audioUrl?: string;
  /** 录音时长（秒），用于展示 "Voice input (Xs)" */
  audioDurationSeconds?: number;
  /** 用户发出的图片消息：聊天记录中显示小图预览，文件名弱化 */
  imageUrl?: string | null;
  isPlayingAudio?: boolean;
  /** 多文件提交时：上传完成、识别中，占位预览卡片 loading */
  previewCardLoading?: boolean;
}

export function ChatToLogContent(props: { voucherType: VoucherLogType }) {
  return <ChatToLogScreen voucherType={props.voucherType} />;
}

function ChatToLogScreen(props: { voucherType?: VoucherLogType }) {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ type?: string; drawer?: string; projectId?: string; todoId?: string }>();
  const chatPanel = useChatPanel();
  const voucherType: VoucherLogType =
    props.voucherType
      ?? ((params.type === 'invoice' || params.type === 'inbound' || params.type === 'outbound' || params.type === 'tax-filing' || params.type === 'attachments')
        ? (params.type === 'attachments' ? 'tax-filing' : (params.type as VoucherLogType))
        : 'receipt');
  const isAttachmentsType = voucherType === 'tax-filing';
  const isAiInventoryType = voucherType === 'inbound' || voucherType === 'outbound';
  const isDrawer = Platform.OS === 'web' && params.drawer === '1';
  const isPanel = props.voucherType !== undefined;

  // 根据类型动态设置标题；Web 右侧栏模式隐藏 Stack 顶栏；嵌入 layout 面板时不改当前页 setOptions
  useEffect(() => {
    if (isPanel) return;
    if (isDrawer) {
      navigation.setOptions({ headerShown: false });
      return;
    }
    let title = 'Chat to Log';
    if (voucherType === 'invoice') {
      title = 'Chat to Log Income';
    } else if (voucherType === 'inbound') {
      title = 'Chat to Log Inbound';
    } else if (voucherType === 'outbound') {
      title = 'Chat to Log Outbound';
    } else if (voucherType === 'tax-filing') {
      title = 'Attachments';
    } else {
      title = 'Chat to Log Expenses';
    }
    navigation.setOptions({ title });
  }, [voucherType, navigation, isDrawer, isPanel]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmedReceipts, setConfirmedReceipts] = useState<Set<string>>(new Set());
  const [confirmedInvoices, setConfirmedInvoices] = useState<Set<string>>(new Set());
  const [confirmedInbounds, setConfirmedInbounds] = useState<Set<string>>(new Set());
  const [confirmedOutbounds, setConfirmedOutbounds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Message[]>([]);
  const effectiveProjectId = params.projectId ?? chatPanel?.attachmentContext?.projectId;
  /** tax-filing 模式：项目下的 task 列表，用于识别文件类别后自动匹配关联 */
  const [attachmentTaskOptions, setAttachmentTaskOptions] = useState<{ id: string; title: string }[]>([]);
  const [stagedAttachmentFiles, setStagedAttachmentFiles] = useState<{ id: string; uri: string; name?: string; mimeType?: string }[]>([]);
  /** 当前正在上传/识别的暂存文件 id，用于按文件显示 loading */
  const [uploadingStagedIds, setUploadingStagedIds] = useState<Set<string>>(new Set());
  /** 聊天记录中点击附件预览图时，在弹层中展示大图 */
  const [attachmentImageModalUrl, setAttachmentImageModalUrl] = useState<string | null>(null);
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
  
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  
  // 组件挂载状态，后台重试完成后仅在校验通过后更新 UI
  const mountedRef = useRef(true);

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

  // 从 FAB 展开栏带过来的预填输入与已选图片（打开右栏时填入）
  useEffect(() => {
    if (!isPanel || !chatPanel) return;
    if (chatPanel.initialInput) {
      setInputText(chatPanel.initialInput);
      chatPanel.setInitialInput(null);
    }
    if (chatPanel.initialStagedFiles?.length) {
      setStagedAttachmentFiles(prev => [...(chatPanel.initialStagedFiles ?? []), ...prev]);
      chatPanel.setInitialStagedFiles(null);
    }
  }, [isPanel, chatPanel?.initialInput, chatPanel?.initialStagedFiles]);

  // 右栏模式：注册聚焦回调，供 openPanel 后激活输入框
  useEffect(() => {
    if (!isPanel || !chatPanel?.inputFocusRef) return;
    chatPanel.inputFocusRef.current = () => inputRef.current?.focus();
    return () => {
      if (chatPanel?.inputFocusRef) chatPanel.inputFocusRef.current = null;
    };
  }, [isPanel, chatPanel]);

  // attachments 模式：有 projectId 时加载 task 列表（用于识别文件后自动匹配）
  useEffect(() => {
    if (!isAttachmentsType || !effectiveProjectId) return;
    let cancelled = false;
    (async () => {
      try {
        const project = await getProjectById(effectiveProjectId);
        if (!project || cancelled) return;
        const tree = await getProjectTodosTree(project.orderId);
        const tasks: { id: string; title: string }[] = [];
        function walk(nodes: ProjectTodoNode[]) {
          nodes.forEach((n) => {
            if (n.itemKind === 'task') tasks.push({ id: n.id, title: n.title });
            walk(n.children);
          });
        }
        walk(tree);
        if (!cancelled) setAttachmentTaskOptions(tasks);
      } catch {
        if (!cancelled) setAttachmentTaskOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isAttachmentsType, effectiveProjectId]);

  // 提交类别选单打开时：点击选单外区域收起（仅 Web）
  useEffect(() => {
    if (Platform.OS !== 'web' || !showTypeDropdown) return;
    const handler = (e: PointerEvent) => {
      const el = document.getElementById('chat-to-log-type-dropdown');
      if (el && !el.contains(e.target as Node)) setShowTypeDropdown(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showTypeDropdown]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const current = messagesRef.current;
      const hasPreviews = current.some(
        (m) => m.receiptPreview?.id || m.invoicePreview?.id || m.inboundPreview?.id || m.outboundPreview?.id || m.attachmentPreview?.id,
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
        console.log('[chat-to-log] loadInitialHistory start', {
          voucherType,
          effectiveProjectId,
        });
        // 报税附件模式下：为兼容尚未完全迁移的历史数据，这里不再依赖后端按 voucherType / projectId 精确过滤，
        // 而是先取当前空间最近若干条记录，再在前端按 voucherType 做一次过滤。
        const projectFilter = voucherType === 'tax-filing' ? effectiveProjectId : undefined;
        const rawLogs = await getChatLogsPaginated(
          5,
          undefined,
          voucherType === 'tax-filing' ? undefined : voucherType,
          voucherType === 'tax-filing' ? undefined : projectFilter,
        );
        const logs =
          voucherType === 'tax-filing'
            ? (rawLogs || []).filter((log) =>
                log.voucherType === 'tax-filing' ||
                !!log.responseData?.attachmentPreview ||
                !!log.requestData?.todoId,
              )
            : rawLogs;
        console.log('[chat-to-log] loadInitialHistory got logs', {
          total: rawLogs?.length ?? 0,
          afterFilter: logs?.length ?? 0,
          sample: logs?.[0],
        });

        if (!logs || logs.length === 0) {
          let welcomeText: string;
          if (voucherType === 'tax-filing') {
            welcomeText = 'Upload tax documents (image or PDF). Each file will be automatically classified and attached to the matching task. You can upload multiple files; they will be processed one by one.';
          } else if (voucherType === 'invoice') {
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
            const requestImageUrl = log.type === 'image' && log.requestData?.imageUrl ? log.requestData.imageUrl : undefined;
            const voiceDuration = log.requestData?.audioDurationSeconds ?? (log.audioUrl && log.prompt ? (() => { const m = log.prompt.match(/Voice input \((\d+)s\)/); return m ? parseInt(m[1], 10) : undefined; })() : undefined);
            restoredMessages.push({
              id: `${log.id}-prompt`,
              text: log.audioUrl ? `🎤 Voice` : log.prompt,
              isUser: true,
              timestamp: new Date(log.createdAt),
              audioUrl: log.audioUrl ?? undefined,
              audioDurationSeconds: voiceDuration,
              imageUrl: requestImageUrl,
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
          } else if (log.responseData?.attachmentPreview && logType === 'tax-filing') {
            const preview = log.responseData.attachmentPreview as { id: string; projectId: string; todoId: string; name: string; summary?: string | null; imageUrl?: string | null };
            restoredMessages.push({
              id: `${log.id}-preview`,
              text: '',
              isUser: false,
              timestamp: new Date(log.createdAt),
              attachmentPreview: preview,
              voucherType: 'tax-filing',
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
          if (voucherType === 'tax-filing') welcomeText = 'Upload tax documents (image or PDF). Each file will be automatically classified and attached to the matching task. You can upload multiple files; they will be processed one by one.';
          else if (voucherType === 'invoice') welcomeText = 'Hi! Describe your income (sale / money received). I\'ll extract customer, amount, and items.';
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
        console.log('[chat-to-log] loadInitialHistory done', {
          voucherType,
          effectiveProjectId,
        });
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
  }, [voucherType, effectiveProjectId]);

  // 往上滑（看更早消息）时提前加载历史，由 FlatList onEndReached 触发
  const loadMoreHistory = useCallback(async () => {
    if (!hasMoreHistory || isLoadingHistory || !oldestLoadedAt) return;
    try {
      setIsLoadingHistory(true);
      const projectFilter = voucherType === 'tax-filing' ? effectiveProjectId : undefined;
      console.log('[chat-to-log] loadMoreHistory start', {
        voucherType,
        effectiveProjectId,
        oldestLoadedAt,
      });
      const rawMoreLogs = await getChatLogsPaginated(
        20,
        oldestLoadedAt,
        voucherType === 'tax-filing' ? undefined : voucherType,
        voucherType === 'tax-filing' ? undefined : projectFilter,
      );
      const moreLogs =
        voucherType === 'tax-filing'
          ? (rawMoreLogs || []).filter((log) =>
              log.voucherType === 'tax-filing' ||
              !!log.responseData?.attachmentPreview ||
              !!log.requestData?.todoId,
            )
          : rawMoreLogs;
      console.log('[chat-to-log] loadMoreHistory got logs', {
        total: rawMoreLogs?.length ?? 0,
        afterFilter: moreLogs?.length ?? 0,
      });

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
        } else if (log.responseData?.attachmentPreview && logType === 'tax-filing') {
          const preview = log.responseData.attachmentPreview as { id: string; projectId: string; todoId: string; name: string; summary?: string | null; imageUrl?: string | null };
          moreMessagesRaw.push({
            id: `${log.id}-preview`,
            text: '',
            isUser: false,
            timestamp: new Date(log.createdAt),
            attachmentPreview: preview,
            voucherType: 'tax-filing',
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
          const requestImageUrl = log.type === 'image' && log.requestData?.imageUrl ? log.requestData.imageUrl : undefined;
          moreMessagesRaw.push({
            id: `${log.id}-prompt`,
            text: log.prompt,
            isUser: true,
            timestamp: new Date(log.createdAt),
            imageUrl: requestImageUrl,
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
          showToast('This income has been deleted.', 'info');
          return;
        }
        router.push(`/invoice-details/${invoiceId}`);
      } catch (error) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, invoiceDeleted: true } : m)));
        showToast('This income has been deleted.', 'info');
      }
      return;
    }
    const inboundId = message.inboundPreview?.id;
    if (inboundId) {
      try {
        const inbound = await getInboundById(inboundId);
        if (!inbound) {
          setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, inboundDeleted: true } : m)));
          showToast('This inbound has been deleted.', 'info');
          return;
        }
        router.push(`/inbound-details/${inboundId}`);
      } catch (error) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, inboundDeleted: true } : m)));
        showToast('This inbound has been deleted.', 'info');
      }
      return;
    }
    const outboundId = message.outboundPreview?.id;
    if (outboundId) {
      try {
        const outbound = await getOutboundById(outboundId);
        if (!outbound) {
          setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, outboundDeleted: true } : m)));
          showToast('This outbound has been deleted.', 'info');
          return;
        }
        router.push(`/outbound-details/${outboundId}`);
      } catch (error) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, outboundDeleted: true } : m)));
        showToast('This outbound has been deleted.', 'info');
      }
      return;
    }
    const attachmentPreview = message.attachmentPreview;
    if (attachmentPreview?.id && attachmentPreview?.projectId) {
      router.push(`/tax-filing/project/${attachmentPreview.projectId}/attachment/${attachmentPreview.id}`);
      return;
    }
    const receiptId = message.receiptPreview?.id;
    if (!receiptId) return;
    try {
      const receipt = await getReceiptById(receiptId);
      if (!receipt) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, receiptDeleted: true } : m)));
        showToast('This expense has been deleted.', 'info');
        return;
      }
      router.push(`/receipt-details/${receiptId}`);
    } catch (error) {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, receiptDeleted: true } : m)));
      showToast('This expense has been deleted.', 'info');
    }
  };

  /** Web：文件 input 选图+PDF+文档；移动端：仅相册选图。 */
  const pickImagesForSend = useCallback(async () => {
    if (isProcessing) return;
    if (voucherType === 'tax-filing' && !effectiveProjectId) {
      showToast('Open from a tax-filing project to attach files.', 'info');
      return;
    }
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      input.multiple = true;
      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const files = target.files;
        if (!files?.length) return;
        const now = Date.now();
        const next = Array.from(files).map((f, i) => ({
          id: `web-${now}-${i}-${f.name}`,
          uri: URL.createObjectURL(f),
          name: f.name,
          mimeType: f.type || undefined,
        }));
        setStagedAttachmentFiles(prev => [...prev, ...next]);
        setIsVoiceMode(false);
      };
      input.click();
      return;
    }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast('Photo library access is required to add images.', 'info');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      const now = Date.now();
      setStagedAttachmentFiles(prev => [
        ...prev,
        ...result.assets.map((a, i: number) => ({
          id: `${a.uri}-${now}-${i}`,
          uri: a.uri,
          name: (a.fileName != null ? a.fileName : `image-${i + 1}.jpg`),
          mimeType: 'image/jpeg' as const,
        })),
      ]);
      setIsVoiceMode(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to add files', 'error');
    }
  }, [effectiveProjectId, isProcessing, voucherType]);

  const handleSend = async () => {
    const text = inputText.trim();
    const hasStaged = stagedAttachmentFiles.length > 0;
    if ((!text && !hasStaged) || isProcessing) return;

    // 有暂存图片：按文件分别上传/识别，每文件单独预览框与 loading
    if (hasStaged) {
      const toUpload = [...stagedAttachmentFiles];
      const userInstructions = text || undefined;
      setInputText('');
      setIsProcessing(true);
      setUploadingStagedIds(new Set(toUpload.map((f) => f.id)));
      const scrollToBottom = () => setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
      try {
        // 优先用缓存，避免移动端 forceRefresh 时拿不到 currentSpaceId 导致多文件提交报 No space context
        let space = await getCurrentSpace(false);
        if (!space?.id) space = await getCurrentSpace(true);
        const clientSpaceId = space?.id ?? '';
        if (!clientSpaceId) {
          showToast('No space context.', 'error');
          setUploadingStagedIds(new Set());
          setIsProcessing(false);
          return;
        }
        if (voucherType === 'tax-filing') {
          const projectId = effectiveProjectId;
          if (!projectId || attachmentTaskOptions.length === 0) {
            showToast(attachmentTaskOptions.length === 0 ? 'Loading project tasks…' : 'Open from a tax-filing project to attach files.', 'info');
            setUploadingStagedIds(new Set());
            setIsProcessing(false);
            return;
          }
        }
        for (let i = 0; i < toUpload.length; i++) {
          const file = toUpload[i];
          const removeFromStaged = () => {
            setStagedAttachmentFiles((prev) => prev.filter((x) => x.id !== file.id));
            setUploadingStagedIds((prev) => {
              const s = new Set(prev);
              s.delete(file.id);
              return s;
            });
          };
          const appendMessages = (msgs: Message[]) => {
            setMessages((prev) => [...msgs, ...prev]);
            scrollToBottom();
          };
          try {
            const isImage = !file.mimeType || file.mimeType.startsWith('image/');
            if (voucherType === 'tax-filing') {
              const projectId = effectiveProjectId!;
              const project = await getProjectById(projectId);
              const projectContext = { taxCountry: project?.taxCountry ?? null, taxScenario: project?.taxScenario ?? null };
              let fileUrl: string;
              let todoId: string;
              if (isImage) {
                fileUrl = await uploadTaxFilingFile(file.uri, `chat-attach-${Date.now()}-${i}`, clientSpaceId);
                const classified = await classifyTaxDocumentAndPickTask(fileUrl, projectContext, attachmentTaskOptions);
                todoId = classified.taskId;
              } else {
                fileUrl = await uploadTaxFilingFile(file.uri, `chat-attach-${Date.now()}-${i}`, clientSpaceId, { fileName: file.name, mimeType: file.mimeType });
                todoId = attachmentTaskOptions[0]?.id ?? '';
                if (!todoId) {
                  showToast('No task available for document.', 'error');
                  removeFromStaged();
                  appendMessages([{ id: `attach-err-${file.id}`, text: `❌ ${file.name ?? 'File'} failed`, isUser: false, timestamp: new Date() }]);
                  continue;
                }
              }
              const createResult = await createProjectTodoAttachment(todoId, fileUrl, { status: 'PENDING_AI' });
              if ('error' in createResult) {
                showToast(`Upload failed: ${createResult.error.message}`, 'error');
                removeFromStaged();
                appendMessages([{ id: `attach-err-${file.id}`, text: `❌ ${file.name ?? 'File'} failed`, isUser: false, timestamp: new Date() }]);
                continue;
              }
              const attachmentId = createResult.id;
              const name = file.name ?? `File ${i + 1}`;
              const loadingCardId = `attach-preview-loading-${file.id}`;
              // tax-filing 模块也复用「提交记录」样式：图片类在紫色气泡中展示缩略图 + 文件名
              const userMsg: Message = {
                id: `attach-user-${attachmentId}`,
                text: name,
                isUser: true,
                timestamp: new Date(),
                imageUrl: isImage ? file.uri : undefined,
              };
              const loadingCardMsg: Message = { id: loadingCardId, text: '', isUser: false, timestamp: new Date(), previewCardLoading: true };
              removeFromStaged();
              appendMessages([loadingCardMsg, userMsg]);
              let summary: string | null = null;
              try {
                const taskTitle = attachmentTaskOptions.find((t) => t.id === todoId)?.title ?? '';
                const recognition = await runTaxFilingRecognition(fileUrl, { country: (project?.taxCountry === 'USA' ? 'USA' : 'CANADA') as 'CANADA' | 'USA', taxScenario: project?.taxScenario ?? '' }, taskTitle ? { task: taskTitle } : undefined, userInstructions, isImage ? undefined : (file.mimeType ?? undefined));
                await updateProjectTodoAttachment(attachmentId, { summary: recognition.summary, doc_type: recognition.doc_type, extracted_data: recognition.extracted_data, status: 'PROCESSED' });
                summary = recognition.summary;
              } catch (_) {}
              const previewPayload = { id: attachmentId, projectId, todoId, name, summary, imageUrl: fileUrl };
              const previewMsg: Message = { id: `attach-preview-${attachmentId}`, text: '', isUser: false, timestamp: new Date(), attachmentPreview: previewPayload, voucherType: 'tax-filing' };
              setMessages((prev) => prev.map((m) => (m.id === loadingCardId ? previewMsg : m)));
              await saveChatLog({
                receiptId: undefined,
                projectId,
                voucherType: 'tax-filing',
                type: 'image',
                modelName: 'tax-filing',
                prompt: userInstructions ? `Uploaded: ${name}. Note: ${userInstructions}` : `Uploaded: ${name}`,
                response: '',
                requestData: { todoId, fileName: name },
                responseData: { attachmentPreview: previewPayload },
                success: true,
                attachmentUrl: fileUrl,
              });
            } else if (voucherType === 'receipt' || voucherType === 'invoice') {
              const name = file.name ?? `File ${i + 1}`;
              const loadingCardId = `img-preview-loading-${file.id}`;
              const userMsg: Message = {
                id: `img-user-${file.id}`,
                text: name,
                isUser: true,
                timestamp: new Date(),
                // 恢复提交记录中带缩略图的样式：图片用本地 uri 作为气泡缩略图
                imageUrl: isImage ? file.uri : undefined,
              };
              const loadingCardMsg: Message = { id: loadingCardId, text: '', isUser: false, timestamp: new Date(), previewCardLoading: true };
              removeFromStaged();
              appendMessages([loadingCardMsg, userMsg]);
              const tempFileName = `chat-${voucherType}-${Date.now()}-${i}`;
              let fileUrl: string;
              if (isImage) {
                fileUrl = await uploadReceiptImageTempWithSpace(file.uri, tempFileName, clientSpaceId);
              } else {
                fileUrl = await uploadReceiptImageTempWithSpace(file.uri, tempFileName, clientSpaceId, { fileName: file.name, mimeType: file.mimeType });
              }
              const recognizeFn = voucherType === 'receipt'
                ? () => (isImage ? recognizeReceipt(fileUrl) : recognizeReceiptFromDocument(fileUrl, file.mimeType))
                : () => (isImage ? recognizeReceipt(fileUrl) : recognizeInvoiceFromDocument(fileUrl, file.mimeType));
              const first = await runWithRecognitionRetry(recognizeFn as () => Promise<Awaited<ReturnType<typeof recognizeReceipt>>>, { maxAttempts: 3, delayMs: 1500 });
              if (!first.success) {
                const errText = first.isContentQuality ? '❌ Content unclear or not recognized. Please resubmit.' : `❌ ${getUserFacingMessage(first)}`;
                setMessages((prev) => prev.map((m) => (m.id === loadingCardId ? { id: m.id, text: errText, isUser: false, timestamp: new Date() } : m)));
                continue;
              }
              if (isRecognitionResultUnrecognizable(first.result)) {
                setMessages((prev) => prev.map((m) => (m.id === loadingCardId ? { id: m.id, text: '❌ Content unclear or not recognized. Please resubmit.', isUser: false, timestamp: new Date() } : m)));
                continue;
              }
              if (voucherType === 'invoice') {
                const invoice = await convertGeminiResultToInvoice(first.result as any);
                const invoiceToSave = { ...invoice, inputType: (isImage ? 'image' : 'document') as 'image' | 'document', imageUrl: fileUrl };
                const invoiceId = await saveInvoice(invoiceToSave);
                const previewMessage: Message = { id: `img-preview-${file.id}`, text: '', isUser: false, timestamp: new Date(), invoicePreview: { ...invoiceToSave, id: invoiceId, status: invoice.status, account: (first.result as any).paymentAccountName ? { id: invoice.accountId || '', spaceId: invoice.spaceId, name: (first.result as any).paymentAccountName!, isAiRecognized: true } : undefined } as Invoice, voucherType: 'invoice' };
                setMessages((prev) => prev.map((m) => (m.id === loadingCardId ? previewMessage : m)));
                await saveChatLog({ receiptId: undefined, voucherType: 'invoice', type: 'image', modelName: 'gemini', prompt: name, response: '', requestData: { imageUrl: fileUrl }, responseData: { invoicePreview: previewMessage.invoicePreview }, success: true });
              } else {
                const receipt = await convertGeminiResultToReceipt(first.result);
                const receiptToSave = { ...receipt, inputType: (isImage ? 'image' : 'document') as 'image' | 'document', imageUrl: fileUrl };
                const receiptId = await saveReceipt(receiptToSave);
                let receiptStatus: ReceiptStatus = receipt.status;
                const savedReceipt = await getReceiptById(receiptId);
                if (savedReceipt) {
                  const duplicateReceipt = await checkDuplicateReceipt(savedReceipt);
                  if (duplicateReceipt) {
                    await updateReceipt(receiptId, { status: 'duplicate' }, true);
                    receiptStatus = 'duplicate';
                  }
                }
                const previewMessage: Message = { id: `img-preview-${file.id}`, text: '', isUser: false, timestamp: new Date(), receiptPreview: { ...receiptToSave, id: receiptId, status: receiptStatus, account: (first.result as any).paymentAccountName ? { id: receipt.accountId || '', spaceId: receipt.spaceId, name: (first.result as any).paymentAccountName!, isAiRecognized: true } : undefined } };
                setMessages((prev) => prev.map((m) => (m.id === loadingCardId ? previewMessage : m)));
                await saveChatLog({ receiptId, voucherType: 'receipt', type: 'image', modelName: 'gemini', prompt: name, response: '', requestData: { imageUrl: fileUrl }, responseData: { receiptPreview: previewMessage.receiptPreview }, success: true });
              }
            } else if (voucherType === 'inbound' || voucherType === 'outbound') {
              const name = file.name ?? `File ${i + 1}`;
              const loadingCardId = `img-preview-loading-${file.id}`;
              const userMsg: Message = {
                id: `img-user-${file.id}`,
                text: name,
                isUser: true,
                timestamp: new Date(),
                imageUrl: isImage ? file.uri : undefined,
              };
              const loadingCardMsg: Message = { id: loadingCardId, text: '', isUser: false, timestamp: new Date(), previewCardLoading: true };
              removeFromStaged();
              appendMessages([loadingCardMsg, userMsg]);
              const tempFileName = `chat-${voucherType}-${Date.now()}-${i}`;
              let fileUrl: string;
              if (isImage) {
                fileUrl = await uploadReceiptImageTempWithSpace(file.uri, tempFileName, clientSpaceId);
              } else {
                fileUrl = await uploadReceiptImageTempWithSpace(file.uri, tempFileName, clientSpaceId, { fileName: file.name, mimeType: file.mimeType });
              }
              try {
                if (voucherType === 'inbound') {
                  const recognizedData = isImage ? await recognizeInboundFromImage(fileUrl) : await recognizeInboundFromDocument(fileUrl, file.mimeType);
                  const inbound = await convertGeminiResultToInbound(recognizedData);
                  const inboundToSave = { ...inbound, inputType: (isImage ? 'image' : 'document') as 'image' | 'document', imageUrl: fileUrl };
                  const inboundId = await saveInbound(inboundToSave);
                  const previewMessage: Message = { id: `img-preview-${file.id}`, text: '', isUser: false, timestamp: new Date(), inboundPreview: { ...inboundToSave, id: inboundId } as Inbound, voucherType: 'inbound' };
                  setMessages((prev) => prev.map((m) => (m.id === loadingCardId ? previewMessage : m)));
                  await saveChatLog({ receiptId: undefined, voucherType: 'inbound', type: 'image', modelName: 'gemini', prompt: name, response: '', requestData: { imageUrl: fileUrl }, responseData: { inboundPreview: previewMessage.inboundPreview }, success: true });
                } else {
                  const recognizedData = isImage ? await recognizeOutboundFromImage(fileUrl) : await recognizeOutboundFromDocument(fileUrl, file.mimeType);
                  const outbound = await convertGeminiResultToOutbound(recognizedData);
                  const outboundToSave = { ...outbound, inputType: (isImage ? 'image' : 'document') as 'image' | 'document', imageUrl: fileUrl };
                  const outboundId = await saveOutbound(outboundToSave);
                  const previewMessage: Message = { id: `img-preview-${file.id}`, text: '', isUser: false, timestamp: new Date(), outboundPreview: { ...outboundToSave, id: outboundId } as Outbound, voucherType: 'outbound' };
                  setMessages((prev) => prev.map((m) => (m.id === loadingCardId ? previewMessage : m)));
                  await saveChatLog({ receiptId: undefined, voucherType: 'outbound', type: 'image', modelName: 'gemini', prompt: name, response: '', requestData: { imageUrl: fileUrl }, responseData: { outboundPreview: previewMessage.outboundPreview }, success: true });
                }
              } catch (err) {
                const errText = err instanceof Error ? err.message : 'Recognition failed.';
                setMessages((prev) => prev.map((m) => (m.id === loadingCardId ? { id: m.id, text: `❌ ${errText}`, isUser: false, timestamp: new Date() } : m)));
              }
            } else {
              showToast('File upload for this type is not supported yet.', 'info');
              removeFromStaged();
            }
          } catch (e) {
            showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
            removeFromStaged();
            appendMessages([{ id: `img-err-${file.id}`, text: `❌ ${file.name ?? 'File'} failed`, isUser: false, timestamp: new Date() }]);
          } finally {
            if (Platform.OS === 'web' && typeof file.uri === 'string' && file.uri.startsWith('blob:')) {
              URL.revokeObjectURL(file.uri);
            }
          }
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
      } finally {
        setUploadingStagedIds(new Set());
        setIsProcessing(false);
      }
      return;
    }

    // 纯文字：attachments 类型仅支持图片提交
    if (voucherType === 'tax-filing') {
      showToast('Add images from a tax-filing project to submit.', 'info');
      return;
    }
    const userMessage: Message = { id: Date.now().toString(), text: text, isUser: true, timestamp: new Date() };
    setMessages(prev => [userMessage, ...prev]);
    setInputText('');
    setIsProcessing(true);
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
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
        showToast('Please allow microphone access to use voice input.', 'info');
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
        audioDurationSeconds: duration,
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
          await saveChatLog({ receiptId: undefined, voucherType: 'invoice', type: 'audio', modelName: 'gemini', prompt: `Voice input (${duration}s)`, response: '', requestData: { audioDurationSeconds: duration }, responseData: { invoicePreview: previewMessage.invoicePreview }, success: true, attachmentUrl: audioUrl });
        } else if (voucherType === 'inbound') {
          const inbound = await convertGeminiResultToInbound(result as Awaited<ReturnType<typeof recognizeInboundFromAudio>>);
          const inboundToSave = { ...inbound, status: 'pending' as const, inputType: 'audio' as const };
          const inboundId = await saveInbound(inboundToSave);
          const previewMessage: Message = { id: (Date.now() + 1).toString(), text: '', isUser: false, timestamp: new Date(), inboundPreview: { ...inboundToSave, id: inboundId, status: 'pending' }, voucherType: 'inbound' };
          setMessages(prev => [previewMessage, ...prev]);
          await saveChatLog({ receiptId: undefined, voucherType: 'inbound', type: 'audio', modelName: 'gemini', prompt: `Voice input (${duration}s)`, response: '', requestData: { audioDurationSeconds: duration }, responseData: { inboundPreview: previewMessage.inboundPreview }, success: true, attachmentUrl: audioUrl });
        } else if (voucherType === 'outbound') {
          const outbound = await convertGeminiResultToOutbound(result as Awaited<ReturnType<typeof recognizeOutboundFromAudio>>);
          const outboundToSave = { ...outbound, status: 'pending' as const, inputType: 'audio' as const };
          const outboundId = await saveOutbound(outboundToSave);
          const previewMessage: Message = { id: (Date.now() + 1).toString(), text: '', isUser: false, timestamp: new Date(), outboundPreview: { ...outboundToSave, id: outboundId, status: 'pending' }, voucherType: 'outbound' };
          setMessages(prev => [previewMessage, ...prev]);
          await saveChatLog({ receiptId: undefined, voucherType: 'outbound', type: 'audio', modelName: 'gemini', prompt: `Voice input (${duration}s)`, response: '', requestData: { audioDurationSeconds: duration }, responseData: { outboundPreview: previewMessage.outboundPreview }, success: true, attachmentUrl: audioUrl });
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
          await saveChatLog({ receiptId, voucherType: 'receipt', type: 'audio', modelName: 'gemini', prompt: `Voice input (${duration}s)`, response: previewMessage.text, requestData: { audioDurationSeconds: duration }, responseData: { receiptPreview: previewMessage.receiptPreview }, success: true, attachmentUrl: audioUrl });
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

  const drawerHeader = (
    <View style={drawerStyles.header}>
      <View style={drawerStyles.toggleRow}>
        <TouchableOpacity
          style={[drawerStyles.toggleTab, voucherType === 'invoice' && drawerStyles.toggleTabActive]}
          onPress={() => router.replace('/chat-to-log?type=invoice&drawer=1')}
        >
          <Text style={[drawerStyles.toggleText, voucherType === 'invoice' && drawerStyles.toggleTextActive]}>Income</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[drawerStyles.toggleTab, voucherType === 'receipt' && drawerStyles.toggleTabActive]}
          onPress={() => router.replace('/chat-to-log?drawer=1')}
        >
          <Text style={[drawerStyles.toggleText, voucherType === 'receipt' && drawerStyles.toggleTextActive]}>Expenses</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={drawerStyles.closeButton} onPress={() => router.back()}>
        <Ionicons name="close" size={24} color="#2D3436" />
      </TouchableOpacity>
    </View>
  );

  const mainContent = (
    <>
      <Modal visible={!!attachmentImageModalUrl} transparent animationType="fade">
        <Pressable style={styles.attachmentImageModalBackdrop} onPress={() => setAttachmentImageModalUrl(null)}>
          <View style={styles.attachmentImageModalContent}>
            {attachmentImageModalUrl ? (
              <Image source={{ uri: attachmentImageModalUrl }} style={styles.attachmentImageModalImage} resizeMode="contain" />
            ) : null}
          </View>
          <TouchableOpacity style={styles.attachmentImageModalClose} onPress={() => setAttachmentImageModalUrl(null)}>
            <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
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
        ListHeaderComponent={null}
        renderItem={({ item: message }) => (
          <View>
            {/* 用户消息上方显示时间戳 */}
            {message.isUser && (message.text || message.audioUrl || message.imageUrl) && (
              <View style={styles.timestampDivider}>
                <Text style={styles.timestampText}>
                  {format(message.timestamp, 'MMM dd, HH:mm')}
                </Text>
              </View>
            )}
            
            {/* 只在有内容时显示消息气泡 */}
            {(message.text || message.audioUrl || message.imageUrl) && (
              <View
                style={[
                  styles.messageContainer,
                  message.isUser ? styles.userMessage : styles.botMessage,
                ]}
              >
                {/* 语音消息：显示播放按钮 */}
                {message.audioUrl ? (
                  <TouchableOpacity
                    style={styles.userVoiceMessageContent}
                    onPress={() => handlePlayAudio(message.id, message.audioUrl!)}
                  >
                    <View style={styles.userVoiceMessageIcon}>
                      <Ionicons
                        name={playingAudioId === message.id ? 'pause-circle' : 'play-circle'}
                        size={32}
                        color="#fff"
                      />
                    </View>
                    <Text style={styles.userVoiceMessageLabel} numberOfLines={1}>
                      Voice input ({message.audioDurationSeconds ?? 0}s)
                    </Text>
                  </TouchableOpacity>
                ) : message.imageUrl ? (
                  <View style={styles.userImageMessageContent}>
                    <TouchableOpacity onPress={() => setAttachmentImageModalUrl(message.imageUrl!)} activeOpacity={0.9}>
                      <Image source={{ uri: message.imageUrl }} style={[styles.userMessageImageThumb, styles.thumbAlignTopLeft]} resizeMode="cover" />
                    </TouchableOpacity>
                    <Text style={styles.userMessageImageName} numberOfLines={1} ellipsizeMode="tail">{message.text}</Text>
                  </View>
                ) : message.isUser && message.text && /\.(pdf|docx?)$/i.test(message.text) ? (
                  <View style={styles.userImageMessageContent}>
                    <View style={styles.userMessageDocIconWrap}>
                      <Ionicons name={/\.pdf$/i.test(message.text) ? 'document-text-outline' : 'document-outline'} size={28} color="rgba(255,255,255,0.9)" />
                    </View>
                    <Text style={styles.userMessageImageName} numberOfLines={1} ellipsizeMode="tail">{message.text}</Text>
                  </View>
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
            
            {/* 预览卡片 loading 占位（仅 spinner，不显示 Processing 文案） */}
            {message.previewCardLoading && (
              <View style={[styles.receiptPreviewCard, { minHeight: 72, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="small" color="#6C5CE7" />
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
                  {message.outboundPreview?.imageUrl && isPdfFile(message.outboundPreview.imageUrl) && (
                    <TouchableOpacity
                      style={styles.previewFileLinkRow}
                      onPress={() => message.outboundPreview?.imageUrl && openFileUrlExternal(message.outboundPreview.imageUrl)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="document-text-outline" size={16} color="#6C5CE7" />
                      <Text style={styles.previewFileLinkText} numberOfLines={1}>Open original PDF</Text>
                    </TouchableOpacity>
                  )}
                  {message.inboundPreview?.imageUrl && isPdfFile(message.inboundPreview.imageUrl) && (
                    <TouchableOpacity
                      style={styles.previewFileLinkRow}
                      onPress={() => message.inboundPreview?.imageUrl && openFileUrlExternal(message.inboundPreview.imageUrl)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="document-text-outline" size={16} color="#6C5CE7" />
                      <Text style={styles.previewFileLinkText} numberOfLines={1}>Open original PDF</Text>
                    </TouchableOpacity>
                  )}
                  {message.invoicePreview?.imageUrl && isPdfFile(message.invoicePreview.imageUrl) && (
                    <TouchableOpacity
                      style={styles.previewFileLinkRow}
                      onPress={() => message.invoicePreview?.imageUrl && openFileUrlExternal(message.invoicePreview.imageUrl)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="document-text-outline" size={16} color="#6C5CE7" />
                      <Text style={styles.previewFileLinkText} numberOfLines={1}>Open original PDF</Text>
                    </TouchableOpacity>
                  )}
                  {/* 原始 PDF 链接：expenses 模块中统一用「打开新页签」预览 PDF */}
                  {message.receiptPreview?.imageUrl && isPdfFile(message.receiptPreview.imageUrl) && (
                    <TouchableOpacity
                      style={styles.previewFileLinkRow}
                      onPress={() => message.receiptPreview?.imageUrl && openFileUrlExternal(message.receiptPreview.imageUrl)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="document-text-outline" size={16} color="#6C5CE7" />
                      <Text style={styles.previewFileLinkText} numberOfLines={1}>Open original PDF</Text>
                    </TouchableOpacity>
                  )}
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
                        showToast('This expense has been deleted.', 'info');
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
                          showToast('This expense has been deleted.', 'info');
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
                        showToast('Failed to confirm receipt. Please try again.', 'error');
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
                          showToast('Income not found.', 'error');
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
                        showToast(msg, 'error');
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
                        if (!full) { showToast('Inbound not found.', 'error'); return; }
                        await saveInbound({ ...full, status: 'confirmed' });
                        setConfirmedInbounds((prev) => new Set(prev).add(message.inboundPreview!.id!));
                        setMessages((prev) => prev.map((msg) =>
                          msg.id === message.id && msg.inboundPreview ? { ...msg, inboundPreview: { ...msg.inboundPreview, status: 'confirmed' as const } } : msg
                        ));
                      } catch (e) {
                        showToast(e instanceof Error ? e.message : 'Failed to confirm inbound.', 'error');
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
                        if (!full) { showToast('Outbound not found.', 'error'); return; }
                        await saveOutbound({ ...full, status: 'confirmed' });
                        setConfirmedOutbounds((prev) => new Set(prev).add(message.outboundPreview!.id!));
                        setMessages((prev) => prev.map((msg) =>
                          msg.id === message.id && msg.outboundPreview ? { ...msg, outboundPreview: { ...msg.outboundPreview, status: 'confirmed' as const } } : msg
                        ));
                      } catch (e) {
                        showToast(e instanceof Error ? e.message : 'Failed to confirm outbound.', 'error');
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

            {message.attachmentPreview && (
              <View style={styles.receiptPreviewCard}>
                <View style={styles.receiptPreviewHeader}>
                  <Ionicons name="attach" size={20} color="#6C5CE7" />
                  <Text style={styles.receiptPreviewTitle}>Attachment</Text>
                </View>
                <View style={styles.receiptPreviewContent}>
                  <View style={styles.attachmentPreviewRow}>
                    {(() => {
                      const isPdf = isPdfFile(message.attachmentPreview.name);
                      const url = message.attachmentPreview.imageUrl || undefined;

                      // 非 PDF 且有图片：点击查看大图（保持现有行为）
                      if (url && !isPdf) {
                        const imgUrl = url as string;
                        return (
                          <TouchableOpacity
                            style={styles.attachmentThumbWrap}
                            onPress={() => setAttachmentImageModalUrl(imgUrl)}
                            activeOpacity={0.9}
                          >
                            <Image source={{ uri: imgUrl }} style={[styles.attachmentThumb, styles.thumbAlignTopLeft]} resizeMode="cover" />
                            <View style={styles.attachmentThumbTapHint}>
                              <Ionicons name="expand-outline" size={18} color="rgba(255,255,255,0.9)" />
                            </View>
                          </TouchableOpacity>
                        );
                      }

                      // PDF 且有 url：点击文档图标，直接在浏览器新页签打开
                      if (url && isPdf) {
                        const handleOpenPdf = () => {
                          if (Platform.OS === 'web') {
                            try {
                              window.open(url, '_blank', 'noopener,noreferrer');
                            } catch {}
                          } else {
                            Linking.openURL(url).catch(() => {});
                          }
                        };
                        return (
                          <TouchableOpacity
                            style={[styles.attachmentThumbWrap, styles.attachmentThumbDocIcon]}
                            activeOpacity={0.85}
                            onPress={handleOpenPdf}
                          >
                            <Ionicons name="document-text-outline" size={32} color="#636E72" />
                          </TouchableOpacity>
                        );
                      }

                      // 没有 url 时只显示占位图标
                      return (
                        <View style={[styles.attachmentThumbWrap, styles.attachmentThumbDocIcon]}>
                          <Ionicons name={isPdf ? 'document-text-outline' : 'document-outline'} size={32} color="#636E72" />
                        </View>
                      );
                    })()}
                    <View style={styles.attachmentPreviewMeta}>
                      {(() => {
                        const linkedTodo = attachmentTaskOptions.find(t => t.id === message.attachmentPreview!.todoId);
                        return (
                          <>
                            <Text style={styles.attachmentPreviewTodoLabel}>Task</Text>
                            <Text style={styles.attachmentPreviewTodoTitle} numberOfLines={1}>
                              {linkedTodo?.title || 'Linked task'}
                            </Text>
                          </>
                        );
                      })()}
                      <Text style={styles.attachmentPreviewName} numberOfLines={1}>{message.attachmentPreview.name}</Text>
                      {message.attachmentPreview.summary ? (
                        <Text style={styles.attachmentPreviewSummary} numberOfLines={2}>{message.attachmentPreview.summary}</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            )}
            
          </View>
        )}
      >
      </FlatList>

      <View style={[styles.inputContainer, { paddingBottom: Platform.OS === 'ios' ? (keyboardHeight ? keyboardHeight + 20 : 20) : (keyboardHeight ? keyboardHeight + 16 : 16) }]}>
        {Platform.OS === 'web' ? (
          <View style={styles.webInputOuter}>
            <View style={styles.webInputBlock}>
              {stagedAttachmentFiles.length > 0 && !isProcessing ? (
                <View style={styles.stagedFilesRow}>
                  <View style={styles.stagedFilesList}>
                    {stagedAttachmentFiles.map((f) => {
                      const uploading = uploadingStagedIds.has(f.id);
                      const isImage = isImageMime(f.mimeType);
                      return (
                        <View key={f.id} style={styles.stagedFileChip}>
                          <View style={styles.stagedFileThumbWrap}>
                            {isImage ? (
                              <Image source={{ uri: f.uri }} style={[styles.stagedFileThumb, styles.thumbAlignTopLeft]} resizeMode="cover" />
                            ) : (
                              <View style={styles.stagedFileThumbDocIcon}>
                                <Ionicons name={isPdfFile(f.name, f.mimeType) ? 'document-text-outline' : 'document-outline'} size={20} color="#636E72" />
                              </View>
                            )}
                          </View>
                          <Text style={styles.stagedFileChipText} numberOfLines={1}>{f.name ?? 'Image'}</Text>
                          {!uploading ? (
                            <TouchableOpacity
                              hitSlop={8}
                              onPress={() => setStagedAttachmentFiles(prev => prev.filter((x) => x.id !== f.id))}
                              disabled={isProcessing}
                            >
                              <Ionicons name="close-circle" size={18} color="#636E72" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}
              <View style={styles.webInputRow}>
                <View style={styles.webInputWrapper}>
                  <TextInput
                    ref={inputRef}
                    style={styles.webInput}
                    placeholder={voucherType === 'tax-filing' ? 'Add tax documents...' : voucherType === 'invoice' ? 'Describe your incomes...' : voucherType === 'inbound' ? 'Describe your inbound...' : voucherType === 'outbound' ? 'Describe your outbound...' : 'Describe your expenses...'}
                    placeholderTextColor="#95A5A6"
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    maxLength={500}
                    editable={!isProcessing}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                    blurOnSubmit={false}
                    onFocus={() => setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100)}
                  />
                </View>
              </View>
              <View style={styles.webInputActionsRow}>
                <View style={styles.webInputActionsLeft}>
                  <TouchableOpacity style={styles.webActionIcon} onPress={pickImagesForSend} disabled={isProcessing}>
                    <Ionicons name="image-outline" size={22} color="#636E72" />
                  </TouchableOpacity>
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity
                      style={[styles.webActionIcon, isRecording && styles.webActionIconRecording]}
                      onPress={() => { if (isRecordingRef.current) handleStopRecording(); else if (!isProcessing) handleStartRecording(); }}
                      disabled={isProcessing}
                    >
                      <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={22} color={isRecording ? '#E74C3C' : '#636E72'} />
                    </TouchableOpacity>
                  )}
                </View>
                {isPanel && chatPanel && (() => {
                  const typeOptions: { value: VoucherLogType; label: string }[] = [
                    { value: 'receipt', label: 'Expenses' },
                    { value: 'invoice', label: 'Incomes' },
                    ...(showAiInventory ? [{ value: 'inbound' as const, label: 'Inbound' }, { value: 'outbound' as const, label: 'Outbound' }] : []),
                    ...(showTaxFiling ? [{ value: 'tax-filing' as const, label: 'Attachments' }] : []),
                  ];
                  const currentLabel = typeOptions.find(o => o.value === voucherType)?.label ?? 'Expenses';
                  return (
                    <View style={styles.webTypeDropdownWrap} nativeID="chat-to-log-type-dropdown">
                      <Pressable
                        style={({ hovered }) => [styles.webTypeDropdownTrigger, hovered && styles.webTypeDropdownTriggerHover]}
                        onPress={() => setShowTypeDropdown(v => !v)}
                      >
                        <Text style={styles.webTypeDropdownLabel}>{currentLabel}</Text>
                        <Ionicons name={showTypeDropdown ? 'chevron-up' : 'chevron-down'} size={16} color="#636E72" />
                      </Pressable>
                      {showTypeDropdown && (
                        <View style={styles.webTypeDropdownMenu}>
                          {typeOptions.map((opt) => (
                            <Pressable
                              key={opt.value}
                              style={({ hovered }) => [
                                styles.webTypeDropdownItem,
                                voucherType === opt.value && styles.webTypeDropdownItemActive,
                                hovered && styles.webTypeDropdownItemHover,
                              ]}
                              onPress={() => { chatPanel.setType(opt.value); setShowTypeDropdown(false); }}
                            >
                              <Text style={[styles.webTypeDropdownItemText, voucherType === opt.value && styles.webTypeDropdownItemTextActive]}>{opt.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })()}
                <TouchableOpacity
                  style={[styles.webSendButton, ((!inputText.trim() && stagedAttachmentFiles.length === 0) || isProcessing) && styles.sendButtonDisabled]}
                  onPress={handleSend}
                  disabled={(!inputText.trim() && stagedAttachmentFiles.length === 0) || isProcessing}
                >
                  {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.webInputDisclaimer}>AI may make mistakes.</Text>
          </View>
        ) : (
          <View style={styles.nativeInputColumn}>
            {/* 预览区：已选图片在上方另起一行，不挤压录入框 */}
            {stagedAttachmentFiles.length > 0 && !isProcessing ? (
              <View style={styles.stagedFilesRow}>
                <View style={styles.stagedFilesList}>
                  {stagedAttachmentFiles.map((f) => {
                    const uploading = uploadingStagedIds.has(f.id);
                    const isImage = isImageMime(f.mimeType);
                    return (
                      <View key={f.id} style={styles.stagedFileChip}>
                        <View style={styles.stagedFileThumbWrap}>
                          {isImage ? (
                            <Image source={{ uri: f.uri }} style={[styles.stagedFileThumb, styles.thumbAlignTopLeft]} resizeMode="cover" />
                          ) : (
                            <View style={styles.stagedFileThumbDocIcon}>
                              <Ionicons name={isPdfFile(f.name, f.mimeType) ? 'document-text-outline' : 'document-outline'} size={20} color="#636E72" />
                            </View>
                          )}
                        </View>
                        <Text style={styles.stagedFileChipText} numberOfLines={1}>{f.name ?? 'Image'}</Text>
                        {!uploading ? (
                          <TouchableOpacity
                            hitSlop={8}
                            onPress={() => setStagedAttachmentFiles(prev => prev.filter((x) => x.id !== f.id))}
                            disabled={isProcessing}
                          >
                            <Ionicons name="close-circle" size={18} color="#636E72" />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {/* 录入行：键盘/录音 icon 左端，再图片 icon，再输入框/录音按钮，再发送 */}
            <View style={styles.nativeInputRow}>
              {!isPanel && (
                <TouchableOpacity
                  style={styles.modeToggleButton}
                  onPress={() => {
                    const nextVoice = !isVoiceMode;
                    setIsVoiceMode(nextVoice);
                    if (nextVoice) {
                      Keyboard.dismiss();
                    } else {
                      setTimeout(() => {
                        inputRef.current?.focus();
                      }, 150);
                    }
                  }}
                  disabled={isProcessing || isRecording}
                >
                  {isVoiceMode ? (
                    <MaterialCommunityIcons name="keyboard-outline" size={22} color="#6C5CE7" />
                  ) : (
                    <Ionicons name="mic-outline" size={22} color="#6C5CE7" />
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.attachIconButton} onPress={pickImagesForSend} disabled={isProcessing}>
                <Ionicons name="image-outline" size={22} color="#6C5CE7" />
              </TouchableOpacity>
              {(isVoiceMode && !isPanel) ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.voiceButton,
                    isRecording && styles.voiceButtonRecording,
                    pressed && !isRecording && styles.voiceButtonPressed,
                  ]}
                  onPressIn={() => {
                    pressStartTime.current = Date.now();
                    isLongPressMode.current = false;
                  }}
                  onLongPress={() => {
                    if (!isRecordingRef.current && !isProcessing) {
                      isLongPressMode.current = true;
                      handleStartRecording();
                    }
                  }}
                  onPressOut={() => {
                    const pressDuration = Date.now() - pressStartTime.current;
                    if (isLongPressMode.current && isRecordingRef.current) {
                      handleStopRecording();
                    } else if (pressDuration < 500) {
                      if (isRecordingRef.current) {
                        handleStopRecording();
                      } else if (!isProcessing) {
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
                        <Ionicons name="mic" size={22} color="#E74C3C" />
                        <Text style={styles.voiceButtonTextRecording}>
                          {formatDuration(recordingDuration)} - Tap to send
                        </Text>
                      </View>
                    </Animated.View>
                  ) : (
                    <View style={styles.voiceButtonContent}>
                      <Ionicons name="mic-outline" size={22} color="#636E72" />
                      <Text style={styles.voiceButtonText}>Tap or hold to record</Text>
                    </View>
                  )}
                </Pressable>
              ) : (
                <View style={styles.inputWrapper}>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder={voucherType === 'tax-filing' ? 'Add tax documents...' : voucherType === 'invoice' ? 'Describe your incomes...' : voucherType === 'inbound' ? 'Describe your inbound...' : voucherType === 'outbound' ? 'Describe your outbound...' : 'Describe your expenses...'}
                    placeholderTextColor="#95A5A6"
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    maxLength={500}
                    editable={!isProcessing}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                    blurOnSubmit={false}
                    textAlignVertical="center"
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
                      <Ionicons name="close-circle" size={18} color="#95A5A6" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {!isVoiceMode && (
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    ((!inputText.trim() && stagedAttachmentFiles.length === 0) || isProcessing) && styles.sendButtonDisabled,
                  ]}
                  onPress={handleSend}
                  disabled={(!inputText.trim() && stagedAttachmentFiles.length === 0) || isProcessing}
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
        )}
      </View>
    </>
  );

  if (isPanel) return mainContent;

  if (isDrawer) {
    return (
      <View style={drawerStyles.overlay}>
        <TouchableOpacity style={drawerStyles.backdrop} activeOpacity={1} onPress={() => router.back()} />
        <View style={drawerStyles.panel}>
          {drawerHeader}
          <View style={drawerStyles.panelBody}>{mainContent}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#2D3436" />
      </TouchableOpacity>
      {mainContent}
    </View>
  );
}

export default ChatToLogScreen;

const drawerStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    zIndex: 1000,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  panel: {
    width: 420,
    backgroundColor: '#fff',
    flexDirection: 'column',
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
  closeButton: {
    padding: 4,
  },
  panelBody: {
    flex: 1,
    minHeight: 0,
  },
});

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
  nativeInputColumn: {
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  nativeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  webInputOuter: {
    flex: 1,
    minWidth: 0,
  },
  webInputBlock: {
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    minWidth: 0,
  },
  webInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  webInputWrapper: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 0,
  },
  webInput: {
    flex: 1,
    minHeight: 24,
    maxHeight: 120,
    padding: 0,
    fontSize: 15,
    color: '#2D3436',
    outlineStyle: 'none',
  },
  webSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webInputActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  webInputActionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  webActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webActionIconRecording: {
    backgroundColor: '#FFEBEE',
  },
  webTypeDropdownWrap: {
    position: 'relative',
    marginRight: 4,
  },
  webTypeDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    minWidth: 100,
  },
  webTypeDropdownTriggerHover: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  webTypeDropdownLabel: {
    fontSize: 14,
    color: '#2D3436',
    fontWeight: '500',
  },
  webTypeDropdownMenu: {
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
  webTypeDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  webTypeDropdownItemActive: {
    backgroundColor: 'transparent',
  },
  webTypeDropdownItemHover: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  webTypeDropdownItemText: {
    fontSize: 14,
    color: '#2D3436',
  },
  webTypeDropdownItemTextActive: {
    color: '#6C5CE7',
    fontWeight: '600',
  },
  webInputDisclaimer: {
    fontSize: 12,
    color: '#95A5A6',
    textAlign: 'center',
    marginTop: 10,
  },
  attachmentsHint: {
    fontSize: 14,
    color: '#636E72',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  attachIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stagedFilesRow: {
    marginBottom: 4,
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
  stagedFileThumbDocIcon: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stagedFileChipText: {
    fontSize: 12,
    color: '#2D3436',
    flex: 1,
    minWidth: 0,
  },
  attachmentTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  attachmentTaskLabel: {
    fontSize: 14,
    color: '#636E72',
    fontWeight: '500',
  },
  attachmentTaskSelectWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attachmentTaskSelectPlaceholder: {
    fontSize: 13,
    color: '#95A5A6',
    width: '100%',
    marginBottom: 4,
  },
  attachmentTaskOption: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F3F5',
  },
  attachmentTaskOptionActive: {
    backgroundColor: '#6C5CE7',
  },
  attachmentTaskOptionText: {
    fontSize: 13,
    color: '#2D3436',
    maxWidth: 160,
  },
  attachmentTaskOptionTextActive: {
    color: '#fff',
  },
  uploadAttachmentsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#6C5CE7',
  },
  uploadAttachmentsBtnDisabled: {
    backgroundColor: '#BDC3C7',
  },
  uploadAttachmentsBtnText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingRight: 6,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#2D3436',
    borderRadius: 20,
  },
  clearButton: {
    padding: 4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    marginLeft: 0,
    marginRight: 0,
    marginBottom: 8,
    width: '90%',
    alignSelf: 'flex-start',
    padding: 11,
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
    marginBottom: 6,
    gap: 6,
  },
  receiptPreviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3436',
  },
  receiptPreviewContent: {
    marginBottom: 6,
  },
  receiptPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  receiptPreviewLabel: {
    fontSize: 12,
    color: '#636E72',
    fontWeight: '500',
  },
  receiptPreviewValue: {
    fontSize: 12,
    color: '#2D3436',
    fontWeight: '600',
  },
  receiptPreviewAmount: {
    color: '#6C5CE7',
    fontSize: 14,
  },
  previewFileLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  previewFileLinkText: {
    fontSize: 11,
    color: '#6C5CE7',
    textDecorationLine: 'underline',
  },
  receiptPreviewItems: {
    marginTop: 6,
  },
  attachmentPreviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  attachmentThumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#E9ECEF',
  },
  attachmentThumb: {
    width: '100%',
    height: '100%',
  },
  attachmentThumbDocIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentThumbTapHint: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    opacity: 0.85,
  },
  attachmentPreviewMeta: {
    flex: 1,
    minWidth: 0,
  },
  attachmentPreviewTodoLabel: {
    fontSize: 11,
    color: '#95A5A6',
    marginBottom: 2,
  },
  attachmentPreviewTodoTitle: {
    fontSize: 12,
    color: '#2D3436',
    fontWeight: '600',
    marginBottom: 4,
  },
  attachmentPreviewName: {
    fontSize: 10,
    color: '#95A5A6',
    marginBottom: 3,
  },
  attachmentPreviewSummary: {
    fontSize: 12,
    color: '#2D3436',
    lineHeight: 16,
  },
  attachmentImageModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentImageModalContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentImageModalImage: {
    width: '100%',
    height: '100%',
  },
  attachmentImageModalClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    right: 20,
  },
  receiptPreviewItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
    paddingLeft: 6,
  },
  receiptPreviewItemName: {
    fontSize: 12,
    color: '#2D3436',
    flex: 1,
  },
  receiptPreviewItemPrice: {
    fontSize: 12,
    color: '#636E72',
    fontWeight: '500',
    marginLeft: 6,
  },
  receiptPreviewActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 5,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  previewActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6C5CE7',
    gap: 5,
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
    fontSize: 12,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  previewActionTextPrimary: {
    color: '#fff',
  },
  // 语音模式相关样式
  modeToggleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButton: {
    flex: 1,
    height: 40,
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
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
    fontSize: 13,
    color: '#636E72',
    fontWeight: '500',
  },
  voiceButtonTextRecording: {
    fontSize: 13,
    color: '#E74C3C',
    fontWeight: '600',
  },
  audioMessageContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userImageMessageContent: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    maxWidth: '100%',
    alignSelf: 'flex-start',
  },
  userMessageImageThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  userMessageDocIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbAlignTopLeft: Platform.select({
    web: { objectFit: 'cover' as const, objectPosition: 'top left' as const },
    default: {},
  }),
  userMessageImageName: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    maxWidth: 220,
    minWidth: 56,
  },
  userVoiceMessageContent: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    maxWidth: '100%',
    alignSelf: 'flex-start',
  },
  userVoiceMessageIcon: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userVoiceMessageLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
});
