import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getInvoiceById, saveInvoice, updateInvoiceItem } from '@/lib/invoices';
import { uploadInvoiceImage } from '@/lib/supabase';
import { getCategories } from '@/lib/categories';
import { getPurposes } from '@/lib/purposes';
import { getAccounts } from '@/lib/accounts';
import { Invoice, InvoiceItem, Category, Purpose, VoucherStatus, Account } from '@/types';
import { format } from 'date-fns';

export default function InvoiceDetailsScreen() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [editedInvoice, setEditedInvoice] = useState<Invoice | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState<number | null>(null);
  const [showPurposePicker, setShowPurposePicker] = useState<number | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState<boolean>(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState<boolean>(false);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [taxInputText, setTaxInputText] = useState<string>('');
  const [priceInputTexts, setPriceInputTexts] = useState<{ [index: number]: string }>({});

  useEffect(() => {
    loadInvoice();
    loadCategories();
    loadPurposes();
    loadAccounts();
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
      loadPurposes();
      loadAccounts();
    }, [])
  );

  const loadCategories = async () => {
    try {
      const cats = await getCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadPurposes = async () => {
    try {
      const purps = await getPurposes();
      setPurposes(purps);
    } catch (error) {
      console.error('Error loading purposes:', error);
    }
  };

  const loadAccounts = async () => {
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const loadInvoice = async () => {
    if (!id) return;
    try {
      const data = await getInvoiceById(id);
      setInvoice(data);
      setEditedInvoice(data);
      if (isNew === 'true') {
        setEditing(true);
        const current = editedInvoice || data;
        setTaxInputText((current?.tax || 0).toString());
        const priceTexts: { [index: number]: string } = {};
        (current?.items || []).forEach((item, index) => {
          priceTexts[index] = item.price.toString();
        });
        setPriceInputTexts(priceTexts);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load invoice details');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editedInvoice || !id) return;
    try {
      await saveInvoice({
        ...editedInvoice,
        id,
        status: 'confirmed' as VoucherStatus,
      });
      Alert.alert('Success', 'Invoice confirmed and saved');
      setEditing(false);
      loadInvoice();
    } catch (error) {
      Alert.alert('Error', 'Failed to save');
      console.error(error);
    }
  };

  const handleConfirm = async () => {
    if (!id) return;
    try {
      await saveInvoice({
        ...(invoice!),
        id,
        status: 'confirmed' as VoucherStatus,
      });
      loadInvoice();
    } catch (error) {
      Alert.alert('Error', 'Failed to confirm invoice');
      console.error(error);
    }
  };

  const commonCurrencies = useMemo(() => ['USD', 'CAD', 'EUR', 'GBP', 'JPY', 'HKD', 'AUD', 'CNY'], []);

  const calculateItemsSum = useCallback((items: InvoiceItem[]) => {
    return items.reduce((sum, item) => sum + (item.price || 0), 0);
  }, []);

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    if (!editedInvoice) return;
    const newItems = [...editedInvoice.items];
    const updatedItem = { ...newItems[index] } as InvoiceItem;
    if (field === 'categoryId') {
      const selectedCategory = categories.find(cat => cat.id === value);
      if (selectedCategory) {
        updatedItem.categoryId = value;
        updatedItem.category = selectedCategory;
      }
    } else if (field === 'purposeId') {
      const selectedPurpose = purposes.find(p => p.id === value);
      if (selectedPurpose) {
        updatedItem.purposeId = value;
        updatedItem.purpose = selectedPurpose;
      } else {
        updatedItem.purposeId = value as string | null;
        updatedItem.purpose = undefined;
      }
    } else {
      (updatedItem as any)[field] = value;
    }
    newItems[index] = updatedItem;
    const itemsSum = calculateItemsSum(newItems);
    const tax = editedInvoice.tax || 0;
    setEditedInvoice({ ...editedInvoice, items: newItems, totalAmount: itemsSum + tax });
  };

  const handleTaxChange = (tax: number) => {
    if (!editedInvoice) return;
    const itemsSum = calculateItemsSum(editedInvoice.items);
    setEditedInvoice({ ...editedInvoice, tax, totalAmount: itemsSum + tax });
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selectedDate && editedInvoice) {
      setEditedInvoice({ ...editedInvoice, date: selectedDate.toISOString().split('T')[0] });
    }
  };

  const handleCurrencyChange = (currency: string) => {
    if (!editedInvoice) return;
    setEditedInvoice({ ...editedInvoice, currency: currency || undefined });
  };

  const handleCustomerNameChange = (customerName: string) => {
    if (!editedInvoice) return;
    setEditedInvoice({ ...editedInvoice, customerName });
  };

  const handleItemChangeDirect = async (
    index: number,
    field: 'categoryId' | 'purposeId' | 'isAsset',
    value: any
  ) => {
    if (!id || !currentInvoice) return;
    const item = currentInvoice.items[index];
    if (!item || !item.id) return;
    try {
      const newItems = [...currentInvoice.items];
      const updatedItem = { ...newItems[index] } as InvoiceItem;
      if (field === 'categoryId') {
        const selectedCategory = categories.find(cat => cat.id === value);
        if (selectedCategory) {
          updatedItem.categoryId = value;
          updatedItem.category = selectedCategory;
        }
      } else if (field === 'purposeId') {
        const selectedPurpose = purposes.find(p => p.id === value);
        if (selectedPurpose) {
          updatedItem.purposeId = value;
          updatedItem.purpose = selectedPurpose;
        } else {
          updatedItem.purposeId = value as string | null;
          updatedItem.purpose = undefined;
        }
      } else if (field === 'isAsset') {
        updatedItem.isAsset = value;
      }
      newItems[index] = updatedItem;
      setInvoice({ ...currentInvoice, items: newItems });
      await updateInvoiceItem(id, item.id, field, value);
    } catch (error) {
      console.error('Error updating item:', error);
      Alert.alert('Error', 'Failed to update item');
      loadInvoice();
    }
  };

  const handleAddItem = () => {
    if (!editedInvoice) return;
    const defaultCategory = categories.find(cat => cat.name === 'Sales') || categories[0];
    const defaultPurpose = purposes.length > 0 ? purposes[0] : null;
    const newItem: InvoiceItem = {
      name: '',
      categoryId: defaultCategory?.id ?? null,
      category: defaultCategory,
      purposeId: defaultPurpose?.id || null,
      purpose: defaultPurpose,
      price: 0,
      isAsset: false,
    };
    const newItems = [...editedInvoice.items, newItem];
    const itemsSum = calculateItemsSum(newItems);
    const tax = editedInvoice.tax || 0;
    setEditedInvoice({ ...editedInvoice, items: newItems, totalAmount: itemsSum + tax });
  };

  const handleDeleteItem = (index: number) => {
    if (!editedInvoice) return;
    const newItems = editedInvoice.items.filter((_, i) => i !== index);
    const itemsSum = calculateItemsSum(newItems);
    const tax = editedInvoice.tax || 0;
    setEditedInvoice({ ...editedInvoice, items: newItems, totalAmount: itemsSum + tax });
  };

  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseLocalDate(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
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
                Alert.alert('Permission Needed', 'Camera access is required.');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
              });
              if (!result.canceled && result.assets[0]) await uploadImage(result.assets[0].uri);
            } catch (error) {
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
                Alert.alert('Permission Needed', 'Photo library access is required.');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
              });
              if (!result.canceled && result.assets[0]) await uploadImage(result.assets[0].uri);
            } catch (error) {
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
      const imageUrl = await uploadInvoiceImage(imageUri, id);
      await saveInvoice({ ...(editedInvoice || invoice)!, id, imageUrl });
      await loadInvoice();
    } catch (error) {
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

  if (!invoice) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Invoice not found</Text>
      </View>
    );
  }

  const currentInvoice = editing ? (editedInvoice || invoice) : invoice;
  if (!currentInvoice) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Invoice not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.summaryCard}>
          <View style={styles.imageContainer}>
            <TouchableOpacity
              onPress={() => (currentInvoice.imageUrl ? setShowImageModal(true) : handleImagePicker())}
              style={styles.imagePlaceholder}
              disabled={isUploadingImage}
            >
              {currentInvoice.imageUrl ? (
                <Image source={{ uri: currentInvoice.imageUrl }} style={styles.receiptImage} resizeMode="cover" />
              ) : (
                <View style={styles.imagePlaceholderContent}>
                  {isUploadingImage ? <ActivityIndicator size="small" color="#6C5CE7" /> : <Ionicons name="document-text" size={32} color="#95A5A6" />}
                </View>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.summaryContent}>
            <View style={styles.summaryContentTop}>
              <View style={styles.summaryContentMain}>
                {editing ? (
                  <TextInput
                    style={styles.storeNameInput}
                    value={editedInvoice?.customerName ?? ''}
                    onChangeText={handleCustomerNameChange}
                    placeholder="Customer name"
                    maxLength={100}
                  />
                ) : (
                  <Text style={styles.storeName} numberOfLines={1}>
                    {currentInvoice.customerName || 'Customer'}
                  </Text>
                )}
                <View style={styles.amountRow}>
                  <View style={styles.amountContainer}>
                    <View style={styles.currencyContainer}>
                      {editing ? (
                        <TouchableOpacity style={styles.currencyPickerTouchable} onPress={() => setShowCurrencyPicker(true)} activeOpacity={0.7}>
                          <Text style={styles.currencyLabel}>{editedInvoice?.currency || 'Currency'}</Text>
                        </TouchableOpacity>
                      ) : (
                        currentInvoice.currency ? (
                          <View style={styles.currencyPickerReadonly}>
                            <Text style={styles.currencyLabel}>{currentInvoice.currency}</Text>
                          </View>
                        ) : null
                      )}
                    </View>
                    <Text style={styles.totalAmount}>
                      {editing
                        ? (() => {
                            const itemsSum = calculateItemsSum(editedInvoice?.items || []);
                            const tax = editedInvoice?.tax || 0;
                            const total = itemsSum + tax;
                            return (total < 0 ? '-' : '') + Math.abs(total).toFixed(2);
                          })()
                        : (currentInvoice.totalAmount < 0 ? '-' : '') + Math.abs(currentInvoice.totalAmount).toFixed(2)}
                    </Text>
                    {editing ? (
                      <View style={styles.taxInputContainer}>
                        <Text style={styles.taxLabel}>Tax: </Text>
                        <TextInput
                          style={styles.taxInput}
                          value={taxInputText}
                          onChangeText={(text) => {
                            const validPattern = /^-?\d*\.?\d*$/;
                            if (text === '' || text === '-' || validPattern.test(text)) {
                              setTaxInputText(text);
                              if (text !== '' && text !== '-' && text !== '.') {
                                const tax = parseFloat(text);
                                if (!isNaN(tax)) handleTaxChange(tax);
                              } else if (text === '' || text === '-') handleTaxChange(0);
                            }
                          }}
                          onBlur={() => {
                            const tax = parseFloat(taxInputText);
                            if (isNaN(tax)) {
                              setTaxInputText('0');
                              handleTaxChange(0);
                            } else {
                              setTaxInputText(tax.toString());
                              handleTaxChange(tax);
                            }
                          }}
                          keyboardType="numbers-and-punctuation"
                          placeholder="0.00"
                        />
                      </View>
                    ) : (
                      <View style={styles.taxText}>
                        <Text style={styles.taxLabel}>Tax:</Text>
                        <Text style={styles.taxValueText}>{(currentInvoice.tax ?? 0).toFixed(2)}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.dateContainer}>
                  {editing ? (
                    <TouchableOpacity style={styles.dateTouchable} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                      <View style={styles.dateTag}>
                        <Text style={styles.dateText}>{editedInvoice?.date ? formatDate(editedInvoice.date) : '选择日期'}</Text>
                        <Ionicons name="chevron-down" size={14} color="#6C5CE7" style={styles.tagIcon} />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.date}>{formatDate(currentInvoice.date)}</Text>
                  )}
                </View>
              </View>
              {currentInvoice.createdAt && (
                <View style={styles.submittedInfo}>
                  <Text style={styles.submittedText}>
                    {format(new Date(currentInvoice.createdAt), 'MMM dd, yyyy')}
                    {currentInvoice.createdByUser && <> by {currentInvoice.createdByUser.name || currentInvoice.createdByUser.email?.split('@')[0] || 'Unknown'}</>}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.paymentCard}>
          <View style={styles.paymentRow}>
            <Text style={styles.cardLabel}>Account</Text>
            <TouchableOpacity
              style={editing ? styles.accountTouchable : undefined}
              onPress={() => {
                if (!editing) {
                  setEditedInvoice({ ...currentInvoice });
                  setEditing(true);
                  setTaxInputText((editedInvoice || invoice)?.tax?.toString() ?? '0');
                  const priceTexts: { [index: number]: string } = {};
                  ((editedInvoice || invoice)?.items || []).forEach((item, index) => {
                    priceTexts[index] = item.price.toString();
                  });
                  setPriceInputTexts(priceTexts);
                }
                setShowAccountPicker(true);
              }}
              activeOpacity={0.7}
            >
              {editing ? (
                <View style={styles.accountTag}>
                  <Text style={styles.accountText} numberOfLines={1} ellipsizeMode="tail">
                    {currentInvoice.account?.name || 'Not set'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#6C5CE7" style={styles.tagIcon} />
                </View>
              ) : (
                <Text style={styles.cardValue}>{currentInvoice.account?.name || 'Not set'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.itemsSection}>
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionTitle}>Items</Text>
          </View>
          {currentInvoice.items.map((item, index) => (
            <View key={index} style={[styles.itemCard, index < currentInvoice.items.length - 1 && styles.itemCardWithBorder]}>
              {editing && (
                <TouchableOpacity style={styles.deleteItemButton} onPress={() => handleDeleteItem(index)}>
                  <Ionicons name="close-circle" size={20} color="#E74C3C" />
                </TouchableOpacity>
              )}
              <View style={styles.itemHeader}>
                {editing ? (
                  <TextInput
                    style={styles.itemNameInput}
                    value={item.name}
                    onChangeText={(text) => handleItemChange(index, 'name', text)}
                    placeholder="Item name"
                  />
                ) : (
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                )}
                {editing ? (
                  <TextInput
                    style={styles.priceInput}
                    value={priceInputTexts[index] !== undefined ? priceInputTexts[index] : item.price.toString()}
                    onChangeText={(text) => {
                      const validPattern = /^-?\d*\.?\d*$/;
                      if (text === '' || text === '-' || validPattern.test(text)) {
                        setPriceInputTexts(prev => ({ ...prev, [index]: text }));
                        if (text !== '' && text !== '-' && text !== '.') {
                          const price = parseFloat(text);
                          if (!isNaN(price)) handleItemChange(index, 'price', price);
                        } else if (text === '' || text === '-') handleItemChange(index, 'price', 0);
                      }
                    }}
                    onBlur={() => {
                      const text = priceInputTexts[index] !== undefined ? priceInputTexts[index] : item.price.toString();
                      const price = parseFloat(text);
                      if (isNaN(price)) {
                        setPriceInputTexts(prev => ({ ...prev, [index]: '0' }));
                        handleItemChange(index, 'price', 0);
                      } else {
                        setPriceInputTexts(prev => ({ ...prev, [index]: price.toString() }));
                        handleItemChange(index, 'price', price);
                      }
                    }}
                    keyboardType="numbers-and-punctuation"
                    placeholder="Price"
                  />
                ) : (
                  <Text style={styles.itemPrice}>{(item.price < 0 ? '-' : '') + Math.abs(item.price).toFixed(2)}</Text>
                )}
              </View>
              <View style={styles.itemTags}>
                <View style={styles.tagGroupLeft}>
                  <TouchableOpacity style={styles.tagTouchable} onPress={() => setShowCategoryPicker(index)}>
                    <View style={[styles.tag, { backgroundColor: item.category?.color || '#95A5A6' }]}>
                      <Text style={styles.tagText} numberOfLines={1} ellipsizeMode="tail">{item.category?.name || 'Category'}</Text>
                      <Ionicons name="chevron-down" size={12} color="#fff" style={styles.tagIcon} />
                    </View>
                  </TouchableOpacity>
                </View>
                <View style={styles.tagGroupCenter}>
                  <TouchableOpacity style={styles.tagTouchable} onPress={() => setShowPurposePicker(index)}>
                    <View style={[styles.tag, { backgroundColor: item.purpose?.color || purposes.find(p => p.id === item.purposeId)?.color || '#95A5A6' }]}>
                      <Text style={styles.tagText} numberOfLines={1} ellipsizeMode="tail">{item.purpose?.name || purposes.find(p => p.id === item.purposeId)?.name || 'Purpose'}</Text>
                      <Ionicons name="chevron-down" size={12} color="#fff" style={styles.tagIcon} />
                    </View>
                  </TouchableOpacity>
                </View>
                <View style={styles.tagGroupRight}>
                  <TouchableOpacity style={styles.assetTagTouchable} onPress={() => handleItemChangeDirect(index, 'isAsset', !item.isAsset)}>
                    <View style={[styles.assetTag, { backgroundColor: item.isAsset ? '#E8F4FD' : '#F0F0F0' }]}>
                      <Ionicons name={item.isAsset ? 'checkbox' : 'checkbox-outline'} size={14} color={item.isAsset ? '#6C5CE7' : '#95A5A6'} />
                      <Text style={[styles.assetTagText, { color: item.isAsset ? '#6C5CE7' : '#636E72' }]}>Asset</Text>
                    </View>
                  </TouchableOpacity>
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

      {editing && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => { setEditing(false); setEditedInvoice(invoice); }}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmButton} onPress={handleSave}>
            <Ionicons name="checkmark" size={24} color="#fff" />
            <Text style={styles.confirmButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      )}

      {!editing && (
        <TouchableOpacity
          style={[styles.fab, styles.editFab]}
          onPress={() => {
            setEditedInvoice({ ...currentInvoice });
            setEditing(true);
            setTaxInputText((editedInvoice || invoice)?.tax?.toString() ?? '0');
            const priceTexts: { [index: number]: string } = {};
            ((editedInvoice || invoice)?.items || []).forEach((item, index) => {
              priceTexts[index] = item.price.toString();
            });
            setPriceInputTexts(priceTexts);
          }}
        >
          <Ionicons name="create" size={32} color="#fff" />
        </TouchableOpacity>
      )}

      {!editing && currentInvoice.status === 'pending' && (
        <TouchableOpacity style={[styles.fab, styles.confirmFab]} onPress={handleConfirm}>
          <Ionicons name="checkmark-circle" size={32} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal visible={showImageModal} transparent animationType="fade" onRequestClose={() => setShowImageModal(false)}>
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowImageModal(false)}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {currentInvoice.imageUrl && (
            <Image source={{ uri: currentInvoice.imageUrl }} style={styles.modalImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      <Modal visible={showCategoryPicker !== null} transparent animationType="slide" onRequestClose={() => setShowCategoryPicker(null)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowCategoryPicker(null)}>
          <View style={styles.pickerBottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Category</Text>
              <TouchableOpacity style={styles.pickerManageButton} onPress={() => { setShowCategoryPicker(null); router.push('/categories-manage'); }}>
                <Ionicons name="settings-outline" size={20} color="#6C5CE7" />
                <Text style={styles.pickerManageText}>Manage</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
              {categories.map((cat) => {
                const itemIndex = showCategoryPicker;
                if (itemIndex === null) return null;
                const item = currentInvoice.items[itemIndex];
                const isSelected = item.categoryId === cat.id || item.category?.id === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                    onPress={async () => {
                      setShowCategoryPicker(null);
                      await handleItemChangeDirect(itemIndex, 'categoryId', cat.id);
                    }}
                  >
                    <View style={[styles.pickerColorIndicator, { backgroundColor: cat.color || '#95A5A6' }]} />
                    <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{cat.name}</Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showPurposePicker !== null} transparent animationType="slide" onRequestClose={() => setShowPurposePicker(null)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowPurposePicker(null)}>
          <View style={styles.pickerBottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Purpose</Text>
              <TouchableOpacity style={styles.pickerManageButton} onPress={() => { setShowPurposePicker(null); router.push('/purposes-manage'); }}>
                <Ionicons name="settings-outline" size={20} color="#6C5CE7" />
                <Text style={styles.pickerManageText}>Manage</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
              {purposes.map((purpose) => {
                const itemIndex = showPurposePicker;
                if (itemIndex === null) return null;
                const item = currentInvoice.items[itemIndex];
                const isSelected = item.purposeId === purpose.id;
                return (
                  <TouchableOpacity
                    key={purpose.id}
                    style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                    onPress={async () => {
                      setShowPurposePicker(null);
                      await handleItemChangeDirect(itemIndex, 'purposeId', purpose.id);
                    }}
                  >
                    <View style={[styles.pickerColorIndicator, { backgroundColor: purpose.color }]} />
                    <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{purpose.name}</Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showAccountPicker} transparent animationType="slide" onRequestClose={() => setShowAccountPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowAccountPicker(false)}>
          <View style={styles.pickerBottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Account</Text>
              <TouchableOpacity style={styles.pickerManageButton} onPress={() => { setShowAccountPicker(false); router.push('/accounts-manage'); }}>
                <Ionicons name="settings-outline" size={18} color="#6C5CE7" />
                <Text style={styles.pickerManageText}>Manage</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.pickerOption, !(editing ? editedInvoice : currentInvoice)?.account && styles.pickerOptionSelected]}
                onPress={() => {
                  if (editing && editedInvoice) {
                    setEditedInvoice({ ...editedInvoice, account: undefined, accountId: undefined });
                  } else {
                    setEditedInvoice({ ...currentInvoice, account: undefined, accountId: undefined });
                    setEditing(true);
                    setTaxInputText((editedInvoice || invoice)?.tax?.toString() ?? '0');
                    setPriceInputTexts({});
                  }
                  setShowAccountPicker(false);
                }}
              >
                <View style={[styles.pickerColorIndicator, { backgroundColor: '#95A5A6' }]} />
                <Text style={[styles.pickerOptionText, !(editing ? editedInvoice : currentInvoice)?.account && styles.pickerOptionTextSelected]}>Not set</Text>
                {!(editing ? editedInvoice : currentInvoice)?.account && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
              </TouchableOpacity>
              {accounts.map((account) => {
                const receiptToCheck = editing ? editedInvoice : currentInvoice;
                const isSelected = receiptToCheck?.account?.id === account.id;
                return (
                  <TouchableOpacity
                    key={account.id}
                    style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                    onPress={() => {
                      if (editing && editedInvoice) {
                        setEditedInvoice({ ...editedInvoice, account, accountId: account.id });
                      } else {
                        setEditedInvoice({ ...currentInvoice, account, accountId: account.id });
                        setEditing(true);
                        setTaxInputText((editedInvoice || invoice)?.tax?.toString() ?? '0');
                        setPriceInputTexts({});
                      }
                      setShowAccountPicker(false);
                    }}
                  >
                    <View style={[styles.pickerColorIndicator, { backgroundColor: '#6C5CE7' }]} />
                    <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{account.name}</Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showCurrencyPicker} transparent animationType="slide" onRequestClose={() => setShowCurrencyPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowCurrencyPicker(false)}>
          <View style={styles.pickerBottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Currency</Text>
              <TouchableOpacity onPress={() => setShowCurrencyPicker(false)} style={styles.pickerCloseButton}>
                <Text style={styles.pickerCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
              {commonCurrencies.map(code => {
                const currentCurrency = editedInvoice?.currency || currentInvoice.currency;
                const isSelected = currentCurrency === code;
                return (
                  <TouchableOpacity key={code} style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]} onPress={() => { handleCurrencyChange(code); setShowCurrencyPicker(false); }}>
                    <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>{code}</Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={[styles.pickerOption, !(editedInvoice?.currency || currentInvoice.currency) && styles.pickerOptionSelected]} onPress={() => { handleCurrencyChange(''); setShowCurrencyPicker(false); }}>
                <Text style={[styles.pickerOptionText, !(editedInvoice?.currency || currentInvoice.currency) && styles.pickerOptionTextSelected]}>Not set</Text>
                {!(editedInvoice?.currency || currentInvoice.currency) && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {showDatePicker && (
        <>
          {Platform.OS === 'ios' ? (
            <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
              <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
                <View style={styles.pickerBottomSheet} onStartShouldSetResponder={() => true}>
                  <View style={styles.pickerHandle} />
                  <View style={styles.pickerHeader}>
                    <Text style={styles.pickerTitle}>选择日期</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.pickerCloseButton}>
                      <Text style={styles.pickerCloseText}>完成</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={editedInvoice?.date ? parseLocalDate(editedInvoice.date) : new Date()}
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
              value={editedInvoice?.date ? parseLocalDate(editedInvoice.date) : new Date()}
              mode="date"
              display="default"
              onChange={handleDateChange}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECEFF1' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 100 },
  summaryCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'stretch' },
  imageContainer: { position: 'relative', marginRight: 12 },
  imagePlaceholder: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#E9ECEF', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderContent: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  receiptImage: { width: '100%', height: '100%' },
  summaryContent: { flex: 1, justifyContent: 'space-between' },
  summaryContentTop: { flex: 1, justifyContent: 'space-between' },
  summaryContentMain: { flex: 1 },
  submittedInfo: { alignSelf: 'flex-end', marginTop: 4 },
  submittedText: { fontSize: 11, color: '#95A5A6', textAlign: 'right' },
  storeName: { fontSize: 17, fontWeight: '600', color: '#2D3436', lineHeight: 22, height: 22, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: 'transparent', paddingVertical: 0 },
  storeNameInput: { fontSize: 17, fontWeight: '600', color: '#2D3436', lineHeight: 22, borderBottomWidth: 1, borderBottomColor: '#6C5CE7', height: 22, paddingVertical: 0, marginBottom: 2, transform: [{ translateY: -1 }] },
  amountRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'baseline', marginTop: 2 },
  amountContainer: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  currencyLabel: { fontSize: 14, fontWeight: '600', color: '#636E72', lineHeight: 18 },
  totalAmount: { fontSize: 24, fontWeight: 'bold', color: '#6C5CE7', marginRight: 8, lineHeight: 28 },
  taxText: { flexDirection: 'row', alignItems: 'center', marginLeft: 8, height: 20 },
  taxInputContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  taxLabel: { fontSize: 11, color: '#636E72', fontWeight: '500', lineHeight: 16 },
  taxValueText: { fontSize: 11, color: '#636E72', fontWeight: '500', lineHeight: 16, marginLeft: 8 },
  taxInput: { fontSize: 11, color: '#636E72', fontWeight: '500', borderWidth: 1, borderColor: '#6C5CE7', borderRadius: 4, paddingVertical: 1, height: 20, paddingHorizontal: 4, minWidth: 50, textAlign: 'left', lineHeight: 16, transform: [{ translateY: -3 }] },
  date: { fontSize: 14, fontWeight: '600', color: '#636E72', lineHeight: 18, marginTop: 2, marginLeft: 11, marginBottom: 0 },
  currencyContainer: { marginLeft: 0, marginRight: 4, minHeight: 20 },
  currencyPickerTouchable: { flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 8, paddingVertical: 1, borderRadius: 16, borderWidth: 1, borderColor: '#6C5CE7', backgroundColor: '#F8F9FA', height: 20 },
  currencyPickerReadonly: { flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 8, paddingVertical: 1, borderRadius: 16, borderWidth: 1, borderColor: 'transparent', backgroundColor: 'transparent', height: 20 },
  dateContainer: { marginTop: 8, height: 24 },
  dateTouchable: { alignSelf: 'flex-start' },
  dateText: { fontSize: 14, color: '#636E72', lineHeight: 18, fontWeight: '600' },
  dateTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 1, borderRadius: 16, borderWidth: 1, borderColor: '#6C5CE7', backgroundColor: '#F8F9FA', height: 20 },
  datePickerIOS: { width: '100%', height: 200 },
  paymentCard: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 2, paddingHorizontal: 12, marginBottom: 8 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontSize: 14, color: '#636E72', marginRight: 12, fontWeight: '500' },
  cardValue: { fontSize: 14, color: '#2D3436', fontWeight: '500', paddingVertical: 10, lineHeight: 20, marginRight: 37 },
  accountTouchable: { flex: 1, alignItems: 'flex-end', justifyContent: 'center', minHeight: 40 },
  accountTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, borderWidth: 1, borderColor: '#6C5CE7', maxWidth: 250, minWidth: 120, flexShrink: 0 },
  accountText: { fontSize: 14, color: '#2D3436', fontWeight: '500', flexShrink: 1, marginRight: 6, maxWidth: 200, lineHeight: 20 },
  itemsSection: { marginBottom: 12, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden' },
  sectionTitleContainer: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#E9ECEF' },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#2D3436' },
  itemCard: { backgroundColor: '#fff', borderRadius: 0, paddingLeft: 8, paddingTop: 4, paddingBottom: 4, paddingRight: 32, marginBottom: 0 },
  itemCardWithBorder: { borderBottomWidth: 1, borderBottomColor: '#E9ECEF' },
  deleteItemButton: { position: 'absolute', top: '50%', marginTop: -14, right: 0, zIndex: 1, padding: 4 },
  itemName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#2D3436', marginRight: 6, lineHeight: 20, height: 20, borderBottomWidth: 1, borderBottomColor: 'transparent', paddingVertical: 0, transform: [{ translateY: -2 }] },
  itemNameInput: { flex: 1, fontSize: 15, fontWeight: '600', color: '#2D3436', borderBottomWidth: 1, borderBottomColor: '#6C5CE7', lineHeight: 20, height: 20, paddingVertical: 0, marginRight: 6, transform: [{ translateY: -4 }] },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 },
  itemTags: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginTop: 0, position: 'relative' },
  tagGroupLeft: { width: 120, alignItems: 'flex-start' },
  tagGroupCenter: { marginLeft: 2, alignItems: 'flex-start' },
  tagGroupRight: { flex: 1, alignItems: 'flex-end' },
  tagTouchable: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  tag: { paddingLeft: 10, paddingRight: 5, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: 140 },
  tagText: { color: '#fff', fontSize: 11, fontWeight: '600', flexShrink: 1 },
  tagIcon: { marginLeft: 4, opacity: 0.8, flexShrink: 0 },
  assetTagTouchable: { minHeight: 32, minWidth: 80, justifyContent: 'center', alignItems: 'flex-end' },
  assetTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  assetTagText: { fontSize: 11, fontWeight: '500', marginLeft: 3 },
  itemPrice: { fontSize: 16, fontWeight: '600', color: '#6C5CE7', paddingVertical: 4, paddingHorizontal: 7, minWidth: 70, textAlign: 'right', lineHeight: 20 },
  priceInput: { fontSize: 16, fontWeight: '600', color: '#6C5CE7', borderWidth: 1, borderColor: '#6C5CE7', borderRadius: 4, paddingVertical: 3, paddingHorizontal: 6, minWidth: 70, textAlign: 'right', lineHeight: 20 },
  addItemButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#CED4DA', alignSelf: 'stretch' },
  addItemButtonContainer: { paddingTop: 12, paddingBottom: 4, backgroundColor: '#ECEFF1', alignItems: 'center' },
  addItemText: { marginLeft: 8, fontSize: 16, color: '#6C5CE7', fontWeight: '600' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'transparent', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8, borderTopWidth: 0, flexDirection: 'row', gap: 12 },
  fab: { position: 'absolute', right: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: '#6C5CE7', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 6, elevation: 6 },
  editFab: { bottom: 20, backgroundColor: '#95A5A6' },
  confirmFab: { bottom: 100 },
  cancelButton: { flex: 1, backgroundColor: '#DDE2E6', borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 6, elevation: 6 },
  cancelButtonText: { fontSize: 16, color: '#636E72', fontWeight: '600' },
  confirmButton: { flex: 1, backgroundColor: '#6C5CE7', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 6, elevation: 6 },
  confirmButtonText: { marginLeft: 8, fontSize: 16, color: '#fff', fontWeight: '600' },
  errorText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: '#E74C3C' },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  modalCloseButton: { position: 'absolute', top: 50, right: 20, zIndex: 1, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 },
  modalImage: { width: '100%', height: '100%' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerBottomSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 32, paddingHorizontal: 20, maxHeight: '70%' },
  pickerHandle: { width: 40, height: 4, backgroundColor: '#BDC3C7', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 18, fontWeight: '600', color: '#2D3436', flex: 1 },
  pickerManageButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F0F0F0' },
  pickerManageText: { fontSize: 14, color: '#6C5CE7', fontWeight: '500', marginLeft: 4 },
  pickerScrollView: { maxHeight: 400 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, marginBottom: 8, backgroundColor: '#F8F9FA', minHeight: 48 },
  pickerOptionSelected: { backgroundColor: '#E8F4FD' },
  pickerColorIndicator: { width: 20, height: 20, borderRadius: 10, marginRight: 12 },
  pickerOptionText: { flex: 1, fontSize: 16, color: '#2D3436', fontWeight: '500' },
  pickerOptionTextSelected: { color: '#6C5CE7', fontWeight: '600' },
  pickerCloseButton: { paddingHorizontal: 12, paddingVertical: 6 },
  pickerCloseText: { fontSize: 16, color: '#6C5CE7', fontWeight: '600' },
});
