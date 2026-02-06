import { GeminiReceiptResult, GeminiVoucherResult, GeminiInboundOutboundResult, Receipt, ReceiptStatus, Invoice, InvoiceItem, Inbound, InboundItem, Outbound, OutboundItem, VoucherStatus } from '@/types';
import { getCurrentUser } from './auth';
import { findCategoryByName, getCategories } from './categories';
import { findPurposeByName, getPurposes } from './purposes';
import { findOrCreateAccount } from './accounts';
import { findOrCreateSupplier } from './suppliers';

// 将 Gemini 识别结果转换为 Receipt 格式
export async function convertGeminiResultToReceipt(result: GeminiReceiptResult): Promise<Receipt> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');

  // 获取所有分类和用途
  const categories = await getCategories();
  const purposes = await getPurposes();

  // 处理供应商（排除无效的供应商名称，如 "Processing..." 等）
  let supplierId: string | undefined;
  const supplierName = result.supplierName;
  if (supplierName && supplierName.trim()) {
    const trimmedSupplierName = supplierName.trim();
    // 排除处理状态等无效名称
    const invalidNames = ['processing', 'processing...', 'pending', 'pending...', 'loading', 'loading...', '识别中', '处理中', '待处理'];
    const isValidName = !invalidNames.includes(trimmedSupplierName.toLowerCase());
    
    if (isValidName) {
      try {
        const supplier = await findOrCreateSupplier(
          trimmedSupplierName,
          true,
          result.supplierInfo?.taxNumber,
          result.supplierInfo?.phone,
          result.supplierInfo?.address
        );
        supplierId = supplier.id;
      } catch (error) {
        console.warn('Failed to create or find supplier:', error);
        // 如果供应商创建失败，继续处理其他信息，不阻塞整个流程
      }
    } else {
      console.warn(`Skipping invalid supplier name: "${trimmedSupplierName}"`);
    }
  }

  // 处理支付账户
  let accountId: string | undefined;
  if (result.paymentAccountName) {
    const account = await findOrCreateAccount(result.paymentAccountName, true);
    accountId = account.id;
  }

  // 处理商品项，匹配分类
  // 确保 items 存在且是数组
  if (!result.items || !Array.isArray(result.items)) {
    console.warn('No items found in Gemini result, using empty array');
    result.items = [];
  }
  
  console.log('Processing items:', result.items.length, 'items found');
  
  const items = await Promise.all(
    result.items.map(async (item) => {
      // 尝试匹配分类名称
      let category = categories.find((cat) => 
        cat.name.toLowerCase() === item.categoryName.toLowerCase()
      );

      // 如果找不到，尝试使用 findCategoryByName（模糊匹配）
      if (!category) {
        const foundCategory = await findCategoryByName(item.categoryName);
        category = foundCategory || undefined;
      }

      // 如果还是找不到，使用默认分类 "购物"
      if (!category) {
        console.warn(`分类 "${item.categoryName}" 未找到，尝试使用默认分类`);
        
        // 尝试按优先级查找默认分类
        const defaultCategoryNames = ['购物', '食品', 'Other', 'Grocery'];
        for (const defaultName of defaultCategoryNames) {
          category = categories.find((cat) => 
            cat.name === defaultName || cat.name.toLowerCase() === defaultName.toLowerCase()
          );
          if (category) break;
        }
        
        // 如果还是找不到，尝试找任何一个默认分类
        if (!category) {
          category = categories.find((cat) => cat.isDefault);
        }
        
        // 如果仍然找不到，尝试找第一个分类（至少有一个分类）
        if (!category && categories.length > 0) {
          category = categories[0];
          console.warn(`使用第一个可用分类: ${category.name}`);
        }
        
        if (!category) {
          throw new Error(
            'Default category not found.\n\n' +
            'Please do one of the following:\n' +
            '1. Execute add-default-categories-for-existing-users.sql in Supabase SQL Editor\n' +
            '2. Or manually create at least one category in the app\n\n' +
            'Current user space ID: ' + (user.spaceId || 'Unknown')
          );
        }
      }

      // 匹配用途
      let purposeId: string | null = null;
      if (item.purposeName) {
        const purpose = purposes.find(p => p.name.toLowerCase() === item.purposeName!.toLowerCase())
          || await findPurposeByName(item.purposeName);
        if (purpose) {
          purposeId = purpose.id;
        }
      }
      
      // 如果找不到匹配的用途，使用默认用途
      if (!purposeId && purposes.length > 0) {
        // 优先使用默认用途，否则使用第一个用途
        const defaultPurpose = purposes.find(p => p.isDefault) || purposes[0];
        if (defaultPurpose) {
          purposeId = defaultPurpose.id;
          console.warn(`用途 "${item.purposeName}" 未找到，使用默认用途: ${defaultPurpose.name}`);
        }
      }

      return {
        name: item.name,
        categoryId: category.id,
        category: category,
        purposeId,
        price: item.price,
        isAsset: item.isAsset || false, // 默认值为 false
        confidence: item.confidence,
      };
    })
  );

  // 计算调整后的置信度（基于多个因素）
  let adjustedConfidence = result.confidence || 0.5;
  
  // 1. 检查明细金额总和与总金额是否一致
  const itemsSum = items.reduce((sum, item) => sum + item.price, 0);
  const expectedTotal = itemsSum + (result.tax || 0);
  const totalAmount = result.totalAmount || 0;
  const amountDifference = Math.abs(expectedTotal - totalAmount);
  const amountMatches = amountDifference <= 0.01; // 允许 0.01 的误差
  
  // 2. 检查数据一致性
  const dataConsistency = result.dataConsistency;
  const itemsSumMatches = dataConsistency?.itemsSumMatchesTotal ?? amountMatches;
  const hasMissingItems = dataConsistency?.missingItems ?? (!amountMatches && itemsSum < totalAmount);
  
  // 3. 检查图片质量
  const imageQuality = result.imageQuality;
  const clarity = imageQuality?.clarity ?? 0.8;
  const completeness = imageQuality?.completeness ?? 0.8;
  
  // 4. 调整置信度
  // 如果明细金额不匹配，降低置信度
  if (!itemsSumMatches) {
    const differenceRatio = amountDifference / Math.max(totalAmount, 1);
    if (differenceRatio > 0.1) {
      // 差异超过 10%，大幅降低置信度
      adjustedConfidence = Math.max(0.2, adjustedConfidence - 0.3);
    } else if (differenceRatio > 0.05) {
      // 差异在 5-10%，中等降低
      adjustedConfidence = Math.max(0.3, adjustedConfidence - 0.2);
    } else {
      // 差异在 5% 以内，轻微降低
      adjustedConfidence = Math.max(0.4, adjustedConfidence - 0.1);
    }
  }
  
  // 如果有遗漏的商品项，降低置信度
  if (hasMissingItems) {
    adjustedConfidence = Math.max(0.3, adjustedConfidence - 0.15);
  }
  
  // 图片清晰度影响置信度
  if (clarity < 0.7) {
    adjustedConfidence = Math.max(0.2, adjustedConfidence - 0.1);
  }
  
  // 图片完整度影响置信度
  if (completeness < 0.8) {
    adjustedConfidence = Math.max(0.3, adjustedConfidence - 0.1);
  }
  
  // 如果明细金额匹配且图片质量好，可以提高置信度
  if (itemsSumMatches && !hasMissingItems && clarity >= 0.8 && completeness >= 0.9) {
    adjustedConfidence = Math.min(0.95, adjustedConfidence + 0.05);
  }
  
  // 根据调整后的置信度自动设置状态
  // 置信度 >= 0.85: confirmed (已确认)
  // 置信度 < 0.4: needs_retake (需重拍)
  // 其他: pending (待确认)
  let status: ReceiptStatus = 'pending';
  
  if (adjustedConfidence >= 0.85) {
    status = 'confirmed';
  } else if (adjustedConfidence < 0.4) {
    status = 'needs_retake';
  } else {
    status = 'pending';
  }
  
  console.log('Confidence calculation:', {
    originalConfidence: result.confidence,
    adjustedConfidence,
    itemsSum,
    totalAmount,
    tax: result.tax || 0,
    expectedTotal,
    amountDifference,
    itemsSumMatches,
    hasMissingItems,
    clarity,
    completeness,
    finalStatus: status,
  });

  const spaceId = user.spaceId || user.currentSpaceId;
  if (!spaceId) {
    throw new Error('User must have a space selected');
  }

  return {
    spaceId: spaceId,
    supplierName: result.supplierName,
    supplierId: supplierId,
    totalAmount: result.totalAmount,
    currency: result.currency,
    tax: result.tax,
    date: result.date,
    accountId: accountId,
    status: status,
    items: items,
    confidence: adjustedConfidence, // 使用调整后的置信度
  };
}

