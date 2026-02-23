import { supabase } from './supabase';
import { getCurrentUser } from './auth';
import type { ExpenseIncomeScope } from '@/types';

// 用途接口（与 types 中 Purpose 一致，此处保留导出供 manage 页使用）
export interface Purpose {
  id: string;
  spaceId: string;
  name: string;
  color: string;
  isDefault: boolean;
  scope?: ExpenseIncomeScope;
  createdAt?: string;
  updatedAt?: string;
}

function mapPurposeRow(row: any): Purpose {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    color: row.color,
    isDefault: row.is_default,
    scope: row.scope === 'income' ? 'income' : (row.scope === 'expense' ? 'expense' : undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 含 Other 的列表将 Other 排到最后 */
function sortOtherLast<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.name === 'Other' ? 1 : 0) - (b.name === 'Other' ? 1 : 0));
}

/** 获取当前空间的用途，可选 scope 仅返回支出或收入 */
export async function getPurposes(scope?: ExpenseIncomeScope): Promise<Purpose[]> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    let query = supabase
      .from('purposes')
      .select('*')
      .eq('space_id', spaceId);

    if (scope === 'expense') {
      query = query.or('scope.eq.expense,scope.is.null');
    } else if (scope === 'income') {
      query = query.eq('scope', 'income');
    }

    let result = await query
      .order('usage_count', { ascending: false, nullsFirst: false })
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });

    if (result.error) {
      if (result.error.message?.includes('scope') || result.error.code === '42703') {
        const { data: all } = await supabase
          .from('purposes')
          .select('*')
          .eq('space_id', spaceId)
          .order('usage_count', { ascending: false, nullsFirst: false })
          .order('name', { ascending: true });
        const filtered = scope === 'income'
          ? (all || []).filter((r: any) => r.scope === 'income')
          : (all || []).filter((r: any) => r.scope === 'expense' || r.scope == null);
        return sortOtherLast(filtered.map(mapPurposeRow));
      }
      throw result.error;
    }

    return sortOtherLast((result.data || []).map(mapPurposeRow));
  } catch (error) {
    console.error('Error fetching purposes:', error);
    throw error;
  }
}

// 创建用途，scope 必填以区分支出/收入
export async function createPurpose(name: string, color: string = '#95A5A6', scope: ExpenseIncomeScope = 'expense'): Promise<Purpose> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    const { data, error } = await supabase
      .from('purposes')
      .insert({
        space_id: spaceId,
        name: name.trim(),
        color: color,
        is_default: false,
        scope: scope,
      })
      .select()
      .single();

    if (error) {
      if (error.message?.includes('scope') || error.code === '42703') {
        const { data: fallback, error: err2 } = await supabase
          .from('purposes')
          .insert({ space_id: spaceId, name: name.trim(), color, is_default: false })
          .select()
          .single();
        if (err2) throw err2;
        return mapPurposeRow(fallback);
      }
      throw error;
    }
    return mapPurposeRow(data!);
  } catch (error) {
    console.error('Error creating purpose:', error);
    throw error;
  }
}

// 更新用途
export async function updatePurpose(purposeId: string, updates: { name?: string; color?: string; scope?: ExpenseIncomeScope }): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');

    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.scope !== undefined) updateData.scope = updates.scope;

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    const { error } = await supabase
      .from('purposes')
      .update(updateData)
      .eq('id', purposeId)
      .eq('space_id', spaceId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating purpose:', error);
    throw error;
  }
}

// 删除用途（不能删除默认用途）
export async function deletePurpose(purposeId: string): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');

    // 优先使用 currentSpaceId，如果没有则使用 spaceId（向后兼容）
    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    const { error } = await supabase
      .from('purposes')
      .delete()
      .eq('id', purposeId)
      .eq('space_id', spaceId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting purpose:', error);
    throw error;
  }
}

// 根据名称查找用途（用于AI识别后匹配），scope 可选以限定支出/收入
export async function findPurposeByName(name: string, scope?: ExpenseIncomeScope): Promise<Purpose | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) return null;

    let query = supabase
      .from('purposes')
      .select('*')
      .eq('space_id', spaceId)
      .ilike('name', name.trim())
      .limit(1);

    if (scope === 'expense') {
      query = query.or('scope.eq.expense,scope.is.null');
    } else if (scope === 'income') {
      query = query.eq('scope', 'income');
    }

    let result = await query.single();

    if (result.error) {
      if (result.error.code === 'PGRST116') return null;
      if (result.error.message?.includes('scope') || result.error.code === '42703') {
        const { data: fallback } = await supabase
          .from('purposes')
          .select('*')
          .eq('space_id', spaceId)
          .ilike('name', name.trim())
          .limit(1)
          .maybeSingle();
        return fallback ? mapPurposeRow(fallback) : null;
      }
      throw result.error;
    }

    return mapPurposeRow(result.data);
  } catch (error) {
    console.error('Error finding purpose:', error);
    return null;
  }
}

