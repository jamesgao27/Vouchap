import { useState, useEffect, useCallback } from 'react';
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
  Platform,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { getOutboundById, saveOutbound, deleteOutbound } from '@/lib/outbound';
import { uploadOutboundImage } from '@/lib/supabase';
import { Outbound, OutboundItem, VoucherStatus } from '@/types';
import { format } from 'date-fns';

export default function OutboundDetailsScreen() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const router = useRouter();
  const [outbound, setOutbound] = useState<Outbound | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedOutbound, setEditedOutbound] = useState<Outbound | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    loadOutbound();
  }, [id]);

  const loadOutbound = async () => {
    if (!id) return;
    try {
      const data = await getOutboundById(id);
      setOutbound(data);
      setEditedOutbound(data);
      if (isNew === 'true') setEditing(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to load outbound');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editedOutbound || !id) return;
    try {
      await saveOutbound({
        ...editedOutbound,
        id,
        status: 'confirmed' as VoucherStatus,
      });
      Alert.alert('Success', 'Outbound saved');
      setEditing(false);
      loadOutbound();
    } catch (error) {
      Alert.alert('Error', 'Failed to save');
      console.error(error);
    }
  };

  const handleDelete = () => {
    if (!id) return;
    Alert.alert(
      'Delete Outbound',
      'Are you sure you want to delete this outbound?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOutbound(id);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  const parseLocalDate = (dateString: string): Date => {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseLocalDate(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selectedDate && editedOutbound) {
      setEditedOutbound({ ...editedOutbound, date: selectedDate.toISOString().split('T')[0] });
    }
  };

  const handleCustomerNameChange = (customerName: string) => {
    if (!editedOutbound) return;
    setEditedOutbound({ ...editedOutbound, customerName });
  };

  const calculateItemsTotal = (items: OutboundItem[]) => {
    return items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unitPrice ?? 0), 0);
  };

  const handleItemChange = (index: number, field: keyof OutboundItem, value: any) => {
    if (!editedOutbound) return;
    const newItems = [...editedOutbound.items];
    const item = { ...newItems[index], [field]: value } as OutboundItem;
    newItems[index] = item;
    const totalAmount = calculateItemsTotal(newItems);
    setEditedOutbound({ ...editedOutbound, items: newItems, totalAmount: totalAmount > 0 ? totalAmount : undefined });
  };

  const handleAddItem = () => {
    if (!editedOutbound) return;
    const newItem: OutboundItem = {
      outboundId: editedOutbound.id || '',
      productName: '',
      quantity: 1,
      unit: '件',
      unitPrice: undefined,
    };
    const newItems = [...editedOutbound.items, newItem];
    setEditedOutbound({ ...editedOutbound, items: newItems });
  };

  const handleDeleteItem = (index: number) => {
    if (!editedOutbound) return;
    const newItems = editedOutbound.items.filter((_, i) => i !== index);
    const totalAmount = calculateItemsTotal(newItems);
    setEditedOutbound({ ...editedOutbound, items: newItems, totalAmount });
  };

  const handleImagePicker = async () => {
    if (!id) return;
    Alert.alert(
      'Add Photo',
      'Choose an option',
      [
        {
          text: 'Camera',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission Needed', 'Vouchap needs access to your camera.');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
              });
              if (!result.canceled && result.assets[0]) {
                await uploadImage(result.assets[0].uri);
              }
            } catch (error) {
              console.error('Error launching camera:', error);
              Alert.alert('Error', 'Failed to launch camera.');
            }
          },
        },
        {
          text: 'Photo Library',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission Needed', 'Vouchap needs access to your photo library.');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
              });
              if (!result.canceled && result.assets[0]) {
                await uploadImage(result.assets[0].uri);
              }
            } catch (error) {
              console.error('Error picking image:', error);
              Alert.alert('Error', 'Failed to pick image.');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const uploadImage = async (imageUri: string) => {
    if (!id) return;
    setIsUploadingImage(true);
    try {
      const imageUrl = await uploadOutboundImage(imageUri, id);
      await saveOutbound({ ...(editedOutbound || outbound)!, id, imageUrl });
      await loadOutbound();
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  if (!outbound) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Outbound not found</Text>
      </View>
    );
  }

  const current = editing ? (editedOutbound || outbound) : outbound;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 出库单摘要卡片 - 复用 receipt 结构 */}
        <View style={styles.summaryCard}>
          <View style={styles.imageContainer}>
            <TouchableOpacity
              onPress={() => {
                if (current.imageUrl) {
                  setShowImageModal(true);
                } else {
                  handleImagePicker();
                }
              }}
              style={styles.imagePlaceholder}
              disabled={isUploadingImage}
            >
              {current.imageUrl ? (
                <Image source={{ uri: current.imageUrl }} style={styles.receiptImage} resizeMode="cover" />
              ) : (
                <View style={styles.imagePlaceholderContent}>
                  {isUploadingImage ? (
                    <ActivityIndicator size="small" color="#6C5CE7" />
                  ) : (
                    <Ionicons name="camera" size={32} color="#95A5A6" />
                  )}
                </View>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.summaryContent}>
            <View style={styles.summaryContentTop}>
              <View style={styles.summaryContentMain}>
                {/* 客户 */}
                {editing ? (
                  <View style={styles.storeNameInputRow}>
                    <TextInput
                      style={styles.storeNameInput}
                      value={editedOutbound?.customerName ?? ''}
                      onChangeText={handleCustomerNameChange}
                      placeholder="客户名称"
                      maxLength={100}
                    />
                  </View>
                ) : (
                  <Text style={styles.storeName} numberOfLines={1}>
                    {current.customerName || '未知客户'}
                  </Text>
                )}
                {/* 金额 - 暂留空税额 */}
                <View style={styles.amountRow}>
                  <View style={styles.amountContainer}>
                    {current.totalAmount != null && current.totalAmount > 0 && (
                      <Text style={styles.totalAmount}>
                        {(current.totalAmount < 0 ? '-' : '') + Math.abs(current.totalAmount).toFixed(2)}
                      </Text>
                    )}
                  </View>
                </View>
                {/* 发货时间 */}
                <View style={styles.dateContainer}>
                  {editing ? (
                    <TouchableOpacity
                      style={styles.dateTouchable}
                      onPress={() => setShowDatePicker(true)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.dateTag}>
                        <Text style={styles.dateText}>
                          {editedOutbound?.date ? formatDate(editedOutbound.date) : '选择日期'}
                        </Text>
                        <Ionicons name="chevron-down" size={14} color="#6C5CE7" style={styles.tagIcon} />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.date}>{formatDate(current.date)}</Text>
                  )}
                </View>
              </View>
              {/* 录入时间 + 录入人员 */}
              {current.createdAt && (
                <View style={styles.submittedInfo}>
                  <Text style={styles.submittedText}>
                    {format(new Date(current.createdAt), 'MMM dd, yyyy')}
                    {/* TODO: 添加 createdByUser 支持 */}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* 仓库+仓位 - 复用 receipt 的支付账户结构 */}
        <View style={styles.paymentCard}>
          <View style={styles.paymentRow}>
            <Text style={styles.cardLabel}>仓库+仓位</Text>
            {editing ? (
              <TouchableOpacity style={styles.accountTouchable} activeOpacity={0.7}>
                <View style={styles.accountTag}>
                  <Text style={styles.accountText} numberOfLines={1} ellipsizeMode="tail">
                    暂未设置
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#6C5CE7" style={styles.tagIcon} />
                </View>
              </TouchableOpacity>
            ) : (
              <Text style={styles.cardValue}>暂未设置</Text>
            )}
          </View>
        </View>

        {/* 商品列表 - 复用 receipt 的 items 结构 */}
        <View style={styles.itemsSection}>
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionTitle}>Items</Text>
          </View>
          {current.items.map((item, index) => (
            <View
              key={index}
              style={[styles.itemCard, index < current.items.length - 1 && styles.itemCardWithBorder]}
            >
              {editing && (
                <TouchableOpacity
                  style={styles.deleteItemButton}
                  onPress={() => handleDeleteItem(index)}
                >
                  <Ionicons name="close-circle" size={20} color="#E74C3C" />
                </TouchableOpacity>
              )}

              {/* 第一行：SKU品名 + 数量 */}
              <View style={styles.itemHeader}>
                {editing ? (
                  <TextInput
                    style={styles.itemNameInput}
                    value={item.productName ?? ''}
                    onChangeText={(text) => handleItemChange(index, 'productName', text)}
                    placeholder="SKU品名"
                  />
                ) : (
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.productName ?? ''}
                  </Text>
                )}
                {editing ? (
                  <TextInput
                    style={styles.quantityInput}
                    value={String(item.quantity)}
                    onChangeText={(text) => handleItemChange(index, 'quantity', parseFloat(text) || 0)}
                    keyboardType="decimal-pad"
                    placeholder="数量"
                  />
                ) : (
                  <Text style={styles.itemQuantity}>
                    {item.quantity}
                  </Text>
                )}
              </View>

              {/* 第二行：SKU编码（左） + 品质（中） + 单位（右） */}
              <View style={styles.itemTags}>
                {/* SKU编码 - 左侧 */}
                <View style={styles.tagGroupLeft}>
                  <View style={styles.tag}>
                    <Text style={styles.tagText} numberOfLines={1} ellipsizeMode="tail">
                      {item.skuId ? `SKU: ${item.skuId}` : 'SKU编码'}
                    </Text>
                  </View>
                </View>

                {/* 品质（次品数/合格品数） - 居中 */}
                <View style={styles.tagGroupCenter}>
                  <View style={styles.tag}>
                    <Text style={styles.tagText} numberOfLines={1} ellipsizeMode="tail">
                      品质
                    </Text>
                  </View>
                </View>

                {/* 单位 - 右侧 */}
                <View style={styles.tagGroupRight}>
                  {editing ? (
                    <TextInput
                      style={styles.unitInput}
                      value={item.unit ?? '件'}
                      onChangeText={(text) => handleItemChange(index, 'unit', text)}
                      placeholder="单位"
                    />
                  ) : (
                    <View style={styles.unitTag}>
                      <Text style={styles.unitTagText}>{item.unit ?? '件'}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}

          {editing && (
            <View style={styles.addItemButtonContainer}>
              <TouchableOpacity style={styles.addItemButton} onPress={handleAddItem}>
                <Ionicons name="add-circle-outline" size={24} color="#6C5CE7" />
                <Text style={styles.addItemText}>Add Item</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 日期选择器 */}
      {showDatePicker && (
        <>
          {Platform.OS === 'ios' ? (
            <Modal
              visible={showDatePicker}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowDatePicker(false)}
            >
              <TouchableOpacity
                style={styles.pickerOverlay}
                activeOpacity={1}
                onPress={() => setShowDatePicker(false)}
              >
                <View style={styles.pickerBottomSheet} onStartShouldSetResponder={() => true}>
                  <View style={styles.pickerHandle} />
                  <View style={styles.pickerHeader}>
                    <Text style={styles.pickerTitle}>选择日期</Text>
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(false)}
                      style={styles.pickerCloseButton}
                    >
                      <Text style={styles.pickerCloseText}>完成</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={editedOutbound?.date ? parseLocalDate(editedOutbound.date) : new Date()}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                    style={styles.datePickerIOS}
                  />
                </View>
              </TouchableOpacity>
            </Modal>
          ) : (
            <DateTimePicker
              value={editedOutbound?.date ? parseLocalDate(editedOutbound.date) : new Date()}
              mode="date"
              display="default"
              onChange={handleDateChange}
            />
          )}
        </>
      )}

      {/* 底部按钮 */}
      {editing && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              setEditing(false);
              setEditedOutbound(outbound);
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmButton} onPress={handleSave}>
            <Ionicons name="checkmark" size={24} color="#fff" />
            <Text style={styles.confirmButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 编辑按钮 */}
      {!editing && (
        <TouchableOpacity
          style={[styles.fab, styles.editFab]}
          onPress={() => {
            setEditedOutbound({ ...outbound });
            setEditing(true);
          }}
        >
          <Ionicons name="create" size={32} color="#fff" />
        </TouchableOpacity>
      )}

      {/* 图片查看模态框 */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setShowImageModal(false)}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {current.imageUrl && (
            <Image source={{ uri: current.imageUrl }} style={styles.modalImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

// 复用 receipt-details 的样式
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ECEFF1',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 100,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  imageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  imagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#E9ECEF',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptImage: {
    width: '100%',
    height: '100%',
  },
  summaryContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  summaryContentTop: {
    flex: 1,
    justifyContent: 'space-between',
  },
  summaryContentMain: {
    flex: 1,
  },
  submittedInfo: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  submittedText: {
    fontSize: 11,
    color: '#95A5A6',
    textAlign: 'right',
  },
  storeName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2D3436',
    lineHeight: 22,
    height: 22,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    paddingVertical: 0,
  },
  storeNameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
    marginBottom: 2,
  },
  storeNameInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#2D3436',
    lineHeight: 22,
    borderBottomWidth: 1,
    borderBottomColor: '#6C5CE7',
    height: 22,
    paddingVertical: 0,
    paddingRight: 4,
    transform: [{ translateY: -1 }],
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'baseline',
    marginTop: 2,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6C5CE7',
    marginRight: 8,
    lineHeight: 28,
  },
  dateContainer: {
    marginTop: 8,
    height: 24,
  },
  dateTouchable: {
    alignSelf: 'flex-start',
  },
  date: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636E72',
    lineHeight: 18,
    marginTop: 2,
    marginLeft: 11,
    marginBottom: 0,
  },
  dateText: {
    fontSize: 14,
    color: '#636E72',
    lineHeight: 18,
    fontWeight: '600',
  },
  dateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#6C5CE7',
    backgroundColor: '#F8F9FA',
    height: 20,
  },
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 14,
    color: '#636E72',
    marginRight: 12,
    fontWeight: '500',
  },
  cardValue: {
    fontSize: 14,
    color: '#2D3436',
    fontWeight: '500',
    paddingVertical: 10,
    lineHeight: 20,
    marginRight: 37,
  },
  accountTouchable: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: 40,
  },
  accountTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#6C5CE7',
    maxWidth: 250,
    minWidth: 120,
    flexShrink: 0,
  },
  accountText: {
    fontSize: 14,
    color: '#2D3436',
    fontWeight: '500',
    flexShrink: 1,
    marginRight: 6,
    maxWidth: 200,
    lineHeight: 20,
  },
  itemsSection: {
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
  },
  sectionTitleContainer: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2D3436',
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 0,
    paddingLeft: 8,
    paddingTop: 4,
    paddingBottom: 4,
    paddingRight: 32,
    marginBottom: 0,
  },
  itemCardWithBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  deleteItemButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    right: 0,
    zIndex: 1,
    padding: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3436',
    marginRight: 6,
    lineHeight: 20,
    height: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    paddingVertical: 0,
    transform: [{ translateY: -2 }],
  },
  itemNameInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3436',
    borderBottomWidth: 1,
    borderBottomColor: '#6C5CE7',
    lineHeight: 20,
    height: 20,
    paddingVertical: 0,
    marginRight: 6,
    transform: [{ translateY: -4 }],
  },
  itemQuantity: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6C5CE7',
    paddingVertical: 4,
    paddingHorizontal: 7,
    minWidth: 70,
    textAlign: 'right',
    lineHeight: 20,
  },
  quantityInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6C5CE7',
    borderWidth: 1,
    borderColor: '#6C5CE7',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    minWidth: 70,
    textAlign: 'right',
    lineHeight: 20,
  },
  itemTags: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 0,
    position: 'relative',
  },
  tagGroupLeft: {
    width: 120,
    alignItems: 'flex-start',
  },
  tagGroupCenter: {
    marginLeft: 2,
    alignItems: 'flex-start',
  },
  tagGroupRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  tag: {
    paddingLeft: 10,
    paddingRight: 5,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: 140,
    backgroundColor: '#95A5A6',
  },
  tagText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  tagIcon: {
    marginLeft: 4,
    opacity: 0.8,
    flexShrink: 0,
  },
  unitTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  unitTagText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#636E72',
  },
  unitInput: {
    fontSize: 11,
    fontWeight: '500',
    color: '#636E72',
    borderWidth: 1,
    borderColor: '#6C5CE7',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    minWidth: 50,
    textAlign: 'right',
  },
  addItemButtonContainer: {
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: '#ECEFF1',
    alignItems: 'center',
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#CED4DA',
    alignSelf: 'stretch',
  },
  addItemText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    borderTopWidth: 0,
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#DDE2E6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 6,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#636E72',
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 6,
  },
  confirmButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 6,
  },
  editFab: {
    bottom: 20,
    backgroundColor: '#95A5A6',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#E74C3C',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerBottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    maxHeight: '70%',
  },
  pickerHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#BDC3C7',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
    flex: 1,
  },
  pickerCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pickerCloseText: {
    fontSize: 16,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  datePickerIOS: {
    width: '100%',
    height: 200,
  },
});
