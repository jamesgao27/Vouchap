import { supabase } from './supabase';
import { Inbound, InboundItem } from '@/types';
import { getCurrentUser } from './auth';

function rowToInbound(row: any, items: InboundItem[] = []): Inbound {
  return {
    id: row.id,
    spaceId: row.space_id,
    documentNo: row.document_no ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    supplierName: row.supplier_name ?? undefined,
    totalAmount: row.total_amount != null ? Number(row.total_amount) : undefined,
    currency: row.currency ?? undefined,
    date: row.date,
    status: row.status ?? 'pending',
    imageUrl: row.image_url ?? undefined,
    inputType: row.input_type ?? 'image',
    confidence: row.confidence != null ? Number(row.confidence) : undefined,
    createdBy: row.created_by ?? undefined,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 获取当前空间下所有入库单（列表用） */
export async function getAllInbound(): Promise<Inbound[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  const { data, error } = await supabase
    .from('inbound')
    .select('*')
    .eq('space_id', spaceId)
    .order('date', { ascending: false });

  if (error) throw error;
  return (data || []).map((r: any) => rowToInbound(r, []));
}

/** 根据 ID 获取入库单（含明细） */
export async function getInboundById(inboundId: string): Promise<Inbound | null> {
  const { data: row, error: rowError } = await supabase
    .from('inbound')
    .select('*')
    .eq('id', inboundId)
    .single();
  if (rowError || !row) return null;

  const { data: itemRows, error: itemsError } = await supabase
    .from('inbound_items')
    .select('*')
    .eq('inbound_id', inboundId)
    .order('id', { ascending: true });
  if (itemsError) return rowToInbound(row, []);

  const items: InboundItem[] = (itemRows || []).map((r: any) => ({
    id: r.id,
    inboundId: r.inbound_id,
    skuId: r.sku_id ?? undefined,
    productName: r.product_name,
    quantity: Number(r.quantity),
    unit: r.unit ?? '件',
    unitPrice: r.unit_price != null ? Number(r.unit_price) : undefined,
    confidence: r.confidence != null ? Number(r.confidence) : undefined,
  }));
  return rowToInbound(row, items);
}

/** 保存入库单（新建或更新）— 占位实现 */
export async function saveInbound(inbound: Inbound): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  if (inbound.id) {
    await supabase
      .from('inbound')
      .update({
        document_no: inbound.documentNo ?? null,
        supplier_id: inbound.supplierId ?? null,
        supplier_name: inbound.supplierName ?? null,
        total_amount: inbound.totalAmount ?? null,
        currency: inbound.currency ?? null,
        date: inbound.date,
        status: inbound.status,
        image_url: inbound.imageUrl ?? null,
        input_type: inbound.inputType ?? 'image',
        confidence: inbound.confidence ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inbound.id);
    if (inbound.items?.length) {
      await supabase.from('inbound_items').delete().eq('inbound_id', inbound.id);
      await supabase.from('inbound_items').insert(
        inbound.items.map((it) => ({
          inbound_id: inbound.id,
          sku_id: it.skuId ?? null,
          product_name: it.productName,
          quantity: it.quantity,
          unit: it.unit ?? '件',
          unit_price: it.unitPrice ?? null,
          confidence: it.confidence ?? null,
        }))
      );
    }
    return inbound.id;
  }

  const { data: inserted, error } = await supabase
    .from('inbound')
    .insert({
      space_id: spaceId,
      document_no: inbound.documentNo ?? null,
      supplier_id: inbound.supplierId ?? null,
      supplier_name: inbound.supplierName ?? null,
      total_amount: inbound.totalAmount ?? null,
      currency: inbound.currency ?? null,
      date: inbound.date,
      status: inbound.status,
      image_url: inbound.imageUrl ?? null,
      input_type: inbound.inputType ?? 'image',
      confidence: inbound.confidence ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  const id = inserted.id;
  if (inbound.items?.length) {
    await supabase.from('inbound_items').insert(
      inbound.items.map((it) => ({
        inbound_id: id,
        sku_id: it.skuId ?? null,
        product_name: it.productName,
        quantity: it.quantity,
        unit: it.unit ?? '件',
        unit_price: it.unitPrice ?? null,
        confidence: it.confidence ?? null,
      }))
    );
  }
  return id;
}

/** 删除入库单 */
export async function deleteInbound(inboundId: string): Promise<void> {
  const { error } = await supabase.from('inbound').delete().eq('id', inboundId);
  if (error) throw error;
}
