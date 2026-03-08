"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  getCurrentUser,
  getUserSpaces,
  setCurrentSpace,
  isAuthenticated,
} from '@/lib/auth';
import {
  getFirmClientInviteInfo,
  acceptFirmClientInvite,
  type FirmClientInviteInfo,
} from '@/lib/firm-clients';
import type { UserSpace } from '@/types';
import { showToast } from '@/lib/toast';

type Status = 'checking' | 'need_login' | 'loading' | 'ready' | 'submitting' | 'success' | 'error';

export default function ClientSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = (params.token ?? '').trim();

  const [status, setStatus] = useState<Status>('checking');
  const [inviteInfo, setInviteInfo] = useState<FirmClientInviteInfo | null>(null);
  const [spaces, setSpaces] = useState<UserSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const load = useCallback(async () => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Invalid link. Missing invite token.');
      return;
    }

    const authed = await isAuthenticated();
    if (!authed) {
      setStatus('need_login');
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
    if (clientSpaces.length === 1) {
      setSelectedSpaceId(clientSpaces[0].spaceId);
    } else {
      setSelectedSpaceId(null);
    }
    setStatus(clientSpaces.length === 0 ? 'error' : 'ready');
    if (clientSpaces.length === 0) {
      setErrorMessage('You need a client space to link. Create one first.');
    }
  }, [token]);

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

  // 未登录时展示落地页，由用户点击 "Sign in" 再跳转

  const handleConfirm = async () => {
    if (!inviteInfo || !selectedSpaceId || !token) return;
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
      setStatus('success');
      showToast('Space linked. Engagement created.', 'success');
      await setCurrentSpace(selectedSpaceId);
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

  if (status === 'success') {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.cardWrap}>
          <View style={styles.card}>
            <View style={[styles.cardHeader, styles.cardHeaderCenter]}>
              <View style={styles.iconWrapSuccess}>
                <Ionicons name="checkmark-circle" size={40} color="#00B894" />
              </View>
              <Text style={styles.successTitle}>All set</Text>
              <Text style={styles.loadingText}>Your space is linked. Go to your home when ready.</Text>
            </View>
            <View style={styles.cardBody}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/')}>
                <Text style={styles.primaryButtonText}>Go to Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ready: 与落地页一致的卡片样式
  const firmName = inviteInfo?.firmName ?? 'Your tax firm';

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.cardWrap}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
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
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.sectionLabel}>Select a space</Text>
              <View style={styles.spaceList}>
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
                      <Text style={[styles.spaceName, isSelected && styles.spaceNameSelected]} numberOfLines={1}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {spaces.length === 0 && (
                <TouchableOpacity style={styles.createSpaceCta} onPress={handleCreateSpace}>
                  <Ionicons name="add-circle-outline" size={22} color="#6C5CE7" />
                  <Text style={styles.createSpaceCtaText}>Create a client space first</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  styles.confirmButton,
                  (!selectedSpaceId || status === 'submitting') && styles.buttonDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!selectedSpaceId || status === 'submitting'}
              >
                {status === 'submitting' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Confirm and start filing</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelLink} onPress={() => router.replace('/')}>
                <Text style={styles.cancelLinkText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  cardWrap: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
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
  spaceList: {
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#FFF',
    overflow: 'hidden',
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
  primaryButton: {
    backgroundColor: '#6C5CE7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  confirmButton: {
    marginTop: 8,
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
});
