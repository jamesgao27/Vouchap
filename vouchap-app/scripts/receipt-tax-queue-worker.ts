/**
 * Drains public.receipt_tax_recalc_queue using service role and runs applyReceiptItemTaxesAndReconcile.
 * Deploy: run on a server/cron (e.g. every minute) with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 *   cd vouchap-app && npx tsx scripts/receipt-tax-queue-worker.ts
 *   cd vouchap-app && npx tsx scripts/receipt-tax-queue-worker.ts --once
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  applyReceiptItemTaxesAndReconcile,
  scheduleReceiptTaxRecalcIfNeeded,
} from '../src/shared-logic/receipt-item-tax';

const BATCH = 25;
const POLL_MS = 8000;
const MAX_ATTEMPTS = 24;

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing env ${name}`);
    process.exit(1);
  }
  return v;
}

async function processJob(
  admin: SupabaseClient,
  row: { id: string; receipt_id: string; space_id: string },
): Promise<void> {
  const { data: rec, error: recErr } = await admin
    .from('receipts')
    .select('currency')
    .eq('id', row.receipt_id)
    .maybeSingle();
  if (recErr) throw recErr;

  await applyReceiptItemTaxesAndReconcile(admin, row.receipt_id, row.space_id);
  scheduleReceiptTaxRecalcIfNeeded(admin, row.receipt_id, row.space_id, rec?.currency ?? null);
  await new Promise((r) => setTimeout(r, 80));

  const { error: upErr } = await admin
    .from('receipt_tax_recalc_queue')
    .update({ processed_at: new Date().toISOString(), last_error: null })
    .eq('id', row.id);
  if (upErr) throw upErr;
}

async function tick(admin: SupabaseClient): Promise<void> {
  const { data: rows, error } = await admin
    .from('receipt_tax_recalc_queue')
    .select('id,receipt_id,space_id,attempts')
    .is('processed_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('enqueued_at', { ascending: true })
    .limit(BATCH);

  if (error) {
    console.warn('[receipt-tax-worker] poll failed:', error.message);
    return;
  }

  for (const row of rows || []) {
    const r = row as { id: string; receipt_id: string; space_id: string; attempts: number };
    try {
      await processJob(admin, r);
      console.log('[receipt-tax-worker] ok', r.receipt_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[receipt-tax-worker] failed', r.receipt_id, msg);
      const nextAttempts = (r.attempts ?? 0) + 1;
      const abandon = nextAttempts >= MAX_ATTEMPTS;
      await admin
        .from('receipt_tax_recalc_queue')
        .update(
          abandon
            ? {
                processed_at: new Date().toISOString(),
                attempts: nextAttempts,
                last_error: `abandoned after ${MAX_ATTEMPTS} attempts: ${msg}`,
              }
            : { attempts: nextAttempts, last_error: msg },
        )
        .eq('id', r.id);
    }
  }
}

async function main(): Promise<void> {
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const once = process.argv.includes('--once');
  do {
    await tick(admin);
    if (once) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  } while (true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
