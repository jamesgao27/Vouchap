import { supabase } from './supabase';
import { Account } from '@/types';
import { getCurrentUser } from './auth';

// 获取当前空间的所有账户（仅展示“无指向”的，即未被合并的）
export async function getAccounts(): Promise<Account[]> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('space_id', spaceId)
      .is('merged_into_id', null)
      .order('usage_count', { ascending: false, nullsFirst: false })
      .order('is_ai_recognized', { ascending: false })
      .order('name', { ascending: true });

    if (error) throw error;

    return (data || []).map(mapAccountRow);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    throw error;
  }
}

/** 获取全部账户（含已合并指向的），供大模型选项等用 */
export async function getAccountsForOptions(): Promise<Account[]> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('space_id', spaceId)
      .order('usage_count', { ascending: false, nullsFirst: false })
      .order('is_ai_recognized', { ascending: false })
      .order('name', { ascending: true });

    if (error) throw error;

    return (data || []).map(mapAccountRow);
  } catch (error) {
    console.error('Error fetching accounts for options:', error);
    throw error;
  }
}

function mapAccountRow(row: any): Account {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    isAiRecognized: row.is_ai_recognized,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAccount(name: string, isAiRecognized: boolean = false): Promise<Account> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        space_id: spaceId,
        name: name.trim(),
        is_ai_recognized: isAiRecognized,
      })
      .select()
      .single();

    if     (error) throw error;

    return mapAccountRow(data);
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
}

export async function updateAccount(accountId: string, updates: { name?: string }): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');

    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    const { error } = await supabase
      .from('accounts')
      .update(updateData)
      .eq('id', accountId)
      .eq('space_id', spaceId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating account:', error);
    throw error;
  }
}

export async function deleteAccount(accountId: string): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', accountId)
      .eq('space_id', spaceId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting account:', error);
    throw error;
  }
}

function extractCardSuffix(name: string): string | null {
  const patterns = [
    /\*{2,}(\d{4,})/,
    /\*(\d{4,})/,
    /尾号[：:\s]*(\d{4,})/i,
    /(?:last\s*4|last\s*four)[：:\s]*(\d{4,})/i,
    /(?:ending\s*in|ends\s*in)[：:\s]*(\d{4,})/i,
    /#\s*(\d{4,})/,
    /\b(\d{4,})\s*(?:尾号|ending|last)/i,
    /(\d{4,})$/,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function normalizeAccountName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[：:]/g, ':').replace(/\*+/g, '*');
}

export async function findOrCreateAccount(name: string, isAiRecognized: boolean = true): Promise<Account> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');

    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Account name cannot be empty');

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    const { data: allAccounts, error: fetchError } = await supabase
      .from('accounts')
      .select('*')
      .eq('space_id', spaceId)
      .order('usage_count', { ascending: false, nullsFirst: false });

    if (fetchError) throw fetchError;

    if (!allAccounts?.length) return await createAccount(trimmedName, isAiRecognized);

    const normalizedName = normalizeAccountName(trimmedName);

    const mergeHistory = await getMergeHistory();
    const mergedTargetId = mergeHistory.get(normalizedName);
    if (mergedTargetId) {
      const mergedAccount = allAccounts.find(acc => acc.id === mergedTargetId);
      if (mergedAccount) {
        return {
          id: mergedAccount.id,
          spaceId: mergedAccount.space_id,
          name: mergedAccount.name,
          isAiRecognized: mergedAccount.is_ai_recognized,
          createdAt: mergedAccount.created_at,
          updatedAt: mergedAccount.updated_at,
        };
      }
    }

    const exactMatch = allAccounts.find(acc => normalizeAccountName(acc.name) === normalizedName);
    if (exactMatch) {
      return {
        id: exactMatch.id,
        spaceId: exactMatch.space_id,
        name: exactMatch.name,
        isAiRecognized: exactMatch.is_ai_recognized,
        createdAt: exactMatch.created_at,
        updatedAt: exactMatch.updated_at,
      };
    }

    const cardSuffix = extractCardSuffix(trimmedName);
    if (cardSuffix) {
      for (const account of allAccounts) {
        const accountSuffix = extractCardSuffix(account.name);
        if (accountSuffix === cardSuffix) {
          return {
            id: account.id,
            spaceId: account.space_id,
            name: account.name,
            isAiRecognized: account.is_ai_recognized,
            createdAt: account.created_at,
            updatedAt: account.updated_at,
          };
        }
      }
    }

    return await createAccount(trimmedName, isAiRecognized);
  } catch (error) {
    console.error('Error finding or creating account:', error);
    throw error;
  }
}

