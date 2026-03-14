import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, ActivityIndicator, ScrollView, TextInput, useWindowDimensions, Platform, Linking } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { isAuthenticated, getCurrentUser, getCurrentSpace, setCurrentSpace, getUserSpaces, createSpace } from '@/lib/auth';
import { initializeAuthCache, isCacheInitialized } from '@/lib/auth-cache';
import { Space, UserSpace } from '@/types';
import { getPendingInvitationsForUser } from '@/lib/space-invitations';
import { uploadReceiptImageTempWithSpace } from '@/lib/supabase';
import { saveReceipt } from '@/lib/database';
import { saveInvoice } from '@/lib/invoices';
import { processReceiptInBackground } from '@/lib/receipt-processor';
import { processImageForUpload } from '@/lib/image-processor';
import { getLocalDateString } from '@/lib/date-utils';
import { recognizeReceipt } from '@/lib/gemini';
import { convertGeminiResultToInvoice } from '@/lib/receipt-helpers';
import { runWithRecognitionRetry } from '@/lib/recognition-retry';
import { showToast } from '@/lib/toast';
import { showChoiceDialog } from '@/lib/confirmDialog';
import Svg, { Path, Rect, G, Circle, Text as SvgText } from 'react-native-svg';
import WebDashboardView from '@/components/WebDashboardView';
import CrmDashboardView from '@/components/CrmDashboardView';
import { FirmPendingOverlay } from '@/components/FirmPendingOverlay';
import { showAiInventory, showTaxFiling } from '@/lib/feature-flags';
import { getFirmClientsWithDetails, getFirmOrders } from '@/lib/firm';
import { getPendingInviteesForEmail } from '@/lib/firm-clients';
import type { ClientDisplayStatus } from '@/types';
import { CLIENT_DISPLAY_STATUS_LABELS } from '@/types';

/** 首页是否显示「AI 进销存」入口：由 app.config.js extra.showAiInventory 控制 */
const SHOW_AI_INVENTORY_ENTRY = Constants.expoConfig?.extra?.showAiInventory !== false;