/** 将 Gemini 统一凭证结果（发票）转换为 Invoice */
export async function convertGeminiResultToInvoice(result: GeminiVoucherResult): Promise<Invoice> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');

  const categories = await getCategories();
  const purposes = await getPurposes();

  let accountId: string | undefined;
  if (result.paymentAccountName) {
    const account = await findOrCreateAccount(result.paymentAccountName, true);
    accountId = account.id;
  }

  if (!result.items || !Array.isArray(result.items)) {
    result.items = [];
  }

  const items: InvoiceItem[] = await Promise.all(
    result.items.map(async (item) => {
      let category = categories.find((c) => c.name.toLowerCase() === (item.categoryName || '').toLowerCase());
      if (!category) {
        category = await findCategoryByName(item.categoryName) || undefined;
      }
      if (!category) {
        category = categories.find((c) => c.name === 'Shopping') || categories[0];
      }
      if (!category) {
        throw new Error('No category available. Please create at least one category.');
      }

      let purposeId: string | null = null;
      const purposeName = item.purposeName || (item as any).purpose;
      if (purposeName) {
        const purpose = purposes.find((p) => p.name.toLowerCase() === purposeName.toLowerCase()) || await findPurposeByName(purposeName);
        if (purpose) purposeId = purpose.id;
      }
      if (!purposeId && purposes.length > 0) {
        purposeId = (purposes.find((p) => p.isDefault) || purposes[0]).id;
      }

      return {
        name: item.name,
        categoryId: category.id,
        category,
        purposeId,
        purpose: purposes.find((p) => p.id === purposeId) || undefined,
        price: item.price,
        isAsset: item.isAsset ?? false,
        confidence: item.confidence,
      };
    })
  );

  const spaceId = user.spaceId || user.currentSpaceId;
  if (!spaceId) throw new Error('User must have a space selected');

  const customerName = result.customerName || result.supplierName || 'Customer';
  const itemsSum = items.reduce((sum, i) => sum + i.price, 0);
  const tax = result.tax ?? 0;
  const totalAmount = result.totalAmount ?? itemsSum + tax;

  return {
    spaceId,
    customerName,
    totalAmount,
    currency: result.currency,
    tax,
    date: result.date,
    accountId: accountId ?? null,
    status: 'pending' as VoucherStatus,
    items,
    confidence: result.confidence,
  };
}

