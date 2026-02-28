import { supabase } from './supabase';
import Constants from 'expo-constants';

export interface FirmClientInviteInfo {
  firmSpaceId: string;
  firmName?: string;
  inviterUserId: string;
  skuId: string;
  tokenId: string;
}

export interface FirmClientAcceptResult {
  firmSpaceId: string;
  clientSpaceId: string;
  inviterUserId: string;
  skuId: string;
}

export interface FirmClientInviteToken {
  id: string;
  token: string;
  firmSpaceId: string;
  inviterUserId: string;
  inviterName?: string | null;
  inviterEmail?: string | null;
  skuId: string;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
  maxClients: number | null;
  currentClients: number;
}

const CLIENT_JOIN_BASE_URL =
  (Constants.expoConfig?.extra as any)?.clientJoinBaseUrl ||
  process.env.EXPO_PUBLIC_CLIENT_JOIN_URL ||
  'https://vouchap.com/client-join';

/** 根据 token 构造发给 Client 的邀请链接。firmName 为 firm space 名称，落地页将直接展示 */
export function buildFirmClientInviteUrl(token: string, firmName?: string | null): string {
  const base = (CLIENT_JOIN_BASE_URL || '').replace(/\/$/, '');
  if (!token) return base || '';
  const params = new URLSearchParams();
  params.set('token', token);
  if (firmName != null && String(firmName).trim()) {
    params.set('firmName', String(firmName).trim());
  }
  return `${base}?${params.toString()}`;
}

function generateClientInviteToken(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12);
  return `fc_${time}_${rand}`;
}

/** Firm 端：为当前 firm_space + 选定 SKU 创建一条开放邀请 token，并返回可分享链接
 *  @param expiresInDays 可选：邀请有效期（天）；为 null/undefined 表示长期有效
 */
export async function createFirmClientInviteToken(
  firmSpaceId: string,
  skuId: string,
  expiresInDays?: number | null
): Promise<{ token: string | null; url: string | null; error: Error | null }> {
  try {
    if (!firmSpaceId || !skuId) {
      return { token: null, url: null, error: new Error('firmSpaceId and skuId are required') };
    }

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      return { token: null, url: null, error: new Error(userErr.message || 'Failed to get current user') };
    }
    const inviterId = userRes.user?.id;
    if (!inviterId) {
      return { token: null, url: null, error: new Error('Not authenticated') };
    }

    const token = generateClientInviteToken();

    let expiresAt: string | null = null;
    if (typeof expiresInDays === 'number' && expiresInDays > 0) {
      const ms = expiresInDays * 24 * 60 * 60 * 1000;
      expiresAt = new Date(Date.now() + ms).toISOString();
    }

    const payload: any = {
      firm_space_id: firmSpaceId,
      token,
      inviter_user_id: inviterId,
      sku_id: skuId,
    };
    if (expiresAt) {
      payload.expires_at = expiresAt;
    }

    const { data, error } = await supabase
      .schema('firm')
      .from('client_invite_tokens')
      .insert(payload)
      .select('id, token')
      .single();

    if (error) {
      return { token: null, url: null, error: new Error(error.message || 'Failed to create invite token') };
    }

    const finalToken = (data as any)?.token ?? token;
    // 每条邀请都对应 firm space，查 space 名称并写入链接供落地页展示
    const { data: spaceRow } = await supabase.from('spaces').select('name').eq('id', firmSpaceId).maybeSingle();
    const firmName = (spaceRow as { name?: string } | null)?.name ?? null;
    const url = buildFirmClientInviteUrl(finalToken, firmName);
    return { token: finalToken, url, error: null };
  } catch (e) {
    return {
      token: null,
      url: null,
      error: e instanceof Error ? e : new Error('Failed to create firm client invite token'),
    };
  }
}

