import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  getPurposes,
  createPurpose,
  updatePurpose,
  deletePurpose,
  Purpose,
} from '@/lib/purposes';
import type { ExpenseIncomeScope } from '@/types';
import { GradientText } from '@/lib/GradientText';
import { showToast } from '@/lib/toast';
import { confirmDestructive } from '@/lib/alertWeb';
import { TAG_COLOR_LIBRARY } from '@/lib/category-purpose-presets';

const COLOR_OPTIONS = [...TAG_COLOR_LIBRARY];

export default function PurposesManageScreen() {
  const router = useRouter();
  const [expensePurposes, setExpensePurposes] = useState<Purpose[]>([]);
  const [incomePurposes, setIncomePurposes] = useState<Purpose[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#95A5A6');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addScope, setAddScope] = useState<ExpenseIncomeScope>('expense');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#95A5A6');

  useEffect(() => {
    loadPurposes();
  }, []);

  const loadPurposes = async () => {
    try {
      setLoading(true);
      const [expense, income] = await Promise.all([
        getPurposes('expense'),
        getPurposes('income'),
      ]);
      setExpensePurposes(expense);
      setIncomePurposes(income);
    } catch (error) {
      console.error('Error loading purposes:', error);
      showToast('Failed to load purposes', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPurpose = async () => {
    if (!newName.trim()) {
      showToast('Please enter purpose name', 'error');
      return;
    }

    try {
      const newPurpose = await createPurpose(newName.trim(), newColor, addScope);
      if (addScope === 'expense') {
        setExpensePurposes(prev => [...prev, newPurpose]);
      } else {
        setIncomePurposes(prev => [...prev, newPurpose]);
      }
      setNewName('');
      setNewColor('#95A5A6');
      setShowAddForm(false);
      showToast('Purpose created', 'success');
    } catch (error: any) {
      console.error('Error creating purpose:', error);
      showToast(error.message || 'Failed to create purpose', 'error');
      loadPurposes();
    }
  };

  const handleUpdatePurpose = async (purposeId: string) => {
    if (!editName.trim()) {
      showToast('Please enter purpose name', 'error');
      return;
    }

    try {
      await updatePurpose(purposeId, {
        name: editName.trim(),
        color: editColor,
      });
      // 乐观更新：直接更新列表中的用途，不需要重新加载所有用途
      const upd = { name: editName.trim(), color: editColor };
      setExpensePurposes(prev => prev.map(p => p.id === purposeId ? { ...p, ...upd } : p));
      setIncomePurposes(prev => prev.map(p => p.id === purposeId ? { ...p, ...upd } : p));
      setEditingId(null);
      setEditName('');
      setEditColor('#95A5A6');
      // 移除成功提示对话框
    } catch (error: any) {
      console.error('Error updating purpose:', error);
      showToast(error.message || 'Failed to update purpose', 'error');
      // 如果失败，重新加载以确保数据一致
      loadPurposes();
    }
  };

  const handleDeletePurpose = async (purpose: Purpose) => {
    confirmDestructive('Delete Purpose', `Are you sure you want to delete "${purpose.name}"?`, async () => {
      try {
        await deletePurpose(purpose.id);
        setExpensePurposes(prev => prev.filter(p => p.id !== purpose.id));
        setIncomePurposes(prev => prev.filter(p => p.id !== purpose.id));
        showToast('Purpose deleted', 'success');
      } catch (error: any) {
        console.error('Error deleting purpose:', error);
        showToast(error.message || 'Failed to delete purpose', 'error');
        loadPurposes();
      }
    }, { confirmLabel: 'Delete' });
  };

  const startEdit = (purpose: Purpose) => {
    setEditingId(purpose.id);
    setEditName(purpose.name);
    setEditColor(purpose.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('#95A5A6');
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
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <GradientText
            text="Tag expenses purposes and income sources, track for every transaction."
            style={styles.headerTitle}
            containerStyle={styles.gradientTextContainer}
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.purposesList}>
          <Text style={styles.sectionLabel}>Expense purposes</Text>
          {expensePurposes.map((purpose) => (
            <View key={purpose.id} style={styles.purposeCard}>
              {editingId === purpose.id ? (
                // Edit Mode - 三行显示
                <View style={styles.editRow}>
                  {/* 第一行：名称 */}
                  <TextInput
                    style={styles.editInputInline}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Purpose name"
                    placeholderTextColor="#95A5A6"
                  />
                  {/* 第二行：颜色 */}
                  <View style={styles.editColorPickerInline}>
                    {COLOR_OPTIONS.map((color) => (
                      <TouchableOpacity
                        key={color}
                        style={[
                          styles.colorOption,
                          styles.smallColorOption,
                          { backgroundColor: color },
                          editColor === color && styles.colorOptionSelected,
                        ]}
                        onPress={() => setEditColor(color)}
                      >
                        {editColor === color && (
                          <Ionicons name="checkmark" size={10} color="#fff" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* 第三行：确认取消按钮 */}
                  <View style={styles.editButtonsInline}>
                    <TouchableOpacity
                      style={styles.cancelButtonInline}
                      onPress={cancelEdit}
                    >
                      <Text style={styles.cancelButtonTextInline}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmButtonInline}
                      onPress={() => handleUpdatePurpose(purpose.id)}
                    >
                      <Text style={styles.confirmButtonTextInline}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                // Display Mode - 一行显示
                <View style={styles.purposeRow}>
                  <View
                    style={[
                      styles.purposeIndicator,
                      { backgroundColor: purpose.color },
                    ]}
                  />
                  <Text style={styles.purposeName} numberOfLines={1}>
                    {purpose.name}
                  </Text>
                  <View style={styles.purposeActions}>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => startEdit(purpose)}
                    >
                      <Ionicons name="create-outline" size={18} color="#6C5CE7" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => handleDeletePurpose(purpose)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
          {showAddForm && addScope === 'expense' ? (
            <View style={styles.formCard}>
              <Text style={styles.sectionLabel}>Expense purpose</Text>
              <TextInput
                style={styles.editInputInline}
                value={newName}
                onChangeText={setNewName}
                placeholder="Purpose name"
                placeholderTextColor="#95A5A6"
              />
              <View style={styles.editColorPickerInline}>
                {COLOR_OPTIONS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      styles.smallColorOption,
                      { backgroundColor: color },
                      newColor === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setNewColor(color)}
                  >
                    {newColor === color && (
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.editButtonsInline}>
                <TouchableOpacity
                  style={styles.cancelButtonInline}
                  onPress={() => {
                    setShowAddForm(false);
                    setNewName('');
                    setNewColor('#95A5A6');
                  }}
                >
                  <Text style={styles.cancelButtonTextInline}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButtonInline}
                  onPress={handleAddPurpose}
                >
                  <Text style={styles.confirmButtonTextInline}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.purposeCard}
              onPress={() => { setShowAddForm(true); setAddScope('expense'); }}
            >
              <View style={styles.addPurposeRow}>
                <Ionicons name="add-circle" size={20} color="#6C5CE7" />
                <Text style={styles.addPurposeText}>Add Expense Purpose</Text>
              </View>
            </TouchableOpacity>
          )}

          <Text style={[styles.sectionLabel, styles.sectionLabelAfterGroup]}>Income sources</Text>
          {incomePurposes.map((purpose) => (
            <View key={purpose.id} style={styles.purposeCard}>
              {editingId === purpose.id ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={styles.editInputInline}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Purpose name"
                    placeholderTextColor="#95A5A6"
                  />
                  <View style={styles.editColorPickerInline}>
                    {COLOR_OPTIONS.map((color) => (
                      <TouchableOpacity
                        key={color}
                        style={[
                          styles.colorOption,
                          styles.smallColorOption,
                          { backgroundColor: color },
                          editColor === color && styles.colorOptionSelected,
                        ]}
                        onPress={() => setEditColor(color)}
                      >
                        {editColor === color && (
                          <Ionicons name="checkmark" size={10} color="#fff" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.editButtonsInline}>
                    <TouchableOpacity
                      style={styles.cancelButtonInline}
                      onPress={cancelEdit}
                    >
                      <Text style={styles.cancelButtonTextInline}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmButtonInline}
                      onPress={() => handleUpdatePurpose(purpose.id)}
                    >
                      <Text style={styles.confirmButtonTextInline}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.purposeRow}>
                  <View
                    style={[
                      styles.purposeIndicator,
                      { backgroundColor: purpose.color },
                    ]}
                  />
                  <Text style={styles.purposeName} numberOfLines={1}>
                    {purpose.name}
                  </Text>
                  <View style={styles.purposeActions}>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => startEdit(purpose)}
                    >
                      <Ionicons name="create-outline" size={18} color="#6C5CE7" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => handleDeletePurpose(purpose)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
          {showAddForm && addScope === 'income' ? (
            <View style={styles.formCard}>
              <Text style={styles.sectionLabel}>Income source</Text>
              <TextInput
                style={styles.editInputInline}
                value={newName}
                onChangeText={setNewName}
                placeholder="Purpose name"
                placeholderTextColor="#95A5A6"
              />
              <View style={styles.editColorPickerInline}>
                {COLOR_OPTIONS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      styles.smallColorOption,
                      { backgroundColor: color },
                      newColor === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setNewColor(color)}
                  >
                    {newColor === color && (
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.editButtonsInline}>
                <TouchableOpacity
                  style={styles.cancelButtonInline}
                  onPress={() => {
                    setShowAddForm(false);
                    setNewName('');
                    setNewColor('#95A5A6');
                  }}
                >
                  <Text style={styles.cancelButtonTextInline}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButtonInline}
                  onPress={handleAddPurpose}
                >
                  <Text style={styles.confirmButtonTextInline}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.purposeCard}
              onPress={() => { setShowAddForm(true); setAddScope('income'); }}
            >
              <View style={styles.addPurposeRow}>
                <Ionicons name="add-circle" size={20} color="#00B894" />
                <Text style={[styles.addPurposeText, { color: '#00B894' }]}>Add Income Source</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
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
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636E72',
    marginBottom: 4,
    marginTop: 2,
  },
  sectionLabelAfterGroup: {
    marginTop: 12,
  },
  purposesList: {
    gap: 6,
  },
  purposeCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    marginBottom: 0,
  },
  addPurposeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addPurposeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  purposeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  purposeIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  purposeName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#2D3436',
  },
  purposeActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  iconButton: {
    padding: 4,
  },
  editRow: {
    flexDirection: 'column',
    gap: 6,
  },
  editInputInline: {
    width: '100%',
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
    padding: 6,
    fontSize: 15,
    color: '#2D3436',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginBottom: 6,
  },
  editColorPickerInline: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'nowrap',
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
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  smallColorOption: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorOptionSelected: {
    borderColor: '#2D3436',
  },
});

