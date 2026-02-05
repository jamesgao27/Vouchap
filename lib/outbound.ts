import { supabase } from './supabase';
import { Outbound, OutboundItem } from '@/types';
import { getCurrentUser } from './auth';

function rowToOutbound(row: any, items: OutboundItem[] = []): Outbound {
  return {
    id: row.id,
    spaceId: row.space_id,
    documentNo: row.document_no ?? undefined,
    customerName: row.customer_name ?? undefined,
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

/** 获取当前空间下所有出库单（列表用） */
export async function getAllOutbound(): Promise<Outbound[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  const { data, error } = await supabase
    .from('outbound')
    .select('*')
    .eq('space_id', spaceId)
    .order('date', { ascending: false });

  if (error) throw error;
  return (data || []).map((r: any) => rowToOutbound(r, []));
}

/** 根据 ID 获取出库单（含明细） */
export async function getOutboundById(outboundId: string): Promise<Outbound | null> {
  const { data: row, error: rowError } = await supabase
    .from('outbound')
    .select('*')
    .eq('id', outboundId)
    .single();
  if (rowError || !row) return null;

  const { data: itemRows, error: itemsError } = await supabase
    .from('outbound_items')
    .select('*')
    .eq('outbound_id', outboundId)
    .order('id', { ascending: true });
  if (itemsError) return rowToOutbound(row, []);

  const items: OutboundItem[] = (itemRows || []).map((r: any) => ({
    id: r.id,
    outboundId: r.outbound_id,
    skuId: r.sku_id ?? undefined,
    productName: r.product_name,
    quantity: Number(r.quantity),
    unit: r.unit ?? '件',
    unitPrice: r.unit_price != null ? Number(r.unit_price) : undefined,
    confidence: r.confidence != null ? Number(r.confidence) : undefined,
  }));
  return rowToOutbound(row, items);
}

/** 保存出库单（新建或更新）— 占位实现 */
export async function saveOutbound(outbound: Outbound): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  if (outbound.id) {
    await supabase
      .from('outbound')
      .update({
        document_no: outbound.documentNo ?? null,
        customer_name: outbound.customerName ?? null,
        total_amount: outbound.totalAmount ?? null,
        currency: outbound.currency ?? null,
        date: outbound.date,
        status: outbound.status,
        image_url: outbound.imageUrl ?? null,
        input_type: outbound.inputType ?? 'image',
        confidence: outbound.confidence ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', outbound.id);
    if (outbound.items?.length) {
      await supabase.from('outbound_items').delete().eq('outbound_id', outbound.id);
      await supabase.from('outbound_items').insert(
        outbound.items.map((it) => ({
          outbound_id: outbound.id,
          sku_id: it.skuId ?? null,
          product_name: it.productName,
          quantity: it.quantity,
          unit: it.unit ?? '件',
          unit_price: it.unitPrice ?? null,
          confidence: it.confidence ?? null,
        }))
      );
    }
    return outbound.id;
  }

  const { data: inserted, error } = await supabase
    .from('outbound')
    .insert({
      space_id: spaceId,
      document_no: outbound.documentNo ?? null,
      customer_name: outbound.customerName ?? null,
      total_amount: outbound.totalAmount ?? null,
      currency: outbound.currency ?? null,
      date: outbound.date,
      status: outbound.status,
      image_url: outbound.imageUrl ?? null,
      input_type: outbound.inputType ?? 'image',
      confidence: outbound.confidence ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  const id = inserted.id;
  if (outbound.items?.length) {
    await supabase.from('outbound_items').insert(
      outbound.items.map((it) => ({
        outbound_id: id,
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

/** 删除出库单 */
export async function deleteOutbound(outboundId: string): Promise<void> {
  const { error } = await supabase.from('outbound').delete().eq('id', outboundId);
  if (error) throw error;
}
