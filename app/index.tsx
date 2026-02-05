import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, ActivityIndicator, Alert, ScrollView, TextInput, Dimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { isAuthenticated, getCurrentUser, getCurrentSpace, setCurrentSpace, getUserSpaces, createSpace } from '@/lib/auth';
import { initializeAuthCache, isCacheInitialized } from '@/lib/auth-cache';
import { Space, UserSpace } from '@/types';
import { getPendingInvitationsForUser } from '@/lib/space-invitations';
import { uploadReceiptImageTemp } from '@/lib/supabase';
import { saveReceipt } from '@/lib/database';
import { processReceiptInBackground } from '@/lib/receipt-processor';
import { processImageForUpload } from '@/lib/image-processor';

/** 首页是否显示「AI 进销存」入口，发布时可设为 false 隐藏 */
const SHOW_AI_INVENTORY_ENTRY = false;

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
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);
  
  // Check if running in Expo Go
  const isExpoGo = Constants.appOwnership === 'expo';

  useEffect(() => {
    checkAuth();
  }, []);

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

  // 使用 useFocusEffect 在页面获得焦点时检查 pending invitations 和重新加载空间信息（用于从其他页面返回时刷新）
  useFocusEffect(
    useCallback(() => {
      if (isLoggedIn) {
        // 重新加载空间信息（用于从管理页切换空间后返回时更新）
        loadSpace();
        checkPendingInvitations();
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
      Alert.alert('Error', 'Failed to load spaces');
    }
  };

  const handleSwitchSpace = async (spaceId: string) => {
    try {
      setSwitching(true);
      const { error } = await setCurrentSpace(spaceId);
      if (error) {
        Alert.alert('Error', error.message);
        setSwitching(false);
        return;
      }

      // 更新缓存
      const updatedUser = await getCurrentUser(true);
      const updatedSpace = updatedUser ? await getCurrentSpace(true) : null;
      await initializeAuthCache(updatedUser, updatedSpace);

      setShowSpaceSwitch(false);
      
      // 更新本地状态
      if (updatedSpace) {
        setCurrentSpaceState(updatedSpace);
      }
      
      // 切换空间后检查邀请（需求：只在切换空间时检查邀请）
      // 如果检查失败（如权限问题），静默继续，不阻塞切换流程
      try {
        const { getPendingInvitationsForUser } = await import('@/lib/space-invitations');
        const invitations = await getPendingInvitationsForUser();
        
        if (invitations.length > 0) {
          // 有邀请，跳转到邀请处理页面
          router.replace('/handle-invitations');
          return;
        }
      } catch (invError) {
        // 邀请检查失败不影响切换流程，静默继续（getPendingInvitationsForUser 已处理错误）
        // 不记录错误日志，避免日志噪音
      }
      
      // 重新加载空间信息
      await loadSpace();
    } catch (error) {
      console.error('Error switching space:', error);
      Alert.alert('Error', 'Failed to switch space');
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
      Alert.alert('Error', 'Please enter space name');
      return;
    }

    try {
      setCreating(true);
      const { space, error } = await createSpace(
        newSpaceName.trim(),
        newSpaceAddress.trim() || undefined
      );

      if (error) {
        Alert.alert('Error', error.message || 'Failed to create space');
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
        Alert.alert('Success', 'Space created successfully');
      }
    } catch (error) {
      console.error('Error creating space:', error);
      Alert.alert('Error', 'Failed to create space');
    } finally {
      setCreating(false);
    }
  };

  const scanDocument = async () => {
    // If we are in Expo Go, we can't use the native scanner
    if (isExpoGo) {
      Alert.alert(
        'Development Build Required',
        'Real-time edge detection and cropping requires a native development build. In Expo Go, please use the gallery picker option.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Pick from Gallery', onPress: pickImage }
        ]
      );
      return;
    }

    try {
      // 动态导入 DocumentScanner（只在非 Expo Go 环境中导入）
      const DocumentScanner = (await import('react-native-document-scanner-plugin')).default;
      const { scannedImages } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        croppedImageQuality: 90,
        letUserAdjustCrop: false,  // 自动裁剪，无需手动调整
      } as any);

      if (scannedImages && scannedImages.length > 0) {
        // 自动裁剪后直接处理，实现 Snap 即拍即传
        processCapturedImage(scannedImages[0], false);
      }
    } catch (error) {
      console.error('Document scan error:', error);
      // 如果是模块未找到错误，提示使用开发构建
      if (error instanceof Error && error.message?.includes('TurboModuleRegistry')) {
        Alert.alert(
          'Development Build Required',
          'Document scanner requires a native development build. Please use a development build or use the gallery picker option.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Pick from Gallery', onPress: pickImage }
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to snap document. Please try again.');
      }
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        // 从相册选择的图片通常没有裁剪，这里保留自动裁剪逻辑
        processCapturedImage(result.assets[0].uri, true);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  // autoCrop 参数：
  // - 对于扫描得到的图片（已经在原生层做过裁剪），应传入 false，避免二次裁剪截断内容
  // - 对于从相册选择的原始图片，可以传入 true，启用自动裁剪去除背景
  const processCapturedImage = async (imageUri: string, autoCrop: boolean = true) => {
    // 立即显示选单，后台处理上传
    setShowSuccessModal(true);
    setLastReceiptId(null); // 初始为 null，上传完成后更新
    
    // 后台异步处理（不阻塞 UI）
    (async () => {
      try {
        console.log('Processing captured image:', imageUri);

        // 1. Process image (compress, optional auto-crop, etc)
        const processedImageUri = await processImageForUpload(imageUri, {
          autoCrop,
          quality: 0.85,
        });
        console.log('Image processed:', processedImageUri);

        // 2. Upload to Supabase Storage (temp)
        const tempFileName = `temp-${Date.now()}`;
        const imageUrl = await uploadReceiptImageTemp(processedImageUri, tempFileName);
        console.log('Image uploaded:', imageUrl);

        // 3. Create receipt record
        const today = new Date().toISOString().split('T')[0];
        const receiptId = await saveReceipt({
          spaceId: '', // Will be auto-filled
          supplierName: 'Processing...',
          totalAmount: 0,
          date: today,
          status: 'processing',
          items: [],
          imageUrl: imageUrl,
        });
        console.log('Receipt record created:', receiptId);

        // 更新 receiptId，使 View Detail 可用
        setLastReceiptId(receiptId);

        // 4. Background processing with Gemini (async, don't block UI)
        processReceiptInBackground(imageUrl, receiptId, processedImageUri)
          .then(() => console.log('Background processing started'))
          .catch(err => console.error('Background processing failed:', err));

      } catch (error) {
        console.error('Processing error:', error);
        Alert.alert('Error', 'Failed to process receipt.');
        setShowSuccessModal(false);
      }
    })();
  };

  const handleCameraPress = () => {
    // 直接进入拍摄界面（扫描界面内部已支持选择已有图片）
    scanDocument();
  };

  // 认证检查中，不渲染任何内容（避免闪烁）
  if (isLoggedIn === null) {
    return null;
  }

  if (!isLoggedIn) {
    return null; // 会跳转到登录页或设置家庭页面
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
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
      
      <View style={styles.content}>
        <Text style={styles.title}>📸 Snap Vouchers,</Text>
        <Text style={styles.subtitle}>Master Accounting.</Text>
        
        <TouchableOpacity 
          style={styles.iconContainer}
          onPress={handleCameraPress}
          activeOpacity={0.8}
          disabled={isProcessing}
        >
          <View style={styles.circle}>
            <Ionicons name="camera" size={80} color="#6C5CE7" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.chatIconContainer}
          onPress={() => router.push('/voice-input')}
          activeOpacity={0.8}
        >
          <View style={styles.chatCircle}>
            <Ionicons name="chatbubble-outline" size={60} color="#6C5CE7" />
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={() => router.push('/receipts')}
      >
        <Ionicons name="list-outline" size={20} color="#6C5CE7" style={styles.buttonIcon} />
        <Text style={styles.secondaryButtonText}>Receipts List</Text>
      </TouchableOpacity>

      {SHOW_AI_INVENTORY_ENTRY && (
        <TouchableOpacity 
          style={[styles.secondaryButton, { marginTop: 12 }]}
          onPress={() => router.push('/ai-inventory')}
        >
          <Ionicons name="cube-outline" size={20} color="#6C5CE7" style={styles.buttonIcon} />
          <Text style={styles.secondaryButtonText}>AI 进销存</Text>
        </TouchableOpacity>
      )}

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
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Switch Space</Text>
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
              {switching && (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="small" color="#6C5CE7" />
                </View>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.createHouseholdButton}
                onPress={() => {
                  setShowSpaceSwitch(false);
                  setShowCreateModal(true);
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

      {/* Processing Modal - 已移除，改为静默处理 */}

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
            <Text style={styles.successTitle}>Submitted!</Text>
            <Text style={styles.successSubtitle}>Receipt is being processed</Text>
            <View style={styles.successButtons}>
              <TouchableOpacity
                style={styles.successButton}
                onPress={() => {
                  setShowSuccessModal(false);
                  scanDocument();
                }}
              >
                <Ionicons name="camera-outline" size={24} color="#6C5CE7" />
                <Text style={styles.successButtonText}>Snap Another</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.successButton, !lastReceiptId && { opacity: 0.5 }]}
                disabled={!lastReceiptId}
                onPress={() => {
                  setShowSuccessModal(false);
                  if (lastReceiptId) {
                    router.push(`/receipt-details/${lastReceiptId}`);
                  }
                }}
              >
                {lastReceiptId ? (
                  <Ionicons name="eye-outline" size={24} color="#6C5CE7" />
                ) : (
                  <ActivityIndicator size="small" color="#6C5CE7" />
                )}
                <Text style={styles.successButtonText}>
                  {lastReceiptId ? 'View Detail' : 'Uploading...'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.successButton}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.push('/receipts');
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
  },
  topBarLeft: {
    width: 44,
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
  householdNameContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
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
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2D3436',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2D3436',
    marginBottom: 30,
    textAlign: 'center',
  },
  iconContainer: {
    marginTop: 20,
  },
  circle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
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
  secondaryButtonText: {
    color: '#6C5CE7',
    fontSize: 16,
    fontWeight: '600',
  },
  managementButton: {
    width: 44,
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

