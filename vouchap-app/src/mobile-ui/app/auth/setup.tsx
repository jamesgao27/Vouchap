"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  getCurrentUser,
  getUserSpaces,
  setCurrentSpace,
  isAuthenticated,
  createSpace,
} from '@/lib/auth';
import {
  getFirmClientInviteInfo,
  acceptFirmClientInvite,
  type FirmClientInviteInfo,
} from '@/lib/firm-clients';
import { getSkuById } from '../../../shared-logic/firm';
import type { UserSpace, FirmSku } from '@/types';
import { showToast } from '@/lib/toast';
import SkuPreview from '../../components/SkuPreview';

type Status = 'checking' | 'need_login' | 'loading' | 'ready' | 'submitting' | 'success' | 'error';

const NEW_SPACE_SENTINEL_ID = '__NEW_SPACE__';

/** 移动端：视口高度减去头部、表单上边/标签、Create 区块、按钮栏、内边距后的高度，作为选项表最大高度 */
const MOBILE_FIXED_HEIGHT_EXCLUDING_LIST = 566;

export default function ClientSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = (params.token ?? '').trim();

  const [status, setStatus] = useState<Status>('checking');
  const [inviteInfo, setInviteInfo] = useState<FirmClientInviteInfo | null>(null);
  const [spaces, setSpaces] = useState<UserSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [skuPreview, setSkuPreview] = useState<FirmSku | null>(null);
  const [newSpaceName, setNewSpaceName] = useState<string>('');
  const [isNarrowWeb, setIsNarrowWeb] = useState<boolean>(false);
  const [spaceListContentHeight, setSpaceListContentHeight] = useState(0);
  const isWeb = Platform.OS === 'web';
  const { height: windowHeight } = useWindowDimensions();
  const mobileSpaceListMaxHeight = Math.max(120, windowHeight - MOBILE_FIXED_HEIGHT_EXCLUDING_LIST);
  const webPanelHeight = isWeb ? Math.round(windowHeight * 0.8) : 0;
  const webPanelHeightRight = isWeb ? Math.round(windowHeight * 0.8) - 196 : 0;

  const load = useCallback(async () => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Invalid link. Missing invite token.');
      return;
    }

    const authed = await isAuthenticated();
    if (!authed) {
      // 未登录时直接跳到登录页，并带上 redirect + token，登录后返回本页继续流程
      router.replace({
        pathname: '/login',
        params: { redirect: '/auth/setup', token },
      });
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    const [infoRes, userSpaces] = await Promise.all([
      getFirmClientInviteInfo(token),
      getUserSpaces(),
    ]);

    if (infoRes.error || !infoRes.info) {
      setStatus('error');
      // 与 Invite history 中 Inactive 一致：落地页对已关闭/过期/达上限的邀请显示已失效
      const message =
        infoRes.error?.message ??
        (token ? '此邀请已失效，无法继续使用。' : 'Invalid or expired invite link.');
      setErrorMessage(message);
      return;
    }

    const clientSpaces = userSpaces.filter((us) => us.space?.kind === 'client');
    setInviteInfo(infoRes.info);
    setSpaces(clientSpaces);

    // 加载 SKU 预览信息：用于在「Link your space with」页右侧展示关联服务
    try {
      const sku = await getSkuById(infoRes.info.skuId);
      if (sku) {
        const skuObj: FirmSku = {
          id: infoRes.info.skuId,
          firmSpaceId: infoRes.info.firmSpaceId,
          name: sku.name,
          description: sku.description ?? undefined,
          imageUrl: sku.imageUrl ?? null,
          isPublished: sku.isPublished ?? false,
          templateStatus: sku.templateStatus ?? undefined,
          itemsCount: undefined,
          taxCountry: sku.taxCountry ?? null,
          taxScenario: sku.taxScenario ?? null,
          createdAt: undefined,
          updatedAt: undefined,
        };
        setSkuPreview(skuObj);
      } else {
        setSkuPreview(null);
      }
    } catch {
      setSkuPreview(null);
    }

    if (clientSpaces.length === 1) {
      setSelectedSpaceId(clientSpaces[0].spaceId);
    } else {
      setSelectedSpaceId(null);
    }
    setStatus(clientSpaces.length === 0 ? 'error' : 'ready');
    if (clientSpaces.length === 0) {
      setErrorMessage('You need a client space to link. Create one first.');
    }
  }, [router, token]);

  useEffect(() => {
    load();
  }, [load]);

  // 无 token 时直接报错
  useEffect(() => {
    if (!token && status === 'checking') {
      setStatus('error');
      setErrorMessage('Invalid link. Missing invite token.');
    }
  }, [token, status]);

  useEffect(() => {
    if (!isWeb) return;
    const updateLayout = () => {
      if (typeof window === 'undefined') return;
      setIsNarrowWeb(window.innerWidth < 960);
    };
    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => {
      window.removeEventListener('resize', updateLayout);
    };
  }, [isWeb]);

  // 未登录时展示落地页，由用户点击 "Sign in" 再跳转

  const handleConfirm = async () => {
    if (!inviteInfo || !selectedSpaceId || !token) return;

    // 选择「Create a new」时：先快速创建一个 client 空间，再消费邀请并绑定
    if (selectedSpaceId === NEW_SPACE_SENTINEL_ID) {
      if (!newSpaceName.trim()) {
        showToast('Please enter space name', 'error');
        return;
      }
      setStatus('submitting');
      const { space, error: createError } = await createSpace(
        newSpaceName.trim(),
        undefined,
        { kind: 'client' }
      );
      if (!space || createError) {
        setStatus('ready');
        showToast(createError?.message ?? 'Failed to create space', 'error');
        return;
      }

      const user = await getCurrentUser(true);
      if (!user) {
        setStatus('ready');
        showToast('Please sign in again', 'error');
        return;
      }

      const { result, error } = await acceptFirmClientInvite(
        token,
        space.id,
        user.id
      );
      if (error || !result) {
        setStatus('ready');
        showToast(error?.message ?? 'Failed to link space', 'error');
        return;
      }

      await setCurrentSpace(space.id);
      showToast(
        'Space created and linked. Engagement created.',
        'success',
        2200,
        'center-success',
      );
      router.replace('/tax-filing');
      return;
    }

    // 选择已有空间：维持原有逻辑
    const user = await getCurrentUser();
    if (!user) {
      showToast('Please sign in again', 'error');
      setStatus('need_login');
      return;
    }

    setStatus('submitting');
    const { result, error } = await acceptFirmClientInvite(
      token,
      selectedSpaceId,
      user.id
    );

    if (error) {
      setStatus('ready');
      showToast(error.message ?? 'Failed to link space', 'error');
      return;
    }

    if (result) {
      await setCurrentSpace(selectedSpaceId);
      showToast(
        'Space linked. Engagement created.',
        'success',
        2200,
        'center-success',
      );
      router.replace('/tax-filing');
    } else {
      setStatus('ready');
      showToast('Could not complete. Try again.', 'error');
    }
  };

  const handleCreateSpace = () => {
    router.replace({
      pathname: '/setup-space',
      params: { redirect: '/auth/setup', token },
    });
  };

  if (status === 'need_login' && token) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.cardWrap}>
          <View style={styles.card}>
            <View style={[styles.cardHeader, styles.cardHeaderCenter]}>
              <View style={styles.iconWrap}>
                <Ionicons name="log-in-outline" size={40} color="#6C5CE7" />
              </View>
              <Text style={styles.pageTitle}>Sign in to continue</Text>
              <Text style={styles.loadingText}>
                You need to sign in to link your space with this invitation.
              </Text>
            </View>
            <View style={styles.cardBody}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() =>
                  router.replace({
                    pathname: '/login',
                    params: { redirect: '/auth/setup', token },
                  })
                }
              >
                <Text style={styles.primaryButtonText}>Sign in</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelLink} onPress={() => router.replace('/')}>
                <Text style={styles.cancelLinkText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.cardWrap}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconWrapError}>
                <Ionicons name="alert-circle-outline" size={40} color="#E74C3C" />
              </View>
              <Text style={styles.errorTitle}>
                {errorMessage.includes('已失效') ? '此邀请已失效' : 'Invalid or expired link'}
              </Text>
              <Text style={styles.errorMessage}>{errorMessage}</Text>
            </View>
            <View style={styles.cardBody}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/')}>
                <Text style={styles.primaryButtonText}>Go to Home</Text>
              </TouchableOpacity>
              {errorMessage.includes('Create one') && (
                <TouchableOpacity style={styles.secondaryButton} onPress={handleCreateSpace}>
                  <Text style={styles.secondaryButtonText}>Create a space</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (status === 'checking' || status === 'loading') {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.cardWrap}>
          <View style={styles.card}>
            <View style={[styles.cardHeader, styles.cardHeaderCenter]}>
              <ActivityIndicator size="large" color="#6C5CE7" />
              <Text style={styles.loadingText}>
                {status === 'checking' ? 'Checking...' : 'Loading invite...'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ready: 与落地页一致的卡片样式
  const firmName = inviteInfo?.firmName ?? 'Your tax firm';
  const skuId = inviteInfo?.skuId ?? '';

  const openSkuPreview = () => {
    if (skuId && inviteInfo?.firmSpaceId) {
      router.push({
        pathname: '/auth/setup-sku-preview',
        params: { skuId, firmSpaceId: inviteInfo.firmSpaceId },
      });
    } else if (skuId) {
      router.push({ pathname: '/auth/setup-sku-preview', params: { skuId } });
    }
  };

  const cardHeaderContent = (
    <>
      <View style={styles.iconWrap}>
        <Ionicons name="link" size={40} color="#6C5CE7" />
      </View>
      <Text style={styles.pageTitle}>Link your space with</Text>
      <View style={styles.firmNameBlock}>
        <Text style={styles.firmNameText}>{firmName}</Text>
      </View>
      <Text style={styles.pageSubtitle}>
        Select a space to link and start tax filing:
      </Text>
    </>
  );

  async function handleMobileBack() {
    try {
      const authed = await isAuthenticated();
      if (authed) {
        router.replace('/');
      } else {
        router.replace('/login');
      }
    } catch {
      router.replace('/');
    }
  }

  const renderSpaceForm = (variant?: 'web' | 'mobile') => {
    const isMobileVariant = variant === 'mobile';
    const bottomBlock = (
      <>
        <TouchableOpacity
          style={[
            styles.newSpaceOption,
            isWeb && styles.newSpaceOptionWeb,
            selectedSpaceId === NEW_SPACE_SENTINEL_ID && styles.newSpaceOptionSelected,
          ]}
          onPress={() => setSelectedSpaceId(NEW_SPACE_SENTINEL_ID)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={
              selectedSpaceId === NEW_SPACE_SENTINEL_ID
                ? 'radio-button-on'
                : 'radio-button-off'
            }
            size={22}
            color={selectedSpaceId === NEW_SPACE_SENTINEL_ID ? '#6C5CE7' : '#BDC3C7'}
          />
          <View style={styles.newSpaceTextWrap}>
            <Text
              style={[
                styles.newSpaceTitle,
                selectedSpaceId === NEW_SPACE_SENTINEL_ID && styles.newSpaceTitleSelected,
              ]}
              numberOfLines={1}
            >
              Create a new space
            </Text>
            <Text style={styles.newSpaceSubtitle} numberOfLines={1}>
              Start with a brand new client space
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.newSpaceInputReserve}>
          {selectedSpaceId === NEW_SPACE_SENTINEL_ID ? (
            <TextInput
              style={styles.newSpaceInput}
              placeholder="Enter new space name"
              placeholderTextColor="#95A5A6"
              value={newSpaceName}
              onChangeText={setNewSpaceName}
            />
          ) : null}
        </View>
        {isWeb && (
          <View style={[styles.actionRow, styles.actionRowWeb]}>
            <TouchableOpacity
              style={[styles.secondaryActionButton, styles.secondaryActionButtonWeb]}
              onPress={() => router.replace('/')}
              disabled={status === 'submitting'}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryActionText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.primaryButtonWeb,
                styles.confirmButton,
                ((!selectedSpaceId ||
                  (selectedSpaceId === NEW_SPACE_SENTINEL_ID && !newSpaceName.trim()) ||
                  status === 'submitting') &&
                  styles.buttonDisabled),
              ]}
              onPress={handleConfirm}
              disabled={
                !selectedSpaceId ||
                (selectedSpaceId === NEW_SPACE_SENTINEL_ID && !newSpaceName.trim()) ||
                status === 'submitting'
              }
              activeOpacity={0.8}
            >
              {status === 'submitting' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </>
    );

    return (
      <View style={[styles.linkLeft, isWeb && styles.linkLeftWeb]}>
        <View style={[styles.linkLeftContent, isWeb && styles.linkLeftContentWeb, isMobileVariant && styles.linkLeftContentMobile]}>
          <Text style={styles.sectionLabel}>Select a space</Text>
          <View
            style={[
              styles.spaceListWrap,
              isWeb && styles.spaceListWrapWeb,
              isMobileVariant && styles.spaceListWrapMobile,
              isMobileVariant && {
                flex: undefined,
                maxHeight: mobileSpaceListMaxHeight,
                height: spaceListContentHeight > 0
                  ? Math.min(spaceListContentHeight, mobileSpaceListMaxHeight)
                  : mobileSpaceListMaxHeight,
              },
              !isWeb && !isMobileVariant && { height: Math.round(windowHeight * 0.28), flexDirection: 'column' as const },
            ]}
          >
            <View style={styles.spaceList}>
              <ScrollView
                style={styles.spaceListInner}
                contentContainerStyle={[
                  styles.spaceListInnerContent,
                  isMobileVariant && styles.spaceListInnerContentMobile,
                ]}
                nestedScrollEnabled
                showsVerticalScrollIndicator={spaces.length > 4}
                onContentSizeChange={isMobileVariant ? (_w, h) => setSpaceListContentHeight(h) : undefined}
              >
                {spaces.map((us, i) => {
                  const isSelected = selectedSpaceId === us.spaceId;
                  const name = us.space?.name ?? 'Unnamed space';
                  const isLast = i === spaces.length - 1;
                  return (
                    <TouchableOpacity
                      key={us.spaceId}
                      style={[
                        styles.spaceRow,
                        isSelected && styles.spaceRowSelected,
                        isLast && styles.spaceRowLast,
                      ]}
                      onPress={() => setSelectedSpaceId(us.spaceId)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={isSelected ? '#6C5CE7' : '#BDC3C7'}
                      />
                      <Text
                        style={[styles.spaceName, isSelected && styles.spaceNameSelected]}
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
          {spaces.length === 0 && (
            <TouchableOpacity
              style={styles.createSpaceCta}
              onPress={handleCreateSpace}
            >
              <Ionicons name="add-circle-outline" size={22} color="#6C5CE7" />
              <Text style={styles.createSpaceCtaText}>
                Create a client space first
              </Text>
            </TouchableOpacity>
          )}
          {isMobileVariant && spaces.length > 0 && (
            <>
              <TouchableOpacity
                style={[
                  styles.newSpaceOption,
                  selectedSpaceId === NEW_SPACE_SENTINEL_ID && styles.newSpaceOptionSelected,
                ]}
                onPress={() => setSelectedSpaceId(NEW_SPACE_SENTINEL_ID)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={
                    selectedSpaceId === NEW_SPACE_SENTINEL_ID
                      ? 'radio-button-on'
                      : 'radio-button-off'
                  }
                  size={22}
                  color={selectedSpaceId === NEW_SPACE_SENTINEL_ID ? '#6C5CE7' : '#BDC3C7'}
                />
                <View style={styles.newSpaceTextWrap}>
                  <Text
                    style={[
                      styles.newSpaceTitle,
                      selectedSpaceId === NEW_SPACE_SENTINEL_ID && styles.newSpaceTitleSelected,
                    ]}
                    numberOfLines={1}
                  >
                    Create a new space
                  </Text>
                  <Text style={styles.newSpaceSubtitle} numberOfLines={1}>
                    Start with a brand new client space
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.newSpaceInputReserve}>
                {selectedSpaceId === NEW_SPACE_SENTINEL_ID ? (
                  <TextInput
                    style={styles.newSpaceInput}
                    placeholder="Enter new space name"
                    placeholderTextColor="#95A5A6"
                    value={newSpaceName}
                    onChangeText={setNewSpaceName}
                  />
                ) : null}
              </View>
            </>
          )}
        </View>
        {isMobileVariant ? null : isWeb ? (
          <View style={styles.linkLeftBottomWeb}>
            {bottomBlock}
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[
                styles.newSpaceOption,
                selectedSpaceId === NEW_SPACE_SENTINEL_ID && styles.newSpaceOptionSelected,
              ]}
              onPress={() => setSelectedSpaceId(NEW_SPACE_SENTINEL_ID)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={
                  selectedSpaceId === NEW_SPACE_SENTINEL_ID
                    ? 'radio-button-on'
                    : 'radio-button-off'
                }
                size={22}
                color={selectedSpaceId === NEW_SPACE_SENTINEL_ID ? '#6C5CE7' : '#BDC3C7'}
              />
              <View style={styles.newSpaceTextWrap}>
                <Text
                  style={[
                    styles.newSpaceTitle,
                    selectedSpaceId === NEW_SPACE_SENTINEL_ID && styles.newSpaceTitleSelected,
                  ]}
                  numberOfLines={1}
                >
                  Create a new space
                </Text>
                <Text style={styles.newSpaceSubtitle} numberOfLines={1}>
                  Start with a brand new client space
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.newSpaceInputReserve}>
              {selectedSpaceId === NEW_SPACE_SENTINEL_ID ? (
                <TextInput
                  style={styles.newSpaceInput}
                  placeholder="Enter new space name"
                  placeholderTextColor="#95A5A6"
                  value={newSpaceName}
                  onChangeText={setNewSpaceName}
                />
              ) : null}
            </View>
          </>
        )}
      </View>
    );
  };

  const mainCard = (
    <View style={[styles.card, isWeb && styles.cardWeb]}>
      <View style={styles.cardHeader}>
        {cardHeaderContent}
      </View>

      <View style={[styles.cardBody, isWeb && !isNarrowWeb && styles.cardBodyWeb]}>
        <View style={[styles.linkRow, isWeb && styles.linkRowWeb]}>
          {renderSpaceForm()}

          {/* Mobile: SKU preview only via header tap → /auth/setup-sku-preview */}
        </View>
      </View>
    </View>
  );

  if (!isWeb) {
    return (
      <KeyboardAvoidingView
        style={styles.mobileContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <StatusBar style="dark" />
        <View style={styles.mobileContent}>
          <View style={styles.mobileContentInner}>
            <View style={styles.mobileHeader}>
              <TouchableOpacity
                style={styles.mobileBackButton}
                onPress={handleMobileBack}
              >
                <Ionicons name="arrow-back" size={24} color="#2D3436" />
              </TouchableOpacity>
              <View style={styles.mobileIconContainer}>
                <View style={styles.mobileCircle}>
                  <Ionicons name="link" size={52} color="#6C5CE7" />
                </View>
              </View>
              <Text style={styles.pageTitle}>Link your space with</Text>
              <View style={styles.firmNameBlock}>
                <Text style={styles.firmNameText}>{firmName}</Text>
              </View>
              <Text style={styles.pageSubtitle}>
                Select a space to link and start tax filing:
              </Text>
            </View>

            <View style={styles.mobileForm}>
              {renderSpaceForm('mobile')}
            </View>
          </View>

          <View style={styles.mobileActionsBar}>
            <View style={styles.mobileActions}>
              <TouchableOpacity
                style={styles.mobileSecondaryButton}
                onPress={() => router.replace('/')}
                disabled={status === 'submitting'}
                activeOpacity={0.7}
              >
                <Text style={styles.mobileSecondaryButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.mobilePrimaryButton,
                  ((!selectedSpaceId ||
                    (selectedSpaceId === NEW_SPACE_SENTINEL_ID && !newSpaceName.trim()) ||
                    status === 'submitting') &&
                    styles.buttonDisabled),
                ]}
                onPress={handleConfirm}
                disabled={
                  !selectedSpaceId ||
                  (selectedSpaceId === NEW_SPACE_SENTINEL_ID && !newSpaceName.trim()) ||
                  status === 'submitting'
                }
                activeOpacity={0.8}
              >
                {status === 'submitting' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.mobilePrimaryButtonText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isWeb && (isNarrowWeb ? styles.scrollContentWebNarrow : styles.scrollContentWeb),
          isWeb &&
            !isNarrowWeb && {
              minHeight: windowHeight,
              paddingTop: Math.round(windowHeight * 0.1),
              paddingBottom: Math.round(windowHeight * 0.1),
            },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {isWeb && !isNarrowWeb ? (
          <View style={[styles.webRowPanelsWrap, { height: webPanelHeight }]}>
            <View style={styles.webRowPanelsSpacer} />
            <View style={[styles.cardWrap, styles.cardWrapWeb, { height: webPanelHeight }]}>
              {mainCard}
            </View>
            <View style={styles.webRowPanelsSpacer}>
              {skuPreview && (
                <>
                  <View style={styles.webRowPanelsGap} />
                  <View
                    style={[
                      styles.skuPreviewColumn,
                      styles.skuPreviewColumnWeb,
                      { height: webPanelHeightRight },
                    ]}
                  >
                    <Text style={styles.skuPreviewTitle}>Service preview</Text>
                    <View style={styles.skuPreviewContentWeb}>
                      <SkuPreview
                        sku={skuPreview}
                        maxHeight={Math.max(0, webPanelHeightRight - 60)}
                      />
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>
        ) : isWeb && isNarrowWeb ? (
          <View style={[styles.webRow, styles.webRowNarrow]}>
            <View style={[styles.cardWrap, styles.cardWrapWeb]}>
              {mainCard}
            </View>
            {skuPreview && (
              <View style={styles.skuPreviewColumn}>
                <Text style={styles.skuPreviewTitle}>Service preview</Text>
                <SkuPreview sku={skuPreview} />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.cardWrap}>
            {mainCard}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  scrollContentWeb: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 32,
  },
  scrollContentWebNarrow: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 24,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
  },
  cardWrapWeb: {
    flex: 1,
    maxWidth: 480,
    alignSelf: 'stretch',
  },
  cardHeaderTouchable: {
    alignItems: 'center',
    width: '100%',
  },
  headerSkuHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  headerSkuHintText: {
    fontSize: 13,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardWeb: {
    flex: 1,
    minHeight: 576,
  },
  cardMobile: {
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  cardHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardHeaderCenter: {
    justifyContent: 'center',
    minHeight: 140,
  },
  cardBody: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  cardBodyWeb: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 0,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconWrapError: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconWrapSuccess: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 6,
  },
  firmNameBlock: {
    marginBottom: 6,
  },
  firmNameText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#6C5CE7',
    textAlign: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#6C5CE7',
    paddingBottom: 2,
    paddingHorizontal: 8,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#636E72',
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636E72',
    marginBottom: 10,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  linkRowWeb: {
    gap: 0,
  },
  linkLeft: {
    flex: 1,
    minWidth: 0,
  },
  linkLeftWeb: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
  },
  linkLeftContent: {
    flexShrink: 1,
  },
  linkLeftContentWeb: {
    flex: 1,
    minHeight: 0,
  },
  linkLeftBottomWeb: {
    flexShrink: 0,
    marginTop: 8,
    paddingBottom: 36,
  },
  actionRowWeb: {
    marginTop: 16,
  },
  linkRight: {
    flexShrink: 0,
    width: 220,
    marginLeft: 8,
  },
  skuPreviewFloat: {
    flex: 0,
    width: 280,
    maxWidth: 320,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  skuPreviewFloatNarrow: {
    width: '100%',
    maxWidth: 448,
  },
  webRow: {
    width: '100%',
    maxWidth: 1040,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 24,
    alignSelf: 'center',
  },
  webRowPanelsWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  webRowPanelsSpacer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  webRowPanelsGap: {
    width: 12,
  },
  webRowPanels: {
    alignItems: 'flex-end',
    minHeight: 0,
  },
  webRowNarrow: {
    flexDirection: 'column',
  },
  skuPreviewColumn: {
    width: 380,
    maxWidth: 400,
    flexShrink: 0,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    alignSelf: 'flex-end',
  },
  skuPreviewColumnWeb: {
    flexDirection: 'column',
    paddingBottom: 36,
  },
  skuPreviewContentWeb: {
    flex: 1,
    minHeight: 0,
  },
  skuPreviewTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636E72',
    marginBottom: 6,
  },
  spaceListWrap: {
    marginBottom: 20,
  },
  spaceListWrapWeb: {
    flex: 1,
    minHeight: 0,
    marginBottom: 0,
  },
  spaceList: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  spaceListInner: {
    flex: 1,
  },
  spaceListInnerContent: {
    paddingBottom: 0,
  },
  /** 移动端：选项表内容不拉伸，超出时滚动 */
  spaceListInnerContentMobile: {
    flexGrow: 0,
  },
  spaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
    gap: 12,
  },
  spaceRowSelected: {
    backgroundColor: 'rgba(108, 92, 231, 0.06)',
  },
  spaceRowLast: {
    borderBottomWidth: 0,
  },
  spaceName: {
    fontSize: 16,
    color: '#2D3436',
    flex: 1,
  },
  spaceNameSelected: {
    fontWeight: '600',
    color: '#6C5CE7',
  },
  createSpaceCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginBottom: 20,
  },
  createSpaceCtaText: {
    fontSize: 15,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  newSpaceOption: {
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  newSpaceOptionWeb: {
    marginTop: 0,
  },
  newSpaceOptionSelected: {
    borderColor: '#6C5CE7',
    backgroundColor: 'rgba(108, 92, 231, 0.05)',
  },
  newSpaceTextWrap: {
    flex: 1,
  },
  newSpaceTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3436',
  },
  newSpaceTitleSelected: {
    color: '#6C5CE7',
  },
  newSpaceSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#636E72',
  },
  newSpaceInputContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  newSpaceInputReserve: {
    minHeight: 52,
    marginTop: 12,
    marginBottom: 0,
    justifyContent: 'center',
  },
  newSpaceLabel: {
    fontSize: 13,
    color: '#636E72',
    marginBottom: 6,
    fontWeight: '500',
  },
  newSpaceInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#2D3436',
    backgroundColor: '#FFFFFF',
  },
  primaryButton: {
    backgroundColor: '#6C5CE7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  confirmButton: {
    marginTop: 0,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  secondaryButton: {
    paddingVertical: 12,
    marginTop: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelLinkText: {
    fontSize: 14,
    color: '#636E72',
  },
  loadingText: {
    fontSize: 15,
    color: '#636E72',
    marginTop: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#636E72',
    textAlign: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00B894',
    marginTop: 16,
  },
  mobileContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  mobileScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  mobileContentInner: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  linkLeftContentMobile: {
    flex: 1,
    minHeight: 0,
  },
  spaceListWrapMobile: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column' as const,
    marginBottom: 0,
  },
  mobileHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  mobileBackButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: 8,
  },
  mobileIconContainer: {
    marginBottom: 24,
    marginTop: 20,
  },
  mobileCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#2D3436',
    marginBottom: 4,
    textAlign: 'center',
  },
  mobileFirmName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6C5CE7',
    marginBottom: 6,
    textAlign: 'center',
  },
  mobileSubtitle: {
    fontSize: 14,
    color: '#636E72',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  mobileForm: {
    flex: 1,
    minHeight: 0,
    paddingTop: 12,
  },
  mobileContent: {
    flex: 1,
  },
  mobileActionsBar: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 8,
    backgroundColor: '#F8F9FA',
  },
  mobileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  mobileSecondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    minHeight: 48,
    minWidth: 0,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileSecondaryButtonText: {
    fontSize: 15,
    color: '#636E72',
    fontWeight: '500',
  },
  mobilePrimaryButton: {
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 0,
    flex: 1,
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  mobilePrimaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  secondaryActionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionButtonWeb: {
    paddingVertical: 14,
    minWidth: 140,
    minHeight: 48,
  },
  primaryButtonWeb: {
    paddingVertical: 14,
    minWidth: 140,
    minHeight: 48,
  },
  secondaryActionText: {
    fontSize: 15,
    color: '#636E72',
    fontWeight: '500',
  },
});
