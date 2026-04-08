/**
 * Rich default label for tax-filing task attachments (chat + todos).
 * Keeps AI doc_type as a machine code; this string is meant for humans.
 */

export function buildTaxFilingAttachmentDefaultDisplayName(params: {
  summary?: string | null;
  docType?: string | null;
  sourceFileName?: string | null;
}): string {
  const file = params.sourceFileName?.trim() || '';
  const summaryFirst =
    params.summary?.trim().split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const typeLabel = params.docType?.trim().replace(/_/g, ' ') || '';
  const head = summaryFirst || typeLabel || 'Tax document';
  const tail = file || 'Attachment';
  if (head && tail && !head.includes(tail) && !tail.includes(head)) {
    return `${head} — ${tail}`;
  }
  return head || tail;
}
