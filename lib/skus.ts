import { supabase } from './supabase';
import { Sku } from '@/types';
import { getCurrentUser } from './auth';

/** 获取当前空间下所有 SKU */
export async function getSkus(): Promise<Sku[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  const { data, error } = await supabase
    .from('skus')
    .select('*')
    .eq('space_id', spaceId)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    spaceId: row.space_id,
    code: row.code ?? undefined,
    name: row.name,
    unit: row.unit ?? '件',
    description: row.description ?? undefined,
    isAiRecognized: row.is_ai_recognized ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** 创建 SKU */
export async function createSku(sku: {
  name: string;
  code?: string;
  unit?: string;
  description?: string;
  isAiRecognized?: boolean;
}): Promise<Sku> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  const { data, error } = await supabase
    .from('skus')
    .insert({
      space_id: spaceId,
      name: sku.name.trim(),
      code: sku.code?.trim() || null,
      unit: sku.unit?.trim() || '件',
      description: sku.description?.trim() || null,
      is_ai_recognized: sku.isAiRecognized ?? false,
    })
    .select()
    .single();

  if (error) throw error;
  return {
    id: data.id,
    spaceId: data.space_id,
    code: data.code ?? undefined,
    name: data.name,
    unit: data.unit ?? '件',
    description: data.description ?? undefined,
    isAiRecognized: data.is_ai_recognized ?? false,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/** 更新 SKU */
export async function updateSku(
  skuId: string,
  updates: { name?: string; code?: string; unit?: string; description?: string }
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.code !== undefined) payload.code = updates.code?.trim() || null;
  if (updates.unit !== undefined) payload.unit = updates.unit?.trim() || '件';
  if (updates.description !== undefined) payload.description = updates.description?.trim() || null;
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from('skus').update(payload).eq('id', skuId);
  if (error) throw error;
}

/** 删除 SKU */
export async function deleteSku(skuId: string): Promise<void> {
  const { error } = await supabase.from('skus').delete().eq('id', skuId);
  if (error) throw error;
}

/** 根据 ID 获取单个 SKU（用于详情/编辑） */
export async function getSkuById(skuId: string): Promise<Sku | null> {
  const { data, error } = await supabase.from('skus').select('*').eq('id', skuId).single();
  if (error || !data) return null;
  return {
    id: data.id,
    spaceId: data.space_id,
    code: data.code ?? undefined,
    name: data.name,
    unit: data.unit ?? '件',
    description: data.description ?? undefined,
    isAiRecognized: data.is_ai_recognized ?? false,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
