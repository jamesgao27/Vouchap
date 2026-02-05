import { supabase } from './supabase';
import { Warehouse, Location } from '@/types';
import { getCurrentUser } from './auth';

/** 获取当前空间下所有仓库 */
export async function getWarehouses(): Promise<Warehouse[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  const { data, error } = await supabase
    .from('warehouse')
    .select('*')
    .eq('space_id', spaceId)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    code: row.code ?? undefined,
    address: row.address ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** 创建仓库 */
export async function createWarehouse(w: { name: string; code?: string; address?: string }): Promise<Warehouse> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) throw new Error('No space selected');

  const { data, error } = await supabase
    .from('warehouse')
    .insert({
      space_id: spaceId,
      name: w.name.trim(),
      code: w.code?.trim() || null,
      address: w.address?.trim() || null,
    })
    .select()
    .single();

  if (error) throw error;
  return {
    id: data.id,
    spaceId: data.space_id,
    name: data.name,
    code: data.code ?? undefined,
    address: data.address ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/** 更新仓库 */
export async function updateWarehouse(id: string, updates: { name?: string; code?: string; address?: string }): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.code !== undefined) payload.code = updates.code?.trim() || null;
  if (updates.address !== undefined) payload.address = updates.address?.trim() || null;
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase.from('warehouse').update(payload).eq('id', id);
  if (error) throw error;
}

/** 删除仓库（会级联删除仓位） */
export async function deleteWarehouse(id: string): Promise<void> {
  const { error } = await supabase.from('warehouse').delete().eq('id', id);
  if (error) throw error;
}

/** 获取某仓库下的所有仓位 */
export async function getLocationsByWarehouse(warehouseId: string): Promise<Location[]> {
  const { data, error } = await supabase
    .from('location')
    .select('*')
    .eq('warehouse_id', warehouseId)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    warehouseId: row.warehouse_id,
    name: row.name,
    code: row.code ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** 创建仓位 */
export async function createLocation(l: { warehouseId: string; name: string; code?: string }): Promise<Location> {
  const { data, error } = await supabase
    .from('location')
    .insert({
      warehouse_id: l.warehouseId,
      name: l.name.trim(),
      code: l.code?.trim() || null,
    })
    .select()
    .single();

  if (error) throw error;
  return {
    id: data.id,
    warehouseId: data.warehouse_id,
    name: data.name,
    code: data.code ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/** 更新仓位 */
export async function updateLocation(id: string, updates: { name?: string; code?: string }): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.code !== undefined) payload.code = updates.code?.trim() || null;
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase.from('location').update(payload).eq('id', id);
  if (error) throw error;
}

/** 删除仓位 */
export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from('location').delete().eq('id', id);
  if (error) throw error;
}
