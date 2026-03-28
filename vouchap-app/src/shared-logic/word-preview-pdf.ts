/**
 * Build a text-based PDF preview from Word (.doc / .docx) bytes for tax-filing attachment preview (iframe/WebView).
 * .docx: JSZip + XML (RN-safe, no Node fs). Legacy .doc: placeholder PDF text only.
 */
import { jsPDF } from 'jspdf';
import { extractWordPlainTextFromArrayBuffer } from './word-document-to-text';

/** Filename / summary hints (e.g. mislabeled storage extension). */
export function summarySuggestsWord(name?: string | null): boolean {
  if (!name || !String(name).trim()) return false;
  const n = String(name).trim();
  return /\.(docx?)$/i.test(n) || /\bword\b/i.test(n) || /\bmsword\b/i.test(n);
}

/** URL extension or AI doc_type hints. */
export function isWordAttachmentUrl(url: string | null | undefined, docType?: string | null): boolean {
  if (docType && String(docType).trim()) {
    const u = String(docType).toUpperCase();
    if (
      u.includes('WORD') ||
      u.includes('DOCX') ||
      u.includes('MSWORD') ||
      u.includes('WORDPROCESSING')
    ) {
      return true;
    }
  }
  if (!url) return false;
  const base = url.split(/[#?]/)[0];
  const ext = base.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'doc' || ext === 'docx';
}

export async function buildWordPreviewPdf(arrayBuffer: ArrayBuffer): Promise<Uint8Array> {
  const raw = await extractWordPlainTextFromArrayBuffer(arrayBuffer);
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageH = pdf.internal.pageSize.getHeight();
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const maxW = pageW - margin * 2;
  const lineHeight = 5;
  const fontSize = 10;
  pdf.setFontSize(fontSize);
  pdf.setTextColor(33, 37, 41);

  let y = margin;

  if (!normalized) {
    pdf.setTextColor(90, 97, 104);
    const msg =
      '(No extractable text in this document. Download the original file to view formatting and embedded content.)';
    const lines = pdf.splitTextToSize(msg, maxW);
    for (const line of lines) {
      if (y > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    return new Uint8Array(pdf.output('arraybuffer'));
  }

  const paragraphs = normalized.split(/\n{2,}/);
  for (const para of paragraphs) {
    const chunk = para.replace(/\n/g, ' ').trim();
    if (!chunk) {
      y += lineHeight * 0.5;
      continue;
    }
    const lines = pdf.splitTextToSize(chunk, maxW);
    for (const line of lines) {
      if (y > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += 2;
  }

  return new Uint8Array(pdf.output('arraybuffer'));
}