const FIRM_CHART_COLORS = ['#6C5CE7', '#00B894', '#0984E3', '#FDCB6E', '#E17055'];
const FIRM_ORDER_STATUS_LABELS: Record<string, string> = {
  onboarding: 'Onboarding',
  processing: 'Processing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function HomeScreen() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [currentSpace, setCurrentSpaceState] = useState<Space | null>(null);
  const [showSpaceSwitch, setShowSpaceSwitch] = useState(false);
  const [spaces, setSpaces] = useState<UserSpace[]>([]);
  const [switching, setSwitching] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceAddress, setNewSpaceAddress] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingInvitationsCount, setPendingInvitationsCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showRefreshAfterSwitchModal, setShowRefreshAfterSwitchModal] = useState(false);
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);
  const [lastInvoiceId, setLastInvoiceId] = useState<string | null>(null);
  const [voucherType, setVoucherType] = useState<'receipt' | 'invoice'>('receipt');

  // Firm 移动端：图表数据（客户类别、订单类别）
  const [firmChartLoading, setFirmChartLoading] = useState(false);
  const [firmClientCountByStatus, setFirmClientCountByStatus] = useState<Record<ClientDisplayStatus, number>>({
    new: 0,
    to_follow_up: 0,
    in_service: 0,
    to_revisit: 0,
    churned: 0,
  });
  const [firmOrderCountByStatus, setFirmOrderCountByStatus] = useState<Record<string, number>>({});
  const [pendingClaimCount, setPendingClaimCount] = useState(0);

  // Check if running in Expo Go
  const isExpoGo = Constants.appOwnership === 'expo';

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const sloganFontSize = Math.min(32, Math.max(24, Math.round(screenWidth * 0.082)));
  const isCompact = screenHeight < 750 || screenWidth < 360;
  const mainCircleSize = isCompact ? 160 : 200;
  const chatCircleSize = isCompact ? 120 : 150;
  const sloganMarginBottom = isCompact ? 4 : 8;
  const sloganLineHeight = sloganFontSize * 1.15;
  const sloganBlockMarginBottom = isCompact ? 8 : 12;

  useEffect(() => {
    checkAuth();
  }, []);

  // Firm 空间移动端：拉取客户/订单统计用于图表
  useEffect(() => {
    if (Platform.OS === 'web' || currentSpace?.kind !== 'firm' || !currentSpace?.id) {
      return;
    }
    let cancelled = false;
    setFirmChartLoading(true);
    (async () => {
      try {
        const [clients, orders] = await Promise.all([
          getFirmClientsWithDetails(currentSpace.id),
          getFirmOrders(currentSpace.id),
        ]);
        if (cancelled) return;
        const byStatus: Record<ClientDisplayStatus, number> = {
          new: 0,
          to_follow_up: 0,
          in_service: 0,
          to_revisit: 0,
          churned: 0,
        };
        clients.forEach((c) => {
          byStatus[c.displayStatus] = (byStatus[c.displayStatus] ?? 0) + 1;
        });
        setFirmClientCountByStatus(byStatus);
        const byOrder: Record<string, number> = {};
        orders.forEach((o) => {
          byOrder[o.status] = (byOrder[o.status] ?? 0) + 1;
        });
        setFirmOrderCountByStatus(byOrder);
      } catch (e) {
        console.error('Firm chart load:', e);
      } finally {
        if (!cancelled) setFirmChartLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentSpace?.kind, currentSpace?.id]);

  const continueAfterAuth = async () => {
    // 检查用户是否有当前空间（使用缓存，如果缓存未初始化则从数据库读取）
    const user = await getCurrentUser();
    if (!user) {
      router.replace('/setup-space');
      return;
    }

    // 检查用户是否有空间（区分新用户和老用户）
    const { getUserSpaces } = await import('@/lib/auth');
    const spaces = await getUserSpaces();
    
    // 新用户：没有空间，跳转到设置空间页面（创建空间）
    if (spaces.length === 0) {
      router.replace('/setup-space');
      return;
    }

    // 老用户：有空间
    // 如果用户已经有当前空间（currentSpaceId 或 spaceId），直接进入应用
    if (user.currentSpaceId || user.spaceId) {
      setIsLoggedIn(true);
      return;
    }

    // 老用户：有空间但没有当前空间
    if (spaces.length === 1) {
      // 只有一个空间，自动设置并进入
      const { setCurrentSpace } = await import('@/lib/auth');
      await setCurrentSpace(spaces[0].spaceId);
      // 更新缓存
      const updatedUser = await getCurrentUser(true);
      const updatedSpace = updatedUser ? await getCurrentSpace(true) : null;
      await initializeAuthCache(updatedUser, updatedSpace);
      setIsLoggedIn(true);
      return;
    } else {
      // 多个空间但没有当前空间，跳转到空间选择页面
      router.replace('/space-select');
      return;
    }
  };

  const checkAuth = async () => {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      router.replace('/login');
      return;
    }

    // 如果缓存未初始化，后台异步初始化缓存（不阻塞页面渲染）
    if (!isCacheInitialized()) {
      // 后台异步加载，不阻塞，同时先尝试继续路由检查
      // 如果缓存加载完成前需要数据，会从数据库读取；完成后会使用缓存
      (async () => {
        try {
          const user = await getCurrentUser(true); // 强制刷新
          const space = user ? await getCurrentSpace(true) : null; // 强制刷新
          await initializeAuthCache(user, space);
        } catch (error) {
          console.error('Error initializing auth cache:', error);
          // 错误不影响流程，目标页面会处理
        }
      })();
      
      // 不等待缓存加载，立即继续检查（会从数据库读取，但保证页面正常显示）
      continueAuthCheck();
    } else {
      // 缓存已初始化，直接继续
      continueAuthCheck();
    }
  };

  const continueAuthCheck = async () => {
    // 流程：登录成功 -> 判断是否已关联家庭 -> 有关联家庭 -> 进入上次登录的家庭的index
    // 如果用户已有关联空间，即使有 pending invitations，也允许进入应用（用户可以通过 Later 按钮忽略邀请）
    
    // 首先检查用户是否有当前空间（使用缓存，如果缓存未初始化则从数据库读取）
    let user;
    try {
      user = await getCurrentUser(true); // 强制刷新，确保获取最新的currentSpaceId
    } catch (userError) {
      console.log('Index: Error getting user, redirecting to setup-space');
      router.replace('/setup-space');
      return;
    }
    
    if (!user) {
      console.log('Index: No user, redirecting to setup-space');
      router.replace('/setup-space');
      return;
    }

    // 如果用户已经有当前空间（currentSpaceId 或 spaceId），直接进入应用（进入上次登录的空间）
    // 即使有 pending invitations，也允许进入应用（用户可以通过 setup-space 页面的 Invitations 按钮处理）
    if (user.currentSpaceId || user.spaceId) {
      console.log('Index: User has current space, entering app (pending invitations can be handled later)');
      setIsLoggedIn(true);
      return;
    }

    // 用户没有当前空间，检查用户是否有空间（区分新用户和老用户）
    const { getUserSpaces } = await import('@/lib/auth');
    const spaces = await getUserSpaces();
    
    console.log('Index: User spaces count:', spaces.length);
    if (spaces.length > 0) {
      console.log('Index: User spaces:', spaces.map(s => ({
        spaceId: s.spaceId,
        spaceName: s.space?.name || 'Unknown',
      })));
    }
    
    // 新用户：没有空间，检查是否有待处理的邀请
    if (spaces.length === 0) {
      // 检查是否有待处理的邀请（新用户需要处理邀请）
      try {
        const { getPendingInvitationsForUser } = await import('@/lib/space-invitations');
        const invitations = await getPendingInvitationsForUser();
        
        if (invitations.length > 0) {
          // 新用户有邀请，跳转到邀请处理页面
          console.log('Index: New user with pending invitations, redirecting to handle-invitations');
          router.replace('/handle-invitations');
          return;
        }
      } catch (invError) {
        // 邀请检查失败不影响流程，静默继续
        console.log('Index: Invitation check failed (non-blocking):', invError);
      }
      
      // 新用户没有邀请，跳转到设置空间页面（创建空间）
      console.log('Index: No spaces, redirecting to setup-space');
      router.replace('/setup-space');
      return;
    }

    // 老用户：有空间但没有当前空间
    if (spaces.length === 1) {
      // 只有一个空间，自动设置并进入（这就是上次登录的空间）
      console.log('Index: Setting single space:', spaces[0].spaceId);
      const { setCurrentSpace } = await import('@/lib/auth');
      await setCurrentSpace(spaces[0].spaceId);
      // 更新缓存（使用已设置的空间ID，避免再次查询）
      const updatedUser = await getCurrentUser(true); // 强制刷新
      const updatedSpace = updatedUser ? await getCurrentSpace(true) : null; // 强制刷新
      await initializeAuthCache(updatedUser, updatedSpace);
      setIsLoggedIn(true);
      return;
    } else {
      // 多个空间但没有当前空间，跳转到空间选择页面
      console.log('Index: Multiple spaces, redirecting to space-select');
      router.replace('/space-select');
      return;
    }
  };

  const checkPendingInvitations = async () => {
    // 只有已登录的用户才检查 pending invitations
    if (!isLoggedIn) {
      setPendingInvitationsCount(0);
      return;
    }

    try {
      const invitations = await getPendingInvitationsForUser();
      setPendingInvitationsCount(invitations.length);
    } catch (error) {
      console.error('Error checking pending invitations:', error);
      // 静默失败，不影响页面显示
      setPendingInvitationsCount(0);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      loadSpace();
      // checkPendingInvitations 已在 loadSpace 中调用
    } else {
      setPendingInvitationsCount(0);
    }
  }, [isLoggedIn]);

  // 使用 useFocusEffect 在页面获得焦点时检查 pending invitations、待认领 engagement 和重新加载空间信息（用于从其他页面返回时刷新）
  useFocusEffect(
    useCallback(() => {
      if (isLoggedIn) {
        // 重新加载空间信息（用于从管理页切换空间后返回时更新）
        loadSpace();
        checkPendingInvitations();
        // 刷新待认领 engagement 数量（从 /auth/claim 返回后横幅会更新或消失）
        (async () => {
          const user = await getCurrentUser();
          if (user?.email) {
            const { list } = await getPendingInviteesForEmail(user.email);
            setPendingClaimCount(list.length);
          }
        })();
      }
    }, [isLoggedIn])
  );

  // 添加路由守卫：每次页面获得焦点时检查用户是否有空间（防止通过回退路径进入）
  useFocusEffect(
    useCallback(() => {
      const checkUserSpace = async () => {
        // 如果还没有完成登录检查，跳过
        if (isLoggedIn === null) {
          return;
        }
        
        // 如果已登录，检查用户是否有空间
        if (isLoggedIn) {
          try {
            const user = await getCurrentUser(true);
            if (!user) {
              router.replace('/setup-space');
              return;
            }
            
            // 检查用户是否有空间
            const spaces = await getUserSpaces();
            if (spaces.length === 0) {
              // 没有空间，重定向到 setup-space
              router.replace('/setup-space');
              return;
            }
            
            // 如果有空间但没有当前空间，也重定向到 setup-space
            if (!user.currentSpaceId && !user.spaceId) {
              router.replace('/setup-space');
              return;
            }
          } catch (error) {
            console.error('Error checking user space in focus effect:', error);
            router.replace('/setup-space');
          }
        }
      };
      
      checkUserSpace();
    }, [isLoggedIn, router])
  );

  const loadSpace = async () => {
    try {
      // 强制刷新，确保从管理页切换空间后能获取最新数据
      const space = await getCurrentSpace(true);
      setCurrentSpaceState(space);
      
      // 加载空间后检查 pending invitations（已有关联空间的用户）
      await checkPendingInvitations();
    } catch (error) {
      console.error('Error loading space:', error);
    }
  };


  const ensureUserHasSpace = async (isNewUser: boolean = false) => {
    // 确保用户有当前空间，如果没有则设置到第一个空间或创建新空间
    const user = await getCurrentUser();
    if (!user) return;

    // 如果用户已经有当前空间，不需要处理
    if (user.currentSpaceId || user.spaceId) {
      return;
    }

    // 检查用户有哪些空间
    const spaces = await getUserSpaces();
    if (spaces.length > 0) {
      // 有空间但没有当前空间，设置到第一个空间
      const { error } = await setCurrentSpace(spaces[0].spaceId);
      if (!error) {
        // 更新缓存
        const updatedUser = await getCurrentUser(true);
        const updatedSpace = updatedUser ? await getCurrentSpace(true) : null;
        await initializeAuthCache(updatedUser, updatedSpace);
        // 更新当前显示的空间
        setCurrentSpaceState(updatedSpace);
      }
    } else if (isNewUser) {
      // 新用户没有空间，跳转到创建空间页面让用户手动创建
      router.replace('/setup-space');
      return;
    } else {
      // 老用户没有空间的情况不应该发生，但如果有，也跳转到创建空间页面
      router.replace('/setup-space');
    }
  };


  const loadSpaces = async () => {
    try {
      const data = await getUserSpaces();
      setSpaces(data);
    } catch (error) {
      console.error('Error loading spaces:', error);
      showToast('Failed to load spaces', 'error');
    }
  };

  const handleSwitchSpace = async (spaceId: string) => {
    try {
      setSwitching(true);
      const { error } = await setCurrentSpace(spaceId);
      if (error) {
        showToast(error.message, 'error');
        setSwitching(false);
        return;
      }

      // 更新缓存
      const updatedUser = await getCurrentUser(true);
      const updatedSpace = updatedUser ? await getCurrentSpace(true) : null;
      await initializeAuthCache(updatedUser, updatedSpace);

      setShowSpaceSwitch(false);

      if (Platform.OS === 'web') {
        setShowRefreshAfterSwitchModal(true);
        return;
      }

      if (updatedSpace) {
        setCurrentSpaceState(updatedSpace);
      }

      try {
        const { getPendingInvitationsForUser } = await import('@/lib/space-invitations');
        const invitations = await getPendingInvitationsForUser();
        if (invitations.length > 0) {
          router.replace('/handle-invitations');
          return;
        }
      } catch (invError) {
        // 静默继续
      }

      await loadSpace();
    } catch (error) {
      console.error('Error switching space:', error);
      showToast('Failed to switch space', 'error');
    } finally {
      setSwitching(false);
    }
  };

  const openSpaceSwitch = async () => {
    await loadSpaces();
    setShowSpaceSwitch(true);
  };

  const handleCreateSpace = async () => {
    if (!newSpaceName.trim()) {
      showToast('Please enter space name', 'error');
      return;
    }

    try {
      setCreating(true);
      const { space, error } = await createSpace(
        newSpaceName.trim(),
        newSpaceAddress.trim() || undefined
      );

      if (error) {
        showToast(error.message || 'Failed to create space', 'error');
        setCreating(false);
        return;
      }

      if (space) {
        setShowCreateModal(false);
        setNewSpaceName('');
        setNewSpaceAddress('');
        await loadSpaces();
        await loadSpace();
        setShowSpaceSwitch(false);
        showToast('Space created successfully', 'success');
      }
    } catch (error) {
      console.error('Error creating space:', error);
      showToast('Failed to create space', 'error');
    } finally {
      setCreating(false);
    }
  };

  const scanDocument = async (type: 'receipt' | 'invoice' = 'receipt') => {
    // If we are in Expo Go, we can't use the native scanner
    if (isExpoGo) {
      showChoiceDialog(
        'Development Build Required',
        'Real-time edge detection and cropping requires a native development build. In Expo Go, please use the gallery picker option.',
        [
          { text: 'Cancel', onPress: () => {}, style: 'cancel' },
          { text: 'Pick from Gallery', onPress: () => pickImage(type), style: 'primary' },
        ]
      );
      return;
    }

    try {
      // 动态导入 DocumentScanner（只在非 Expo Go 环境中导入）
      const module = await import('react-native-document-scanner-plugin');
      const DocumentScanner = module?.default;
      
      // 额外防御：模块导入但没有正确挂载时，直接提示使用开发构建
      if (!DocumentScanner || typeof DocumentScanner.scanDocument !== 'function') {
        throw new Error('DocumentScanner module not loaded correctly');
      }

      const { scannedImages } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        croppedImageQuality: 90,
        letUserAdjustCrop: false,  // 自动裁剪，无需手动调整
      } as any);

      if (scannedImages && scannedImages.length > 0) {
        // 自动裁剪后直接处理，实现 Snap 即拍即传
        processCapturedImage(scannedImages[0], false, false, type);
      }
    } catch (error) {
      console.error('Document scan error:', error);
      // 如果是模块未找到错误，提示使用开发构建
      if (error instanceof Error && error.message?.includes('TurboModuleRegistry')) {
        showChoiceDialog(
          'Development Build Required',
          'Document scanner requires a native development build. Please use a development build or use the gallery picker option.',
          [
            { text: 'Cancel', onPress: () => {}, style: 'cancel' },
            { text: 'Pick from Gallery', onPress: () => pickImage(type), style: 'primary' },
          ]
        );
      } else {
        showToast('Failed to snap document. Please try again.', 'error');
      }
    }
  };

  const pickImage = async (type: 'receipt' | 'invoice' = 'receipt') => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        processCapturedImage(result.assets[0].uri, true, false, type);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      showToast('Failed to pick image.', 'error');
    }
  };

  // fromGallery：true=相册/选择不裁剪不增强；false=实时拍摄/扫描。autoCrop：仅非相册时有效（扫描传 false）
  const processCapturedImage = async (imageUri: string, fromGallery: boolean, autoCrop: boolean, type: 'receipt' | 'invoice' = 'receipt') => {
    setShowSuccessModal(true);
    setVoucherType(type);
    setLastReceiptId(null);
    setLastInvoiceId(null);

    (async () => {
      try {
        console.log(`Processing captured image (${type}):`, imageUri, 'fromGallery:', fromGallery);

        let uriToUpload = imageUri;
        if (!fromGallery) {
          uriToUpload = await processImageForUpload(imageUri, { autoCrop, quality: 0.85 });
          console.log('Image processed:', uriToUpload);
        }

        const tempFileName = `temp-${Date.now()}`;
        const spaceId = currentSpace?.id ?? '';
        const imageUrl = await uploadReceiptImageTempWithSpace(uriToUpload, tempFileName, spaceId);
        console.log('Image uploaded:', imageUrl);

        if (type === 'invoice') {
          // 处理发票（收入）
          const today = getLocalDateString();
          const invoiceId = await saveInvoice({
            spaceId: '',
            customerName: 'Processing...',
            totalAmount: 0,
            date: today,
            status: 'pending',
            items: [],
            imageUrl: imageUrl,
            inputType: fromGallery ? 'image' : 'camera',
          }, true); // autoResolveDuplicate = true
          console.log('Invoice record created:', invoiceId);
          setLastInvoiceId(invoiceId);

          // 后台识别处理
          (async () => {
            try {
              const ret = await runWithRecognitionRetry(() => recognizeReceipt(imageUrl), { maxAttempts: 5, delayMs: 2000 });
              if (ret.success) {
                const invoice = await convertGeminiResultToInvoice(ret.result);
                await saveInvoice({
                  ...invoice,
                  id: invoiceId,
                  imageUrl: imageUrl,
                  confidence: ret.result.confidence,
                }, true);
                console.log('Invoice processing completed');
              } else {
                console.warn('Invoice recognition failed:', ret.error.message);
              }
            } catch (error) {
              console.error('Invoice processing error:', error);
            }
          })();
        } else {
          // 处理小票（支出）
          const today = getLocalDateString();
          const receiptId = await saveReceipt({
            spaceId: '',
            supplierName: 'Processing...',
            totalAmount: 0,
            date: today,
            status: 'processing',
            items: [],
            imageUrl: imageUrl,
            inputType: fromGallery ? 'image' : 'camera',
          });
          console.log('Receipt record created:', receiptId);
          setLastReceiptId(receiptId);

          // 4. Background processing with Gemini (async, don't block UI)
          processReceiptInBackground(imageUrl, receiptId, uriToUpload)
            .then(() => console.log('Background processing started'))
            .catch(err => console.error('Background processing failed:', err));
        }

      } catch (error) {
        console.error('Processing error:', error);
        showToast(`Failed to process ${type === 'invoice' ? 'income' : 'expense'}.`, 'error');
        setShowSuccessModal(false);
      }
    })();
  };

  const handleCameraPress = (type: 'receipt' | 'invoice' = 'receipt') => {
    // 保存类型，用于UI显示
    setVoucherType(type);
    // 直接传递类型给扫描函数
    scanDocument(type);
  };

  const handleChatPress = (type: 'receipt' | 'invoice' = 'receipt') => {
    if (type === 'invoice') {
      router.push('/chat-to-log?type=invoice');
    } else {
      router.push('/chat-to-log');
    }
  };

  // 认证检查中，不渲染任何内容（避免闪烁）
  if (isLoggedIn === null) {
    return null;
  }

  if (!isLoggedIn) {
    return null; // 会跳转到登录页或设置家庭页面
  }

  // 当前空间尚未加载完成时，不渲染首页，避免在 firm 空间加载前短暂显示 client 端内容
  if (!currentSpace) {
    return null;
  }

  const isFirmPending = currentSpace?.kind === 'firm' && currentSpace?.firmStatus !== 'approved';

  // Web 端：firm 待审核遮罩由 _layout 统一处理（含首页及所有 /firm/* 子模块），此处仅渲染已审核内容
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        {currentSpace?.kind === 'firm' ? <CrmDashboardView /> : <WebDashboardView />}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
      {/* 顶部栏：家庭名称和管理入口 */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          {pendingInvitationsCount > 0 && (
            <TouchableOpacity
              style={styles.invitationsBadgeButton}
              onPress={() => router.push('/handle-invitations')}
              activeOpacity={0.7}
            >
              <Ionicons name="mail-outline" size={24} color="#6C5CE7" />
              <View style={styles.invitationsBadge}>
                <Text style={styles.invitationsBadgeText}>
                  {pendingInvitationsCount > 99 ? '99+' : pendingInvitationsCount}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.householdNameContainer}
          onPress={openSpaceSwitch}
          activeOpacity={0.7}
        >
          <Text style={styles.householdName} numberOfLines={1}>
            {currentSpace?.name || 'Loading...'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.managementButton}
          onPress={() => router.push('/management')}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={24} color="#2D3436" />
        </TouchableOpacity>
      </View>

      {pendingClaimCount > 0 && (
        <TouchableOpacity
          style={styles.pendingClaimBanner}
          onPress={() => router.push('/auth/claim')}
          activeOpacity={0.8}
        >
          <Ionicons name="briefcase-outline" size={20} color="#fff" />
          <Text style={styles.pendingClaimBannerText}>
            You have {pendingClaimCount} pending engagement{pendingClaimCount !== 1 ? 's' : ''}. Tap to claim.
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>
      )}

      <View style={styles.content}>
        {isFirmPending ? (
          <FirmPendingOverlay />
        ) : currentSpace?.kind === 'firm' ? (
          /* Firm 空间（已审核通过）：两个统计图表 */
          (() => {
            const chartWidth = Math.min(screenWidth - 40, 360);
            const pieSize = Math.min(chartWidth, 200);
            const pieR = pieSize / 2 - 16;
            const barChartH = 160;
            const barPadding = { top: 20, right: 16, bottom: 28, left: 16 };
            const clientEntries = (Object.keys(firmClientCountByStatus) as ClientDisplayStatus[])
              .filter((k) => firmClientCountByStatus[k] > 0)
              .map((k) => [CLIENT_DISPLAY_STATUS_LABELS[k], firmClientCountByStatus[k]] as [string, number]);
            const orderEntries = ['pending', 'submitted', 'confirmed', 'cancelled']
              .filter((k) => (firmOrderCountByStatus[k] ?? 0) > 0)
              .map((k) => [FIRM_ORDER_STATUS_LABELS[k] || k, firmOrderCountByStatus[k] ?? 0] as [string, number]);
            const totalClients = clientEntries.reduce((s, [, v]) => s + v, 0);
            const maxOrderVal = orderEntries.length ? Math.max(...orderEntries.map(([, v]) => v)) : 0;
            const cx = chartWidth / 2;
            const cy = pieSize / 2 - 8;
            const r = Math.min(pieR, pieSize / 2 - 24, chartWidth / 2 - 24);
            return (
              <>
                {firmChartLoading ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#6C5CE7" />
                  </View>
                ) : (
                  <>
                    <View style={styles.firmChartCard}>
                      <Text style={styles.firmChartCardTitle}>Client Status</Text>
                      <View style={styles.firmChartWrap}>
                        <Svg width={chartWidth} height={pieSize} viewBox={`0 0 ${chartWidth} ${pieSize}`} style={{ overflow: 'visible' }}>
                          {clientEntries.length === 0 ? (
                            <SvgText x={chartWidth / 2} y={pieSize / 2} textAnchor="middle" fill="#95A5A6" fontSize={14}>No data</SvgText>
                          ) : (
                            <G>
                              {clientEntries.reduce<{ acc: number; els: JSX.Element[] }>(
                                (prev, [name, val], i) => {
                                  const ratio = totalClients ? val / totalClients : 0;
                                  const color = FIRM_CHART_COLORS[i % FIRM_CHART_COLORS.length];
                                  if (ratio >= 1 - 1e-9) {
                                    // Full circle: SVG arc with same start/end does not draw; use Circle
                                    prev.els.push(
                                      <Circle key={name} cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={2} />
                                    );
                                  } else {
                                    const start = prev.acc * 2 * Math.PI - Math.PI / 2;
                                    const end = (prev.acc + ratio) * 2 * Math.PI - Math.PI / 2;
                                    const x1 = cx + r * Math.cos(start);
                                    const y1 = cy + r * Math.sin(start);
                                    const x2 = cx + r * Math.cos(end);
                                    const y2 = cy + r * Math.sin(end);
                                    const large = ratio > 0.5 ? 1 : 0;
                                    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
                                    prev.els.push(
                                      <Path key={name} d={d} fill={color} stroke="#fff" strokeWidth={2} />
                                    );
                                  }
                                  prev.acc += ratio;
                                  return prev;
                                },
                                { acc: 0, els: [] }
                              ).els}
                              <SvgText x={cx} y={cy + 6} textAnchor="middle" fill="#2D3436" fontSize={13}>{totalClients} clients</SvgText>
                              {clientEntries.slice(0, 5).map(([name, val], i) => (
                                <SvgText key={name} x={chartWidth - 12} y={20 + i * 16} textAnchor="end" fill={FIRM_CHART_COLORS[i % FIRM_CHART_COLORS.length]} fontSize={11}>
                                  {name} {totalClients ? ((val / totalClients) * 100).toFixed(0) + '%' : ''}
                                </SvgText>
                              ))}
                            </G>
                          )}
                        </Svg>
                      </View>
                    </View>
                    <View style={styles.firmChartCard}>
                      <Text style={styles.firmChartCardTitle}>Engagement Status</Text>
                      <View style={styles.firmChartWrap}>
                        <Svg width={chartWidth} height={barChartH} style={{ overflow: 'visible' }}>
                          {orderEntries.length === 0 ? (
                            <SvgText x={chartWidth / 2} y={barChartH / 2} textAnchor="middle" fill="#95A5A6" fontSize={14}>No data</SvgText>
                          ) : (
                            (() => {
                              const chartAreaW = chartWidth - barPadding.left - barPadding.right;
                              const chartAreaH = barChartH - barPadding.top - barPadding.bottom;
                              const n = orderEntries.length;
                              const colW = chartAreaW / n;
                              const barW = Math.max(16, Math.min(colW * 0.65, 44));
                              return (
                                <>
                                  {orderEntries.map(([name, val], i) => {
                                    const colCenterX = barPadding.left + (i + 0.5) * colW;
                                    const barX = colCenterX - barW / 2;
                                    const barHeight = maxOrderVal ? (val / maxOrderVal) * chartAreaH : 0;
                                    const barY = barPadding.top + chartAreaH - barHeight;
                                    const label = name.length > 10 ? name.slice(0, 10) + '…' : name;
                                    return (
                                      <G key={name}>
                                        <Rect x={barX} y={barY} width={barW} height={barHeight} rx={4} fill={FIRM_CHART_COLORS[i % FIRM_CHART_COLORS.length]} />
                                        <SvgText x={colCenterX} y={barChartH - 8} textAnchor="middle" fill="#636E72" fontSize={10}>{label}</SvgText>
                                      </G>
                                    );
                                  })}
                                </>
                              );
                            })()
                          )}
                        </Svg>
                      </View>
                    </View>
                  </>
                )}
              </>
            );
          })()
        ) : (
          <>
            <Text style={[styles.title, { fontSize: sloganFontSize, lineHeight: sloganLineHeight, marginBottom: sloganMarginBottom }]}>📸</Text>
            <Text
              style={[styles.title, { fontSize: sloganFontSize, lineHeight: sloganLineHeight, marginBottom: sloganMarginBottom }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Voucher Snapping,
            </Text>
            <Text
              style={[styles.subtitle, { fontSize: sloganFontSize, lineHeight: sloganLineHeight, marginBottom: sloganBlockMarginBottom }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Balance Clarity.
            </Text>
            <View style={[styles.iconContainer, { marginTop: sloganBlockMarginBottom }]}>
              <View style={[styles.circle, { width: mainCircleSize, height: mainCircleSize, borderRadius: mainCircleSize / 2 }]}>
                <View style={styles.iconCenter}>
                  <Ionicons name="camera" size={mainCircleSize * 0.4} color="#6C5CE7" />
                </View>
                <TouchableOpacity style={[styles.halfButton, styles.leftHalf]} onPress={() => handleCameraPress('invoice')} activeOpacity={0.8} disabled={isProcessing} />
                <TouchableOpacity style={[styles.halfButton, styles.rightHalf]} onPress={() => handleCameraPress('receipt')} activeOpacity={0.8} disabled={isProcessing} />
              </View>
            </View>
            <View style={styles.chatIconContainer}>
              <View style={[styles.chatCircle, { width: chatCircleSize, height: chatCircleSize, borderRadius: chatCircleSize / 2 }]}>
                <View style={styles.iconCenter}>
                  <Ionicons name="chatbubble-outline" size={chatCircleSize * 0.4} color="#6C5CE7" />
                </View>
                <TouchableOpacity style={[styles.halfButton, styles.leftHalf]} onPress={() => handleChatPress('invoice')} activeOpacity={0.8} />
                <TouchableOpacity style={[styles.halfButton, styles.rightHalf]} onPress={() => handleChatPress('receipt')} activeOpacity={0.8} />
              </View>
            </View>
          </>
        )}
      </View>

      {currentSpace?.kind === 'firm' && !isFirmPending ? (
        <View style={styles.buttonsRow}>
          <TouchableOpacity style={[styles.secondaryButton, styles.thirdWidthButton, styles.firmBottomIconButton]} onPress={() => router.push('/firm/clients')} accessibilityLabel="Clients">
            <Ionicons name="people" size={26} color="#6C5CE7" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, styles.thirdWidthButton, styles.firmBottomIconButton]} onPress={() => router.push('/firm/engagements')} accessibilityLabel="Engagements">
            <Ionicons name="clipboard" size={26} color="#6C5CE7" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, styles.thirdWidthButton, styles.firmBottomIconButton]} onPress={() => router.push('/firm/service-catalog')} accessibilityLabel="Service Catalog">
            <Ionicons name="library" size={26} color="#6C5CE7" />
          </TouchableOpacity>
        </View>
      ) : currentSpace?.kind !== 'firm' ? (
        <>
          <View style={styles.buttonsRow}>
            <TouchableOpacity style={[styles.secondaryButton, styles.halfWidthButton]} onPress={() => router.push('/invoices')}>
              <Ionicons name="document-text-outline" size={20} color="#6C5CE7" style={styles.buttonIcon} />
              <Text style={styles.secondaryButtonText}>Income</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, styles.halfWidthButton]} onPress={() => router.push('/receipts')}>
              <Ionicons name="list-outline" size={20} color="#6C5CE7" style={styles.buttonIcon} />
              <Text style={styles.secondaryButtonText}>Expenses</Text>
            </TouchableOpacity>
          </View>
          {SHOW_AI_INVENTORY_ENTRY && (
            <View style={[styles.buttonsRow, { marginTop: 12 }]}>
              <TouchableOpacity style={[styles.secondaryButtonAlt, styles.halfWidthButton]} onPress={() => router.push('/ai-inventory')}>
                <Ionicons name="cube-outline" size={20} color="#FF9500" style={styles.buttonIcon} />
                <Text style={styles.secondaryButtonAltText}>AI Inventory</Text>
              </TouchableOpacity>
            </View>
          )}
          {showTaxFiling && (
            <View style={[styles.buttonsRow, { marginTop: 12 }]}>
              <TouchableOpacity style={[styles.secondaryButtonAlt, styles.halfWidthButton]} onPress={() => router.push('/tax-filing')}>
                <Ionicons name="document-text-outline" size={20} color="#0984e3" style={styles.buttonIcon} />
                <Text style={styles.secondaryButtonAltText}>Tax Filing</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : null}
      </ScrollView>

      {/* Space Switch Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showSpaceSwitch}
        onRequestClose={() => setShowSpaceSwitch(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowSpaceSwitch(false)}
        >
          <View style={styles.pickerBottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHandle} />
            <View style={[styles.pickerHeader, styles.pickerHeaderCenter]}>
              <Text style={[styles.pickerTitle, switching && styles.pickerTitleHidden]}>Switch Space</Text>
              {switching && (
                <View style={styles.pickerHeaderSpinnerWrap}>
                  <ActivityIndicator size="small" color="#6C5CE7" />
                </View>
              )}
            </View>
            <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
              {spaces.map((userSpace) => (
                <TouchableOpacity
                  key={userSpace.spaceId}
                  style={[
                    styles.pickerOption,
                    currentSpace?.id === userSpace.spaceId && styles.pickerOptionSelected
                  ]}
                  onPress={() => handleSwitchSpace(userSpace.spaceId)}
                  disabled={switching || currentSpace?.id === userSpace.spaceId}
                >
                  <Ionicons 
                    name="home" 
                    size={20} 
                    color={currentSpace?.id === userSpace.spaceId ? "#6C5CE7" : "#636E72"} 
                  />
                  <View style={styles.householdOptionContent}>
                    <Text style={[
                      styles.pickerOptionText,
                      currentSpace?.id === userSpace.spaceId && styles.pickerOptionTextSelected
                    ]}>
                      {userSpace.space?.name || 'Unnamed Space'}
                    </Text>
                    {userSpace.space?.address && (
                      <Text style={styles.householdOptionAddress} numberOfLines={1}>
                        {userSpace.space.address}
                      </Text>
                    )}
                  </View>
                  {currentSpace?.id === userSpace.spaceId && (
                    <Ionicons name="checkmark" size={20} color="#6C5CE7" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.createHouseholdButton}
                onPress={() => {
                  setShowSpaceSwitch(false);
                  router.push('/setup-space');
                }}
                disabled={switching}
              >
                <Ionicons name="add-circle-outline" size={20} color="#6C5CE7" />
                <Text style={styles.createHouseholdButtonText}>Create a New</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Web only: switch space success – prompt to refresh */}
      <Modal
        visible={Platform.OS === 'web' && showRefreshAfterSwitchModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowRefreshAfterSwitchModal(false)}
      >
        <View style={styles.refreshModalOverlay}>
          <View style={styles.refreshModalCard} onStartShouldSetResponder={() => true}>
            <View style={[styles.pickerHandle, { marginTop: 20, marginBottom: 16 }]} />
            <Text style={[styles.pickerTitle, styles.refreshModalTitle]}>Space switched successfully</Text>
            <TouchableOpacity
              style={styles.refreshModalPrimaryButton}
              onPress={() => {
                if (typeof window !== 'undefined') {
                  window.location.assign(window.location.origin + '/');
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.refreshModalPrimaryButtonText}>Refresh page</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success Modal - 拍摄提交后的操作选单 */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSuccessModal}
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={64} color="#00B894" />
            </View>
            <Text style={styles.successTitle}>
              {voucherType === 'invoice' ? 'Income Submitted!' : 'Expense Submitted!'}
            </Text>
            <Text style={styles.successSubtitle}>
              {voucherType === 'invoice' 
                ? 'Invoice is being processed' 
                : 'Receipt is being processed'}
            </Text>
            <View style={styles.successButtons}>
              <TouchableOpacity
                style={styles.successButton}
                onPress={() => {
                  setShowSuccessModal(false);
                  handleCameraPress(voucherType);
                }}
              >
                <Ionicons name="camera-outline" size={24} color="#6C5CE7" />
                <Text style={styles.successButtonText}>Snap Another</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.successButton, !(voucherType === 'receipt' ? lastReceiptId : lastInvoiceId) && { opacity: 0.5 }]}
                disabled={!(voucherType === 'receipt' ? lastReceiptId : lastInvoiceId)}
                onPress={() => {
                  setShowSuccessModal(false);
                  if (voucherType === 'receipt' && lastReceiptId) {
                    router.push(`/receipt-details/${lastReceiptId}`);
                  } else if (voucherType === 'invoice' && lastInvoiceId) {
                    router.push(`/invoice-details/${lastInvoiceId}`);
                  }
                }}
              >
                {(voucherType === 'receipt' ? lastReceiptId : lastInvoiceId) ? (
                  <Ionicons name="eye-outline" size={24} color="#6C5CE7" />
                ) : (
                  <ActivityIndicator size="small" color="#6C5CE7" />
                )}
                <Text style={styles.successButtonText}>
                  {(voucherType === 'receipt' ? lastReceiptId : lastInvoiceId) ? 'View Detail' : 'Uploading...'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.successButton}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.push(voucherType === 'receipt' ? '/receipts' : '/invoices');
                }}
              >
                <Ionicons name="list-outline" size={24} color="#6C5CE7" />
                <Text style={styles.successButtonText}>View List</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Space Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showCreateModal}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.createModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Space</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowCreateModal(false);
                  setNewSpaceName('');
                  setNewSpaceAddress('');
                }}
                style={styles.modalCloseButton}
                disabled={creating}
              >
                <Ionicons name="close" size={24} color="#2D3436" />
              </TouchableOpacity>
            </View>
            <View style={styles.createModalBody}>
              <TextInput
                style={styles.createModalInput}
                placeholder="Space Name"
                placeholderTextColor="#95A5A6"
                value={newSpaceName}
                onChangeText={setNewSpaceName}
                autoCapitalize="words"
                editable={!creating}
              />
              <TextInput
                style={[styles.createModalInput, styles.createModalMultilineInput]}
                placeholder="Address (Optional)"
                placeholderTextColor="#95A5A6"
                value={newSpaceAddress}
                onChangeText={setNewSpaceAddress}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!creating}
              />
              <View style={styles.createModalButtonRow}>
                <TouchableOpacity
                  style={[styles.createModalButton, styles.createModalCancelButton]}
                  onPress={() => {
                    setShowCreateModal(false);
                    setNewSpaceName('');
                    setNewSpaceAddress('');
                  }}
                  disabled={creating}
                >
                  <Text style={styles.createModalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createModalButton, styles.createModalConfirmButton]}
                  onPress={handleCreateSpace}
                  disabled={creating || !newSpaceName.trim()}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.createModalButtonText}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    position: 'relative',
    paddingHorizontal: 12,
    width: '100%',
  },
  topBarLeft: {
    width: 44,
    minWidth: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  invitationsBadgeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  invitationsBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#E74C3C',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  invitationsBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  pendingClaimBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6C5CE7',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 8,
  },
  pendingClaimBannerText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  householdNameContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  householdName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 20,
  },
  title: {
    fontWeight: 'bold',
    color: '#2D3436',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontWeight: 'bold',
    color: '#2D3436',
    textAlign: 'center',
  },
  iconContainer: {
    marginTop: 12,
  },
  circle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexDirection: 'row',
    position: 'relative',
  },
  chatIconContainer: {
    marginTop: 24,
  },
  chatCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexDirection: 'row',
    position: 'relative',
  },
  iconCenter: {
    position: 'absolute',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  halfButton: {
    flex: 1,
    height: '100%',
  },
  leftHalf: {
    backgroundColor: '#FFF2EB', // 低饱和度的橙色背景，用于income（#D35400的同色系）
  },
  rightHalf: {
    backgroundColor: '#F2EFF7', // 低饱和度的紫色背景，用于expenses（#6C5CE7的同色系）
  },
  button: {
    backgroundColor: '#6C5CE7',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#6C5CE7',
  },
  halfWidthButton: {
    flex: 1,
    paddingHorizontal: 16,
  },
  thirdWidthButton: {
    flex: 1,
    paddingHorizontal: 8,
  },
  firmBottomIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  firmChartCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  firmChartCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 12,
  },
  firmChartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#6C5CE7',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonAlt: {
    backgroundColor: 'rgba(255, 149, 0, 0.08)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FF9500',
  },
  secondaryButtonAltText: {
    color: '#FF9500',
    fontSize: 16,
    fontWeight: '600',
  },
  managementButton: {
    width: 44,
    minWidth: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2D3436',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerBottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  refreshModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  refreshModalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 32,
    maxWidth: 360,
    width: '100%',
  },
  refreshModalTitle: {
    marginBottom: 12,
  },
  refreshModalSubtitle: {
    fontSize: 16,
    color: '#636E72',
    textAlign: 'center',
    marginBottom: 24,
  },
  refreshModalPrimaryButton: {
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshModalPrimaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  pickerHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  pickerHeaderCenter: {
    justifyContent: 'center',
  },
  pickerTitleHidden: {
    opacity: 0,
  },
  pickerHeaderSpinnerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2D3436',
  },
  pickerScrollView: {
    maxHeight: 500,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  pickerOptionSelected: {
    backgroundColor: '#E8F4FD',
  },
  pickerOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#2D3436',
    fontWeight: '500',
  },
  pickerOptionTextSelected: {
    color: '#6C5CE7',
    fontWeight: '600',
  },
  householdOptionContent: {
    flex: 1,
  },
  householdOptionAddress: {
    fontSize: 14,
    color: '#636E72',
  },
  modalLoading: {
    padding: 20,
    alignItems: 'center',
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  createHouseholdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4FF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  createHouseholdButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  createModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
  },
  createModalBody: {
    padding: 20,
  },
  createModalInput: {
    width: '100%',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2D3436',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginBottom: 15,
  },
  createModalMultilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  createModalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
    gap: 12,
  },
  createModalButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createModalCancelButton: {
    backgroundColor: '#E9ECEF',
  },
  createModalCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#636E72',
  },
  createModalConfirmButton: {
    backgroundColor: '#6C5CE7',
  },
  createModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalCloseButton: {
    padding: 4,
  },
  processingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    minWidth: 200,
  },
  processingModalText: {
    marginTop: 16,
    fontSize: 16,
    color: '#2D3436',
    fontWeight: '500',
  },
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  successIconContainer: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2D3436',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#636E72',
    marginBottom: 32,
  },
  successButtons: {
    width: '100%',
    gap: 12,
  },
  successButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#6C5CE7',
    gap: 12,
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6C5CE7',
  },
});