// 合并账户：只设置“合并指向”，不删记录、不修改小票/发票
export async function mergeAccount(
  sourceAccountIds: string[],
  targetAccountId: string
): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');
    if (sourceAccountIds.length === 0) throw new Error('No source accounts to merge');
    if (sourceAccountIds.includes(targetAccountId)) throw new Error('Cannot merge account to itself');

    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) throw new Error('No space selected');

    const allAccountIds = [...sourceAccountIds, targetAccountId];
    const { data: accounts, error: fetchError } = await supabase
      .from('accounts')
      .select('id, merged_into_id')
      .eq('space_id', spaceId)
      .in('id', allAccountIds);

    if (fetchError) throw fetchError;
    if (!accounts || accounts.length !== allAccountIds.length) {
      throw new Error('Account does not exist or does not belong to current space');
    }

    const { data: withPointer } = await supabase
      .from('accounts')
      .select('id, merged_into_id')
      .eq('space_id', spaceId)
      .not('merged_into_id', 'is', null);

    const mergeMap = new Map<string, string>();
    (withPointer || []).forEach((r: any) => {
      if (r.merged_into_id) mergeMap.set(r.id, r.merged_into_id);
    });
    const resolveToFinal = (id: string): string => {
      let current = id;
      const seen = new Set<string>();
      while (mergeMap.has(current) && !seen.has(current)) {
        seen.add(current);
        current = mergeMap.get(current)!;
      }
      return current;
    };

    const finalTargetId = resolveToFinal(targetAccountId);

    for (const sourceId of sourceAccountIds) {
      const { error: updatePointers } = await supabase
        .from('accounts')
        .update({ merged_into_id: finalTargetId })
        .eq('space_id', spaceId)
        .eq('merged_into_id', sourceId);
      if (updatePointers) throw updatePointers;

      const { error: setSource } = await supabase
        .from('accounts')
        .update({ merged_into_id: finalTargetId })
        .eq('id', sourceId)
        .eq('space_id', spaceId);
      if (setSource) throw setSource;
    }
  } catch (error) {
    console.error('Error merging account:', error);
    throw error;
  }
}

/** 从 accounts 表构建合并指向映射 id -> merged_into_id */
export async function getAccountMergeMap(spaceId: string): Promise<Map<string, string>> {
  const { data: rows } = await supabase
    .from('accounts')
    .select('id, merged_into_id')
    .eq('space_id', spaceId)
    .not('merged_into_id', 'is', null);

  const map = new Map<string, string>();
  (rows || []).forEach((r: any) => {
    if (r.id && r.merged_into_id) map.set(r.id, r.merged_into_id);
  });
  return map;
}

/** 按 merged_into_id 解析账户 ID：返回应展示的目标 ID */
export async function resolveAccountId(spaceId: string, accountId: string): Promise<string> {
  const map = await getAccountMergeMap(spaceId);
  let current = accountId;
  const seen = new Set<string>();
  while (map.has(current) && !seen.has(current)) {
    seen.add(current);
    current = map.get(current)!;
  }
  return current;
}

/** 按 ID 获取单个账户（用于合并后展示） */
export async function getAccountById(id: string): Promise<Account | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const spaceId = user.currentSpaceId || user.spaceId;
  if (!spaceId) return null;

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .eq('space_id', spaceId)
    .maybeSingle();

  if (error || !data) return null;
  return mapAccountRow(data);
}

// 名称 -> 应归并到的目标账户 ID（用于 findOrCreateAccount：已合并指向的记录按名称匹配到最终目标）
async function getMergeHistory(): Promise<Map<string, string>> {
  try {
    const user = await getCurrentUser();
    if (!user) return new Map();
    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) return new Map();

    const { data: withPointer, error } = await supabase
      .from('accounts')
      .select('id, name, merged_into_id')
      .eq('space_id', spaceId)
      .not('merged_into_id', 'is', null);

    if (error) return new Map();
    if (!withPointer?.length) return new Map();

    const mergeMap = new Map<string, string>();
    (withPointer || []).forEach((r: any) => {
      if (r.id && r.merged_into_id) mergeMap.set(r.id, r.merged_into_id);
    });
    const resolveToFinal = (id: string): string => {
      let current = id;
      const seen = new Set<string>();
      while (mergeMap.has(current) && !seen.has(current)) {
        seen.add(current);
        current = mergeMap.get(current)!;
      }
      return current;
    };

    const historyMap = new Map<string, string>();
    for (const r of withPointer) {
      historyMap.set(normalizeAccountName(r.name), resolveToFinal(r.id));
    }
    return historyMap;
  } catch (error) {
    console.warn('Error getting merge history:', error);
    return new Map();
  }
}
