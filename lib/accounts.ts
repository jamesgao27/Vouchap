import { supabase } from './supabase';
import { Account } from '@/types';
import { getCurrentUser } from './auth';

// 获取当前空间的所有账户（收付款共用）
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
      .order('usage_count', { ascending: false, nullsFirst: false })
      .order('is_ai_recognized', { ascending: false })
      .order('name', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      spaceId: row.space_id,
      name: row.name,
      isAiRecognized: row.is_ai_recognized,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error('Error fetching accounts:', error);
    throw error;
  }
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

    if (error) throw error;

    return {
      id: data.id,
      spaceId: data.space_id,
      name: data.name,
      isAiRecognized: data.is_ai_recognized,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
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
      .select('*')
      .eq('space_id', spaceId)
      .in('id', allAccountIds);

    if (fetchError) throw fetchError;
    if (!accounts || accounts.length !== allAccountIds.length) {
      throw new Error('Account does not exist or does not belong to current space');
    }

    const targetAccount = accounts.find(acc => acc.id === targetAccountId);
    if (!targetAccount) throw new Error('Target account does not exist');

    for (const sourceAccountId of sourceAccountIds) {
      const sourceAccount = accounts.find(acc => acc.id === sourceAccountId);
      if (!sourceAccount) continue;

      const { error: updateError } = await supabase
        .from('receipts')
        .update({ account_id: targetAccountId })
        .eq('account_id', sourceAccountId)
        .eq('space_id', spaceId);
      if (updateError) throw updateError;

      const { error: invError } = await supabase
        .from('invoices')
        .update({ account_id: targetAccountId })
        .eq('account_id', sourceAccountId)
        .eq('space_id', spaceId);
      if (invError) throw invError;

      await supabase.from('account_merge_history').insert({
        space_id: spaceId,
        source_account_name: sourceAccount.name,
        target_account_id: targetAccountId,
      });

      const { error: deleteError } = await supabase
        .from('accounts')
        .delete()
        .eq('id', sourceAccountId)
        .eq('space_id', spaceId);
      if (deleteError) throw deleteError;
    }
  } catch (error) {
    console.error('Error merging account:', error);
    throw error;
  }
}

async function getMergeHistory(): Promise<Map<string, string>> {
  try {
    const user = await getCurrentUser();
    if (!user) return new Map();
    const spaceId = user.currentSpaceId || user.spaceId;
    if (!spaceId) return new Map();

    const { data: historyData, error: historyError } = await supabase
      .from('account_merge_history')
      .select('source_account_name, target_account_id')
      .eq('space_id', spaceId);

    if (historyError) {
      if (historyError.code === '42P01' || historyError.message?.includes('does not exist')) return new Map();
      console.warn('Failed to fetch merge history:', historyError);
      return new Map();
    }

    if (!historyData?.length) return new Map();

    const targetAccountIds = [...new Set(historyData.map(r => r.target_account_id))];
    const { data: validAccounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id')
      .eq('space_id', spaceId)
      .in('id', targetAccountIds);

    if (accountsError) return new Map();
    const validAccountIds = new Set(validAccounts?.map(acc => acc.id) || []);

    const historyMap = new Map<string, string>();
    for (const record of historyData) {
      if (validAccountIds.has(record.target_account_id)) {
        historyMap.set(normalizeAccountName(record.source_account_name), record.target_account_id);
      }
    }
    return historyMap;
  } catch (error) {
    console.warn('Error getting merge history:', error);
    return new Map();
  }
}
