/**
 * Build a simple PDF preview from Excel bytes for in-app WebView/iframe (tax-filing attachments).
 * Multi-sheet workbooks: one PDF file, each sheet starts on a new page; long sheets paginate via jspdf-autotable.
 */
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ensureJsPDFCjkFont, JSPDF_CJK_FONT_ID } from './jspdf-cjk-font';

/** Safety cap so pathological files cannot freeze the client; excess sheets get a notice page. */
const MAX_SHEETS_CAP = 100;
const MAX_ROWS_PER_SHEET = 2000;
const MAX_COLS = 22;
const MAX_CELL_STRLEN = 96;

/** 列表/详情的 summary 含文件名线索时，Storage 路径可能被误标成 .jpg */
export function summarySuggestsSpreadsheet(name?: string | null): boolean {
  if (!name || !String(name).trim()) return false;
  const n = String(name).trim();
  return /\.(xlsx|xls|csv)$/i.test(n) || /\bexcel\b/i.test(n) || /\bspreadsheet\b/i.test(n);
}

/**
 * 是否应按「电子表格」走 xlsx→PDF 预览（URL 扩展名或 AI 返回的 doc_type 线索）。
 */
export function isSpreadsheetAttachmentUrl(
  url: string | null | undefined,
  docType?: string | null
): boolean {
  if (docType && String(docType).trim()) {
    const u = String(docType).toUpperCase();
    if (
      u.includes('SPREADSHEET') ||
      u.includes('XLSX') ||
      u.includes('XLS') ||
      u.includes('EXCEL') ||
      u.includes('CSV')
    ) {
      return true;
    }
  }
  if (!url) return false;
  const base = url.split(/[#?]/)[0];
  const ext = base.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'xlsx' || ext === 'xls' || ext === 'csv';
}

function clipCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return s.length > MAX_CELL_STRLEN ? `${s.slice(0, MAX_CELL_STRLEN - 1)}…` : s;
}

export async function buildSpreadsheetPreviewPdf(arrayBuffer: ArrayBuffer): Promise<Uint8Array> {
  const wb = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
    // Improve DBCS / legacy .xls string decoding when codepage metadata exists
    codepage: 65001,
  });
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const cjkFontOk = await ensureJsPDFCjkFont(doc);
  const tableFont = cjkFontOk ? JSPDF_CJK_FONT_ID : 'helvetica';
  if (!cjkFontOk) {
    doc.setFont('helvetica', 'normal');
  }

  const allNames = wb.SheetNames ?? [];
  const sheetNames = allNames.slice(0, MAX_SHEETS_CAP);
  const omittedSheets = Math.max(0, allNames.length - sheetNames.length);

  if (sheetNames.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.setFont(tableFont, 'normal');
    doc.text('(Empty workbook)', 10, 20);
    return new Uint8Array(doc.output('arraybuffer'));
  }

  const margin = { left: 10, right: 10, top: 16, bottom: 12 };
  let firstSheetInPdf = true;

  for (let si = 0; si < sheetNames.length; si++) {
    const sheetName = sheetNames[si];
    const sheet = wb.Sheets[sheetName];

    if (!firstSheetInPdf) {
      doc.addPage();
    }
    firstSheetInPdf = false;

    if (!sheet) {
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.setFont(tableFont, 'normal');
      doc.text(`Sheet ${si + 1}/${sheetNames.length}: (unavailable)`, margin.left, 14);
      continue;
    }

    const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null | undefined)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as (string | number | boolean | null | undefined)[][];

    if (raw.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(44, 62, 80);
      doc.setFont(tableFont, 'normal');
      doc.text(`Sheet ${si + 1}/${sheetNames.length}: ${String(sheetName).slice(0, 100)}`, margin.left, 14);
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('(Empty sheet)', margin.left, 22);
      continue;
    }

    const rows = raw.slice(0, MAX_ROWS_PER_SHEET).map((r) =>
      r.slice(0, MAX_COLS).map((c) => clipCell(c)),
    );

    const wide = rows.reduce((m, r) => Math.max(m, r.length), 0) > 14;

    autoTable(doc, {
      body: rows,
      margin,
      styles: {
        font: tableFont,
        fontStyle: 'normal',
        fontSize: wide ? 5 : 6,
        cellPadding: 0.85,
        overflow: 'linebreak',
        valign: 'top',
      },
      theme: 'grid',
      tableWidth: 'auto',
      pageBreak: 'auto',
      rowPageBreak: 'auto',
      horizontalPageBreak: wide,
      horizontalPageBreakBehaviour: 'immediately',
      willDrawPage: (data) => {
        const d = data.doc;
        d.setFont(tableFont, 'normal');
        d.setFontSize(8);
        d.setTextColor(44, 62, 80);
        const label = `Sheet ${si + 1}/${sheetNames.length}: ${String(sheetName).slice(0, 85)}`;
        d.text(label, margin.left, 9);
      },
    });
  }

  if (omittedSheets > 0) {
    doc.addPage();
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.setFont(tableFont, 'normal');
    doc.text(
      `${omittedSheets} more sheet(s) not included (preview limit: ${MAX_SHEETS_CAP} sheets).`,
      margin.left,
      14
    );
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
