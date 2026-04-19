import { supabase } from './supabase';

export type ClientRecognitionQuota = {
  enforce: boolean;
  spaceKind: string;
  includedPerMonth: number;
  monthlyCap: number | null;
  usedThisMonth: number;
  creditsBalance: number;
  processingLinked: boolean;
};

function parseQuotaPayload(data: unknown): ClientRecognitionQuota | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.ok !== true) return null;
  if (o.enforce !== true) {
    return {
      enforce: false,
      spaceKind: typeof o.space_kind === 'string' ? o.space_kind : 'unknown',
      includedPerMonth: 0,
      monthlyCap: null,
      usedThisMonth: 0,
      creditsBalance: 0,
      processingLinked: false,
    };
  }
  return {
    enforce: true,
    spaceKind: typeof o.space_kind === 'string' ? o.space_kind : 'client',
    includedPerMonth: typeof o.included_per_month === 'number' ? o.included_per_month : 10,
    monthlyCap: typeof o.monthly_cap === 'number' ? o.monthly_cap : null,
    usedThisMonth: typeof o.used_this_month === 'number' ? o.used_this_month : 0,
    creditsBalance: typeof o.credits_balance === 'number' ? o.credits_balance : 0,
    processingLinked: o.processing_linked === true,
  };
}

/** Load quota for a client space (always enforced; included tier from catalog CLIENT_RECOGNITION_BASE). */
export async function fetchClientRecognitionQuota(spaceId: string): Promise<ClientRecognitionQuota | null> {
  if (!spaceId) return null;
  const { data, error } = await supabase.schema('crm').rpc('get_client_recognition_quota', {
    p_space_id: spaceId,
  });
  if (error) {
    console.warn('[client-recognition-quota] get_client_recognition_quota', error.message);
    return null;
  }
  return parseQuotaPayload(data);
}

/** Preflight for one recognition attempt (matches server rules; race-safe final check is record). */
export async function assertClientRecognitionAllowed(
  spaceId: string,
): Promise<{ allowed: boolean; message?: string; quota?: ClientRecognitionQuota | null }> {
  if (!spaceId) return { allowed: true };
  const quota = await fetchClientRecognitionQuota(spaceId);
  if (!quota || !quota.enforce) return { allowed: true, quota };

  if (quota.monthlyCap != null && quota.usedThisMonth >= quota.monthlyCap) {
    return {
      allowed: false,
      message: "You've reached this month's document recognition limit.",
      quota,
    };
  }
  if (quota.usedThisMonth >= quota.includedPerMonth && quota.creditsBalance < 1) {
    return {
      allowed: false,
      message:
        'Your included recognitions for this month are used up. Add credits to continue, or wait until next month.',
      quota,
    };
  }
  return { allowed: true, quota };
}

/** Call after a successful AI recognition for expense / income / tax docs on a client space. */
export async function recordClientRecognitionSuccessIfEnforced(
  spaceId: string,
): Promise<{ ok: boolean; code?: string; message?: string; skipped?: boolean }> {
  if (!spaceId) return { ok: true, skipped: true };
  const { data, error } = await supabase.schema('crm').rpc('record_client_recognition_success', {
    p_space_id: spaceId,
  });
  if (error) {
    console.warn('[client-recognition-quota] record_client_recognition_success', error.message);
    return { ok: false, code: 'RPC_ERROR', message: error.message };
  }
  if (!data || typeof data !== 'object') return { ok: false, code: 'BAD_PAYLOAD' };
  const o = data as Record<string, unknown>;
  if (o.skipped === true) return { ok: true, skipped: true };
  if (o.ok === true) return { ok: true };
  return {
    ok: false,
    code: typeof o.code === 'string' ? o.code : 'UNKNOWN',
    message: typeof o.message === 'string' ? o.message : undefined,
  };
}
