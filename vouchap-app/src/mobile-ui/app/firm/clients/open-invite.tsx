import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getCurrentSpace } from '@/lib/auth';
import {
  getFirmClientInviteHistory,
  setFirmClientInviteActive,
  deleteFirmClientInviteToken,
  buildFirmClientInviteUrl,
  createFirmClientInviteToken,
  type FirmClientInviteToken,
} from '@/lib/firm-clients';

export default function FirmOpenInviteScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [firmSpaceId, setFirmSpaceId] = useState<string | null>(null);
  const [invites, setInvites] = useState<FirmClientInviteToken[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!firmSpaceId) return;
    try {
      const { invites, error } = await getFirmClientInviteHistory(firmSpaceId);
      if (error) {
        throw error;
      }
      setInvites(invites ?? []);
    } catch (e: any) {
      console.error('FirmOpenInviteScreen load error:', e);
      Alert.alert('Failed to load invites', e?.message ?? 'Please try again.');
    }
  }, [firmSpaceId]);

  useEffect(() => {
    (async () => {
      try {
        const space = await getCurrentSpace(true);
        if (!space?.id || space.kind !== 'firm') {
          router.replace('/');
          return;
        }
        setFirmSpaceId(space.id);
      } catch (e) {
        console.error('FirmOpenInviteScreen space error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (firmSpaceId) {
      load();
    }
  }, [firmSpaceId, load]);

  const handleBack = () => {
    router.back();
  };

  const handleRefresh = async () => {
    if (!firmSpaceId) return;
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleCopyLink = async (invite: FirmClientInviteToken) => {
    if (!firmSpaceId) return;
    try {
      const url = await buildFirmClientInviteUrl(firmSpaceId, invite);
      Alert.alert('Invite link', url);
    } catch (e: any) {
      Alert.alert('Failed to copy link', e?.message ?? 'Please try again.');
    }
  };

  const handleToggleActive = async (invite: FirmClientInviteToken) => {
    if (!firmSpaceId) return;
    try {
      const next = !invite.isActive;
      const { error } = await setFirmClientInviteActive(firmSpaceId, invite.id, next);
      if (error) throw error;
      setInvites((prev) =>
        prev.map((it) => (it.id === invite.id ? { ...it, isActive: next } : it)),
      );
    } catch (e: any) {
      Alert.alert('Failed to update invite', e?.message ?? 'Please try again.');
    }
  };

  const handleDelete = (invite: FirmClientInviteToken) => {
    if (!firmSpaceId) return;
    Alert.alert(
      'Delete invite?',
      'This invite link will no longer work for clients.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await deleteFirmClientInviteToken(firmSpaceId, invite.id);
              if (error) throw error;
              setInvites((prev) => prev.filter((it) => it.id !== invite.id));
            } catch (e: any) {
              Alert.alert('Failed to delete invite', e?.message ?? 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const handleCreateInvite = async () => {
    if (!firmSpaceId) return;
    try {
      setCreating(true);
      // Quick-create invite: no specific SKU, no expiry
      const { token, url, error } = await createFirmClientInviteToken(
        firmSpaceId,
        '',
        null,
      );
      setCreating(false);
      if (error || !token) {
        Alert.alert('Failed to create invite', error?.message ?? 'Please try again.');
        return;
      }
      await load();
      Alert.alert('Invite created', url ?? 'New invite link is ready to share.');
    } catch (e: any) {
      setCreating(false);
      Alert.alert('Failed to create invite', e?.message ?? 'Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#6C5CE7" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color="#2D3436" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Open invite</Text>
        <TouchableOpacity
          onPress={handleRefresh}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#6C5CE7" />
          ) : (
            <Ionicons name="refresh" size={20} color="#636E72" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {invites.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No invites yet</Text>
            <Text style={styles.emptySubtitle}>
              Create a new invite from the clients page to share with your clients.
            </Text>
          </View>
        ) : (
          invites.map((invite) => (
            <View key={invite.id} style={styles.inviteCard}>
              <View style={styles.inviteHeaderRow}>
                <Text style={styles.inviteLabel} numberOfLines={1}>
                  {invite.label || 'Client invite'}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    invite.isActive ? styles.statusBadgeActive : styles.statusBadgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      invite.isActive ? styles.statusBadgeTextActive : styles.statusBadgeTextInactive,
                    ]}
                  >
                    {invite.isActive ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>
              <Text style={styles.inviteMeta} numberOfLines={2}>
                {invite.expiresAt
                  ? `Expires ${new Date(invite.expiresAt).toLocaleString()}`
                  : 'No expiry'}
              </Text>
              <View style={styles.inviteActionsRow}>
                <TouchableOpacity
                  style={styles.inviteActionLeft}
                  onPress={() => handleCopyLink(invite)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="link-outline" size={18} color="#6C5CE7" />
                  <Text style={styles.inviteActionText}>Copy link</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    style={styles.toggleButton}
                    onPress={() => handleToggleActive(invite)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={invite.isActive ? 'pause-outline' : 'play-outline'}
                      size={16}
                      color="#636E72"
                    />
                    <Text style={styles.toggleButtonText}>
                      {invite.isActive ? 'Pause' : 'Activate'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(invite)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={16} color="#E74C3C" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.secondaryButton, creating && { opacity: 0.8 }]}
          onPress={handleCreateInvite}
          disabled={creating}
          activeOpacity={0.7}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#6C5CE7" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="#6C5CE7" />
              <Text style={styles.secondaryButtonText}>New invite</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeButton} onPress={handleBack} activeOpacity={0.7}>
          <Text style={styles.closeButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F3F5' },
  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F3F5',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#636E72',
  },
  emptyState: {
    marginTop: 48,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#636E72',
    textAlign: 'center',
  },
  inviteCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  inviteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  inviteLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#2D3436',
    marginRight: 8,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeActive: {
    backgroundColor: '#EAEAFF',
  },
  statusBadgeInactive: {
    backgroundColor: '#ECF0F1',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  statusBadgeTextActive: {
    color: '#6C5CE7',
  },
  statusBadgeTextInactive: {
    color: '#7F8C8D',
  },
  inviteMeta: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 8,
  },
  inviteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inviteActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteActionText: {
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#6C5CE7',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F4F6F7',
    marginRight: 8,
  },
  toggleButtonText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#636E72',
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDEDEC',
  },
  bottomBar: {
    padding: 16,
    paddingBottom: 16 + 8,
    backgroundColor: '#F1F3F5',
  },
  closeButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#2D3436',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

