import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * After receipts / receipt_items are persisted, enqueue line-tax split + reconciliation.
 * Heavy work runs in a backend worker (service role); this path is a single lightweight RPC.
 */
export function enqueueReceiptTaxReconcileFireAndForget(supabase: SupabaseClient, receiptId: string): void {
  const run = () => {
    void (async () => {
      try {
        const { error } = await supabase.rpc('enqueue_receipt_tax_reconcile', { p_receipt_id: receiptId });
        if (error) {
          console.warn('[receipt-tax-queue] enqueue rpc failed:', error.message, error.code);
        }
      } catch (e) {
        console.warn('[receipt-tax-queue] enqueue failed:', e);
      }
    })();
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(run);
  else setTimeout(run, 0);
}
