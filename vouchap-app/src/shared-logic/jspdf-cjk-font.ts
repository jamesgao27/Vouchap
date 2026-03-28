/**
 * jsPDF built-in fonts only cover Latin-1; CJK text requires an embedded font (Identity-H).
 * Loads Noto Sans CJK SC Regular once (network), caches base64 in memory for the session.
 */
import type { jsPDF } from 'jspdf';
import { Buffer } from 'buffer';

const VFS_FILENAME = 'NotoSansCJKsc-Regular.otf';
export const JSPDF_CJK_FONT_ID = 'NotoSansSC';

const FONT_URLS = [
  'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
];

let cachedBase64: string | null = null;
let inflight: Promise<string | null> | null = null;

function arrayBufferToBase64(ab: ArrayBuffer): string {
  return Buffer.from(new Uint8Array(ab)).toString('base64');
}

async function fetchFontOnce(): Promise<string | null> {
  for (const url of FONT_URLS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 180000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      if (ab.byteLength < 50_000) continue;
      return arrayBufferToBase64(ab);
    } catch {
      continue;
    }
  }
  return null;
}

async function getFontBase64(): Promise<string | null> {
  if (cachedBase64) return cachedBase64;
  if (!inflight) {
    inflight = fetchFontOnce().then((b64) => {
      inflight = null;
      if (b64) cachedBase64 = b64;
      return b64;
    });
  }
  return inflight;
}

/**
 * Registers Noto Sans CJK SC on this jsPDF instance. Safe to call for every new document.
 * @returns whether CJK font is active (false → caller should keep Helvetica; CJK may still look wrong)
 */
export async function ensureJsPDFCjkFont(doc: jsPDF): Promise<boolean> {
  try {
    if (typeof doc.existsFileInVFS === 'function' && doc.existsFileInVFS(VFS_FILENAME)) {
      doc.setFont(JSPDF_CJK_FONT_ID, 'normal');
      return true;
    }
    const b64 = await getFontBase64();
    if (!b64) return false;
    doc.addFileToVFS(VFS_FILENAME, b64);
    doc.addFont(VFS_FILENAME, JSPDF_CJK_FONT_ID, 'normal', undefined, 'Identity-H');
    doc.setFont(JSPDF_CJK_FONT_ID, 'normal');
    return true;
  } catch {
    return false;
  }
}
