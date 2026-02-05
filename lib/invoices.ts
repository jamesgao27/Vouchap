import { supabase } from './supabase';
import { Invoice, InvoiceItem } from '@/types';
import { getCurrentUser } from './auth';

function rowToInvoice(row: any, items: InvoiceItem[] = []): Invoice {
  return {
    id: row.id,
    spaceId: row.space_id,
    customerName: row.customer_name,
    totalAmount: Number(row.total_amount),
    currency: row.currency ?? undefined,
    tax: row.tax != null ? Number(row.tax) : undefined,
    date: row.date,
    accountId: row.account_id ?? undefined,
    account: row.accounts ? {
      id: row.accounts.id,
      spaceId: row.accounts.space_id,
      name: row.accounts.name,
      isAiRecognized: row.accounts.is_ai_recognized,
      createdAt: row.accounts.created_at,
      updatedAt: row.accounts.updated_at,
    } : undefined,
    status: row.status ?? 'pending',
    imageUrl: row.image_url ?? undefined,
    inputType: row.input_type ?? 'image',
    confidence: row.confidence != null ? Number(row.confidence) : undefined,
    processedBy: row.processed_by ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdByUser: row.created_by_user ? {
      id: row.created_by_user.id,
      email: row.created_by_user.email,
      name: row.created_by_user.name,
      spaceId: row.created_by_user.current_space_id ?? null,
    } : undefined,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 获取当前空间下所有发票（列表用，含 account / createdByUser，不含明细） */
export async function getAllInvoices(): Promise<Invoice[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      accounts (*),
      created_by_user:users!created_by (
        id,
        email,
        name,
        current_space_id
      )
    `)
    .eq('space_id', spaceId)
    .order('date', { ascending: false });

  if (error) throw error;
  return (data || []).map((r: any) => rowToInvoice(r, []));
}

/** 根据 ID 获取发票（含明细、account、createdByUser、items 的 category/purpose） */
export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  const { data: inv, error: invError } = await supabase
    .from('invoices')
    .select(`
      *,
      accounts (*),
      created_by_user:users!created_by (
        id,
        email,
        name,
        current_space_id
      )
    `)
    .eq('id', invoiceId)
    .single();
  if (invError || !inv) return null;

  const { data: itemRows, error: itemsError } = await supabase
    .from('invoice_items')
    .select(`
      *,
      categories (*),
      purposes (*)
    `)
    .eq('invoice_id', invoiceId)
    .order('id', { ascending: true });
  if (itemsError) return rowToInvoice(inv, []);

  const items: InvoiceItem[] = (itemRows || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    categoryId: r.category_id ?? undefined,
    category: r.categories ? {
      id: r.categories.id,
      spaceId: r.categories.space_id,
      name: r.categories.name,
      color: r.categories.color,
      isDefault: r.categories.is_default,
      createdAt: r.categories.created_at,
      updatedAt: r.categories.updated_at,
    } : undefined,
    purposeId: r.purpose_id ?? undefined,
    purpose: r.purposes ? {
      id: r.purposes.id,
      spaceId: r.purposes.space_id,
      name: r.purposes.name,
      color: r.purposes.color,
      isDefault: r.purposes.is_default,
      createdAt: r.purposes.created_at,
      updatedAt: r.purposes.updated_at,
    } : undefined,
    price: Number(r.price),
    isAsset: r.is_asset ?? false,
    confidence: r.confidence != null ? Number(r.confidence) : undefined,
  }));
  return rowToInvoice(inv, items);
}

/** 保存发票（新建或更新，含明细）— 占位实现，后续对接 AI 与完整 CRUD */
export async function saveInvoice(invoice: Invoice): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  if (invoice.id) {
    await supabase
      .from('invoices')
      .update({
        customer_name: invoice.customerName,
        total_amount: invoice.totalAmount,
        currency: invoice.currency ?? null,
        tax: invoice.tax ?? null,
        date: invoice.date,
        account_id: invoice.accountId ?? null,
        status: invoice.status,
        image_url: invoice.imageUrl ?? null,
        input_type: invoice.inputType ?? 'image',
        confidence: invoice.confidence ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice.id);
    if (invoice.items?.length) {
      await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id);
      await supabase.from('invoice_items').insert(
        invoice.items.map((it) => ({
          invoice_id: invoice.id,
          name: it.name,
          category_id: it.categoryId ?? null,
          purpose_id: it.purposeId ?? null,
          price: it.price,
          is_asset: it.isAsset ?? false,
          confidence: it.confidence ?? null,
        }))
      );
    }
    return invoice.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('invoices')
    .insert({
      space_id: spaceId,
      customer_name: invoice.customerName,
      total_amount: invoice.totalAmount,
      currency: invoice.currency ?? null,
      tax: invoice.tax ?? null,
      date: invoice.date,
      account_id: invoice.accountId ?? null,
      status: invoice.status,
      image_url: invoice.imageUrl ?? null,
      input_type: invoice.inputType ?? 'image',
      confidence: invoice.confidence ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;
  const id = inserted.id;
  if (invoice.items?.length) {
    await supabase.from('invoice_items').insert(
      invoice.items.map((it) => ({
        invoice_id: id,
        name: it.name,
        category_id: it.categoryId ?? null,
        purpose_id: it.purposeId ?? null,
        price: it.price,
        is_asset: it.isAsset ?? false,
        confidence: it.confidence ?? null,
      }))
    );
  }
  return id;
}

/** 删除发票 */
export async function deleteInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
  if (error) throw error;
}

/** 更新发票单条明细的某个字段（用于详情页直接点选分类/用途/资产） */
export async function updateInvoiceItem(
  invoiceId: string,
  itemId: string,
  field: 'categoryId' | 'purposeId' | 'isAsset',
  value: any
): Promise<void> {
  const col = field === 'categoryId' ? 'category_id' : field === 'purposeId' ? 'purpose_id' : 'is_asset';
  const { error } = await supabase
    .from('invoice_items')
    .update({ [col]: value })
    .eq('id', itemId)
    .eq('invoice_id', invoiceId);
  if (error) throw error;
}