/** Firm 端：获取某个 firm_space 下的开放邀请 token 列表（用于展示邀请历史） */
export async function getFirmClientInviteHistory(
  firmSpaceId: string
): Promise<{ invites: FirmClientInviteToken[]; error: Error | null }> {
  try {
    if (!firmSpaceId) {
      return { invites: [], error: new Error('firmSpaceId is required') };
    }
    const { data, error } = await supabase
      .schema('firm')
      .from('client_invite_tokens')
      .select('id, token, firm_space_id, inviter_user_id, sku_id, created_at, expires_at, is_active, max_clients, current_clients')
      .eq('firm_space_id', firmSpaceId)
      .order('created_at', { ascending: false });

    if (error) {
      return { invites: [], error: new Error(error.message || 'Failed to load invite history') };
    }

    const rows = (data || []) as any[];

    // 加载创建人信息，用于在 UI 中显示名称/邮箱
    const inviterIds = Array.from(
      new Set(rows.map((r) => r.inviter_user_id).filter(Boolean))
    ) as string[];
    let inviterMap: Record<string, { name: string | null; email: string }> = {};
    if (inviterIds.length > 0) {
      const { data: users, error: usersErr } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', inviterIds);
      if (usersErr) {
        console.error('getFirmClientInviteHistory users:', usersErr);
      } else {
        inviterMap = {};
        (users || []).forEach((u: any) => {
          inviterMap[u.id] = { name: u.name ?? null, email: u.email || '' };
        });
      }
    }

    const invites: FirmClientInviteToken[] = rows.map((row) => {
      const inviter = inviterMap[row.inviter_user_id] ?? null;
      return {
        id: row.id,
        token: row.token,
        firmSpaceId: row.firm_space_id,
        inviterUserId: row.inviter_user_id,
        inviterName: inviter?.name ?? null,
        inviterEmail: inviter?.email ?? null,
        skuId: row.sku_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at ?? null,
        isActive: row.is_active ?? true,
        maxClients: row.max_clients ?? null,
        currentClients: row.current_clients ?? 0,
      };
    });
    return { invites, error: null };
  } catch (e) {
    return {
      invites: [],
      error: e instanceof Error ? e : new Error('Failed to load invite history'),
    };
  }
}

/** 手动开启/关闭某个开放邀请 token 的 active 状态 */
export async function setFirmClientInviteActive(
  id: string,
  isActive: boolean
): Promise<{ error: Error | null }> {
  try {
    if (!id) {
      return { error: new Error('id is required') };
    }
    const { error } = await supabase
      .schema('firm')
      .from('client_invite_tokens')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) {
      return { error: new Error(error.message || 'Failed to update invite active status') };
    }
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error('Failed to update invite active status'),
    };
  }
}

/** 获取开放邀请 token 的基础信息（用于 App/Web 内展示 firm 信息） */
export async function getFirmClientInviteInfo(
  token: string
): Promise<{ info: FirmClientInviteInfo | null; error: Error | null }> {
  try {
    if (!token) {
      return { info: null, error: new Error('Token is required') };
    }

    const { data, error } = await supabase.rpc('firm_get_client_invite_info', {
      p_token: token,
    });

    if (error) {
      return { info: null, error: new Error(error.message || 'Failed to load invite info') };
    }

    // RPC 返回 SETOF 时为数组，取首行
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { info: null, error: null };
    }

    // 约定 RPC 返回字段名：firm_space_id, firm_name, inviter_user_id, sku_id, token_id
    return {
      info: {
        firmSpaceId: row.firm_space_id,
        firmName: row.firm_name ?? undefined,
        inviterUserId: row.inviter_user_id,
        skuId: row.sku_id,
        tokenId: row.token_id ?? row.id ?? '',
      },
      error: null,
    };
  } catch (e) {
    return {
      info: null,
      error: e instanceof Error ? e : new Error('Failed to load invite info'),
    };
  }
}

/** 消费开放邀请 token：将选定的 client_space 绑定为该 firm 的 client，并创建订单 */
export async function acceptFirmClientInvite(
  token: string,
  clientSpaceId: string,
  clientUserId: string
): Promise<{ result: FirmClientAcceptResult | null; error: Error | null }> {
  try {
    if (!token || !clientSpaceId || !clientUserId) {
      return { result: null, error: new Error('Token, clientSpaceId and clientUserId are required') };
    }

    const { data, error } = await supabase.rpc('firm_accept_client_invite_token', {
      p_token: token,
      p_client_space_id: clientSpaceId,
      p_client_user_id: clientUserId,
    });

    if (error) {
      const msg = [error.message, (error as any).details, (error as any).hint].filter(Boolean).join(' ');
      if (process.env.NODE_ENV !== 'production') {
        console.error('[acceptFirmClientInvite] RPC error:', error);
      }
      return { result: null, error: new Error(msg || 'Failed to accept firm client invite') };
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return { result: null, error: null };
    }

    const row = data[0];
    return {
      result: {
        firmSpaceId: row.firm_space_id,
        clientSpaceId: row.client_space_id,
        inviterUserId: row.inviter_user_id,
        skuId: row.sku_id,
      },
      error: null,
    };
  } catch (e) {
    return {
      result: null,
      error: e instanceof Error ? e : new Error('Failed to accept firm client invite'),
    };
  }
}