/** 将 Gemini 入库/出库识别结果转换为 Inbound */
export async function convertGeminiResultToInbound(result: GeminiInboundOutboundResult): Promise<Inbound> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  let supplierId: string | undefined;
  const supplierName = result.supplierName?.trim();
  if (supplierName) {
    const invalidNames = ['processing', 'pending', 'loading', '识别中', '处理中', '待处理'];
    if (!invalidNames.includes(supplierName.toLowerCase())) {
      try {
        const supplier = await findOrCreateSupplier(supplierName, true);
        supplierId = supplier.id;
      } catch (_) {}
    }
  }

  const items: InboundItem[] = (result.items || []).map((it) => ({
    inboundId: '',
    productName: it.productName || 'Item',
    quantity: Number(it.quantity) || 1,
    unit: it.unit || '件',
    unitPrice: it.unitPrice != null ? Number(it.unitPrice) : undefined,
  }));

  const totalAmount = result.totalAmount ?? items.reduce((sum, i) => sum + (i.quantity || 0) * (i.unitPrice ?? 0), 0);

  return {
    spaceId,
    supplierId,
    supplierName: result.supplierName || undefined,
    totalAmount: totalAmount > 0 ? totalAmount : undefined,
    currency: result.currency,
    date: result.date,
    status: 'pending' as VoucherStatus,
    items: items.length ? items : [{ inboundId: '', productName: 'Goods', quantity: 1, unit: '件' }],
    confidence: result.confidence,
  };
}

/** 将 Gemini 入库/出库识别结果转换为 Outbound */
export async function convertGeminiResultToOutbound(result: GeminiInboundOutboundResult): Promise<Outbound> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  const items: OutboundItem[] = (result.items || []).map((it) => ({
    outboundId: '',
    productName: it.productName || 'Item',
    quantity: Number(it.quantity) || 1,
    unit: it.unit || '件',
    unitPrice: it.unitPrice != null ? Number(it.unitPrice) : undefined,
  }));

  const totalAmount = result.totalAmount ?? items.reduce((sum, i) => sum + (i.quantity || 0) * (i.unitPrice ?? 0), 0);

  return {
    spaceId,
    customerName: result.customerName || undefined,
    totalAmount: totalAmount > 0 ? totalAmount : undefined,
    currency: result.currency,
    date: result.date,
    status: 'pending' as VoucherStatus,
    items: items.length ? items : [{ outboundId: '', productName: 'Goods', quantity: 1, unit: '件' }],
    confidence: result.confidence,
  };
}

