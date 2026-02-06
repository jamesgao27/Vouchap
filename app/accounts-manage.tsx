import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  mergeAccount,
} from '@/lib/accounts';
import { Account } from '@/types';
import { GradientText } from '@/lib/GradientText';

export default function AccountsManageScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const editNameInputRef = useRef<TextInput>(null);
  const [showDuplicateNameModal, setShowDuplicateNameModal] = useState(false);
  const [duplicateNameModalPayload, setDuplicateNameModalPayload] = useState<{
    duplicateName: string;
    targetId: string;
    editingId: string;
  } | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error('Error loading accounts:', error);
      Alert.alert('Error', 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Please enter account name');
      return;
    }

    try {
      const newAccount = await createAccount(newName.trim(), false);
      // 乐观更新：直接添加到列表中，不需要重新加载所有账户
      setAccounts(prev => [...prev, newAccount]);
      setNewName('');
      setShowAddForm(false);
      Alert.alert('Success', 'Account created');
    } catch (error: any) {
      console.error('Error creating account:', error);
      Alert.alert('Error', error.message || 'Failed to create account');
      // 如果失败，重新加载以确保数据一致
      loadAccounts();
    }
  };

  const handleUpdateAccount = async (accountId: string) => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Please enter account name');
      return;
    }

    try {
      await updateAccount(accountId, {
        name: editName.trim(),
      });
      // 乐观更新：直接更新列表中的账户，不需要重新加载所有账户
      setAccounts(prev => prev.map(acc => 
        acc.id === accountId 
          ? { ...acc, name: editName.trim() }
          : acc
      ));
      setEditingId(null);
      setEditName('');
      // 移除成功提示对话框
    } catch (error: any) {
      if (error?.code === 'ACCOUNT_NAME_EXISTS') {
        setDuplicateNameModalPayload({
          duplicateName: (error?.duplicateName ?? editName) || '',
          targetId: error?.targetId ?? '',
          editingId: accountId,
        });
        setShowDuplicateNameModal(true);
        return;
      }
      console.error('Error updating account:', error);
      Alert.alert('Error', error.message || 'Failed to update account');
      loadAccounts();
    }
  };

  const handleDuplicateNameCloseOnly = () => {
    setShowDuplicateNameModal(false);
    setDuplicateNameModalPayload(null);
  };

  /** Keep editing: close modal, stay in edit mode and focus name input + keyboard. */
  const handleDuplicateNameKeepEditing = () => {
    setShowDuplicateNameModal(false);
    setDuplicateNameModalPayload(null);
    setTimeout(() => editNameInputRef.current?.focus(), 300);
  };

  /** Do not modify: close modal and cancel editing. */
  const handleDuplicateNameDontChange = () => {
    setShowDuplicateNameModal(false);
    setDuplicateNameModalPayload(null);
    setEditingId(null);
    setEditName('');
  };

  const handleDuplicateNameMerge = async () => {
    const payload = duplicateNameModalPayload;
    if (!payload?.targetId || !payload?.editingId) return;
    setShowDuplicateNameModal(false);
    setDuplicateNameModalPayload(null);
    try {
      await mergeAccount([payload.editingId], payload.targetId);
      setEditingId(null);
      setEditName('');
      loadAccounts();
    } catch (e: any) {
      Alert.alert('Merge failed', e?.message ?? String(e));
      loadAccounts();
    }
  };

  const handleDeleteAccount = async (account: Account) => {
    Alert.alert(
      'Delete Account',
      `Are you sure you want to delete "${account.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(account.id);
              // 乐观更新：直接从列表中移除，不需要重新加载所有账户
              setAccounts(prev => prev.filter(acc => acc.id !== account.id));
              Alert.alert('Success', 'Account deleted');
            } catch (error: any) {
              console.error('Error deleting account:', error);
              Alert.alert('Error', error.message || 'Failed to delete account');
              // 如果失败，重新加载以确保数据一致
              loadAccounts();
            }
          },
        },
      ]
    );
  };

  const startEdit = (account: Account) => {
    setEditingId(account.id);
    setEditName(account.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const toggleAccountSelection = (accountId: string) => {
    const newSelected = new Set(selectedAccountIds);
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId);
    } else {
      newSelected.add(accountId);
    }
    setSelectedAccountIds(newSelected);
  };

  const handleStartMerge = () => {
    setMergeMode(true);
    setSelectedAccountIds(new Set());
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleCancelMerge = () => {
    setMergeMode(false);
    setSelectedAccountIds(new Set());
  };

  const handleConfirmMerge = () => {
    if (selectedAccountIds.size < 2) {
      Alert.alert('Error', 'Please select at least 2 accounts to merge');
      return;
    }

    // 显示选择目标账户的对话框
    const selectedAccounts = accounts.filter(acc => selectedAccountIds.has(acc.id));
    const accountNames = selectedAccounts.map(acc => acc.name).join('\n');

    Alert.alert(
      'Select Target Account',
      `Select which account to keep (others will be merged into it):\n\n${accountNames}`,
      [
        ...selectedAccounts.map(account => ({
          text: account.name,
          onPress: () => {
            const sourceIds = Array.from(selectedAccountIds).filter(id => id !== account.id);
            performMerge(sourceIds, account.id);
          },
        })),
        { text: 'Cancel', style: 'cancel' as const, onPress: handleCancelMerge },
      ]
    );
  };

  const performMerge = async (sourceAccountIds: string[], targetAccountId: string) => {
    try {
      await mergeAccount(sourceAccountIds, targetAccountId);
      await loadAccounts();
      setMergeMode(false);
      setSelectedAccountIds(new Set());
      Alert.alert('Success', 'Accounts merged successfully');
    } catch (error: any) {
      console.error('Error merging accounts:', error);
      Alert.alert('Error', error.message || 'Failed to merge accounts');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6C5CE7" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <Modal visible={showDuplicateNameModal} transparent animationType="fade" onRequestClose={handleDuplicateNameCloseOnly}>
        <TouchableOpacity style={styles.duplicateModalOverlay} activeOpacity={1} onPress={handleDuplicateNameCloseOnly}>
          <View style={styles.duplicateModalContentContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.duplicateModalContent}>
              <View style={styles.duplicateModalHeader}>
                <Ionicons name="wallet-outline" size={48} color="#6C5CE7" />
                <Text style={styles.duplicateModalTitle}>Duplicate account name:</Text>
              </View>
              <View style={styles.duplicateModalMessageBlock}>
                <View style={styles.duplicateModalNameContainer}>
                  <Text style={styles.duplicateModalNameText}>{duplicateNameModalPayload?.duplicateName || '—'}</Text>
                </View>
              </View>
              <View style={styles.duplicateModalButtons}>
                <TouchableOpacity style={[styles.duplicateModalButton, styles.duplicateModalButtonReplace]} onPress={handleDuplicateNameKeepEditing} activeOpacity={0.8}>
                  <Ionicons name="create-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.duplicateModalButtonReplaceText}>Keep editing</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.duplicateModalButton, styles.duplicateModalButtonMerge]} onPress={handleDuplicateNameMerge} activeOpacity={0.8}>
                  <Ionicons name="git-merge-outline" size={20} color="#E74C3C" style={{ marginRight: 8 }} />
                  <Text style={styles.duplicateModalButtonMergeText}>Merge into existing</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.duplicateModalButton, styles.duplicateModalButtonDontChange]} onPress={handleDuplicateNameDontChange} activeOpacity={0.8}>
                  <Ionicons name="close-outline" size={18} color="#95A5A6" style={{ marginRight: 6 }} />
                  <Text style={styles.duplicateModalButtonDontChangeText}>Do not modify</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <GradientText
            text="Accounts for receipts & invoices, support merged accounts."
            style={styles.headerTitle}
            containerStyle={styles.gradientTextContainer}
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Accounts List */}
        <View style={styles.accountsList}>
          {/* Add New Account Button */}
          {!showAddForm && !mergeMode && (
            <TouchableOpacity
              style={styles.accountCard}
              onPress={() => setShowAddForm(true)}
            >
              <View style={styles.addAccountRow}>
                <Ionicons name="add-circle" size={20} color="#6C5CE7" />
                <Text style={styles.addAccountText}>Add Account</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Merge Mode Header */}
          {mergeMode && (
            <View style={styles.mergeHeaderCard}>
              <Text style={styles.mergeHeaderText}>
                Select accounts to merge ({selectedAccountIds.size} selected)
              </Text>
              <View style={styles.mergeHeaderButtons}>
                <TouchableOpacity
                  style={styles.mergeCancelButton}
                  onPress={handleCancelMerge}
                >
                  <Text style={styles.mergeCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.mergeConfirmButton,
                    selectedAccountIds.size < 2 && styles.mergeConfirmButtonDisabled,
                  ]}
                  onPress={handleConfirmMerge}
                  disabled={selectedAccountIds.size < 2}
                >
                  <Text style={styles.mergeConfirmButtonText}>Merge</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Add Account Form */}
          {showAddForm && (
            <View style={styles.formCard}>
              {/* 第一行：名称 */}
              <TextInput
                style={styles.editInputInline}
                value={newName}
                onChangeText={setNewName}
                placeholder="Account name"
                placeholderTextColor="#95A5A6"
              />

              {/* 第二行：确认取消按钮 */}
              <View style={styles.editButtonsInline}>
                <TouchableOpacity
                  style={styles.cancelButtonInline}
                  onPress={() => {
                    setShowAddForm(false);
                    setNewName('');
                  }}
                >
                  <Text style={styles.cancelButtonTextInline}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButtonInline}
                  onPress={handleAddAccount}
                >
                  <Text style={styles.confirmButtonTextInline}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {accounts.map((account) => (
            <View key={account.id} style={styles.accountCard}>
              {editingId === account.id ? (
                // Edit Mode
                <View style={styles.editRow}>
                  {/* 第一行：名称 */}
                  <TextInput
                    ref={editNameInputRef}
                    style={styles.editInputInline}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Account name"
                    placeholderTextColor="#95A5A6"
                  />
                  {/* 第二行：确认取消按钮 */}
                  <View style={styles.editButtonsInline}>
                    <TouchableOpacity
                      style={styles.cancelButtonInline}
                      onPress={cancelEdit}
                    >
                      <Text style={styles.cancelButtonTextInline}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmButtonInline}
                      onPress={() => handleUpdateAccount(account.id)}
                    >
                      <Text style={styles.confirmButtonTextInline}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                // Display Mode
                <TouchableOpacity
                  style={[
                    styles.accountRow,
                    mergeMode && selectedAccountIds.has(account.id) && styles.accountRowSelected,
                  ]}
                  onPress={() => {
                    if (mergeMode) {
                      toggleAccountSelection(account.id);
                    }
                  }}
                  disabled={!mergeMode}
                >
                  {mergeMode && (
                    <View style={styles.checkboxContainer}>
                      {selectedAccountIds.has(account.id) ? (
                        <Ionicons name="checkbox" size={24} color="#6C5CE7" />
                      ) : (
                        <Ionicons name="checkbox-outline" size={24} color="#BDC3C7" />
                      )}
                    </View>
                  )}
                  <View style={styles.accountIndicator}>
                    <Ionicons name="card-outline" size={16} color="#6C5CE7" />
                  </View>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {account.name}
                  </Text>
                  {account.isAiRecognized && (
                    <View style={styles.aiBadge}>
                      <Text style={styles.aiBadgeText}>AI</Text>
                    </View>
                  )}
                  {!mergeMode && (
                    <View style={styles.accountActions}>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => startEdit(account)}
                      >
                        <Ionicons name="create-outline" size={18} color="#6C5CE7" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => handleDeleteAccount(account)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Merge Accounts Button (at bottom) */}
        {!mergeMode && !showAddForm && (
          <TouchableOpacity
            style={styles.mergeAccountCard}
            onPress={handleStartMerge}
          >
            <View style={styles.addAccountRow}>
              <Ionicons name="git-merge-outline" size={20} color="#FF9500" />
              <Text style={styles.mergeAccountText}>Merge Accounts</Text>
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  gradientTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  accountsList: {
    gap: 12,
  },
  accountCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
  },
  mergeAccountCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  accountName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#2D3436',
  },
  aiBadge: {
    backgroundColor: '#E8F4FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  accountActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  addAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addAccountText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  mergeAccountText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF9500',
  },
  iconButton: {
    padding: 4,
  },
  editRow: {
    flexDirection: 'column',
    gap: 8,
  },
  editInputInline: {
    width: '100%',
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
    padding: 8,
    fontSize: 15,
    color: '#2D3436',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginBottom: 8,
  },
  editButtonsInline: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    alignItems: 'center',
  },
  cancelButtonInline: {
    backgroundColor: '#E9ECEF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  confirmButtonInline: {
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButtonTextInline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#636E72',
  },
  confirmButtonTextInline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  mergeHeaderCard: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#6C5CE7',
  },
  mergeHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 12,
    textAlign: 'center',
  },
  mergeHeaderButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  mergeCancelButton: {
    flex: 1,
    backgroundColor: '#E9ECEF',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  mergeCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#636E72',
  },
  mergeConfirmButton: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  mergeConfirmButtonDisabled: {
    backgroundColor: '#BDC3C7',
    opacity: 0.5,
  },
  mergeConfirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  checkboxContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  accountRowSelected: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 4,
  },
  duplicateModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  duplicateModalContentContainer: { width: '100%', maxWidth: 400, alignItems: 'center' },
  duplicateModalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  duplicateModalHeader: { alignItems: 'center', marginBottom: 16 },
  duplicateModalTitle: { fontSize: 22, fontWeight: '600', color: '#2D3436', marginTop: 12, marginBottom: 0 },
  duplicateModalMessageBlock: { marginBottom: 24, paddingHorizontal: 8, alignItems: 'center', width: '100%' },
  duplicateModalNameContainer: { marginTop: 8, marginBottom: 20, alignSelf: 'stretch', borderBottomWidth: 1, borderBottomColor: '#E0E7FF', paddingBottom: 8 },
  duplicateModalNameText: { fontSize: 18, fontWeight: '800', color: '#6C5CE7', textAlign: 'center', letterSpacing: 0.3 },
  duplicateModalButtons: { flexDirection: 'column', width: '100%', gap: 10 },
  duplicateModalButton: { width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 52, flexDirection: 'row' },
  duplicateModalButtonReplace: { backgroundColor: '#27AE60', shadowColor: '#27AE60', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  duplicateModalButtonReplaceText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  duplicateModalButtonMerge: { backgroundColor: '#FFF5F5', borderWidth: 2, borderColor: '#E74C3C' },
  duplicateModalButtonMergeText: { fontSize: 16, fontWeight: '600', color: '#E74C3C' },
  duplicateModalButtonDontChange: { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E9ECEF' },
  duplicateModalButtonDontChangeText: { fontSize: 15, fontWeight: '500', color: '#95A5A6' },
});

