import { supabase } from './supabase';
import type { ChatLog } from './chat-logs';

/**
 * 聊天日志保存的是**识别前**的临时附件 URL（`{spaceId}/temp/...`）。识别完成后 processor 会把图片
 * 转存到正式路径并删除临时文件（见 `receipt-processor.ts` 的 `deleteTempFile`），于是历史记录里的
 * 图片 URL 会 404 —— 详情页正常是因为它读的是单据表里的 `image_url`。
 *
 * 文档（PDF/Office）走的是另一条分支，不转存也不删除，所以不受影响。
 */
export function isTempAttachmentUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.split(/[#?]/)[0].includes('/temp/');
}

/** 单据表 → ChatLog 上对应的外键字段 */
const VOUCHER_SOURCES = [
  { table: 'receipts', logKey: 'receiptId' },
  { table: 'invoices', logKey: 'invoiceId' },
  { table: 'inbound', logKey: 'inboundId' },
  { table: 'outbound', logKey: 'outboundId' },
] as const;

function attachmentUrlOf(log: ChatLog): string | undefined {
  return (log.requestData as any)?.imageUrl ?? log.attachmentUrl ?? undefined;
}

/**
 * 对附件仍指向临时路径的日志，批量取回其关联单据的正式 `image_url`。
 * 返回 logId → 正式 URL；查不到（单据已删 / 尚未识别完成）的条目不会出现在结果里，调用方沿用原 URL。
 */
export async function resolveVoucherImageUrls(logs: ChatLog[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const pending = logs.filter((log) => isTempAttachmentUrl(attachmentUrlOf(log)));
  if (pending.length === 0) return resolved;

  await Promise.all(
    VOUCHER_SOURCES.map(async ({ table, logKey }) => {
      const logIdsByVoucherId = new Map<string, string[]>();
      for (const log of pending) {
        const voucherId = (log as any)[logKey] as string | undefined | null;
        if (!voucherId) continue;
        const bucket = logIdsByVoucherId.get(voucherId);
        if (bucket) bucket.push(log.id);
        else logIdsByVoucherId.set(voucherId, [log.id]);
      }
      if (logIdsByVoucherId.size === 0) return;

      const { data, error } = await supabase
        .from(table)
        .select('id, image_url')
        .in('id', [...logIdsByVoucherId.keys()]);
      if (error) {
        console.warn(`[resolveVoucherImageUrls] ${table}:`, error.message);
        return;
      }

      for (const row of data ?? []) {
        const url = (row as any).image_url as string | null;
        if (!url || isTempAttachmentUrl(url)) continue;
        for (const logId of logIdsByVoucherId.get((row as any).id as string) ?? []) {
          resolved.set(logId, url);
        }
      }
    }),
  );

  return resolved;
}
