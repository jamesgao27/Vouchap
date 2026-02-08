import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
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
import { showAiInventory } from '@/lib/feature-flags';
import { voucherDetailStyles as styles } from '../voucher-detail-styles';

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
    if (!showAiInventory) router.replace('/');
  }, []);
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

  if (!showAiInventory) return null;

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

