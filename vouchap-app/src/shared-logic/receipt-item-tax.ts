/**
 * Expense receipt: per–line-item taxes from crm.tax_rate_standard (built-in fallback when CRM empty for jurisdiction).
 * POS meaning: public.entity_pos_tax_code (global catalog by receipts.merchant_entity_id) first, then crm.tax_pos_code_rule.
 * Reconcile sum(lines) vs receipts.tax. Ticket total tax stays as stored on receipt.tax.
 *
 * Per-line **tax class** for rate lookup comes from POS/entity rules when present, otherwise **STANDARD_TAXABLE**.
 * The 1:N split per item is receipt_item_taxes (one row per tax_kind_code for that item).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import Decimal from 'decimal.js';
import { showToast } from './toast';
import { US_COMBINED_SALES_TAX_BUILTIN } from './us-combined-sales-tax-builtin';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 28 });

export const DEFAULT_TAX_CLASS = 'STANDARD_TAXABLE';

/** Allowed supply-class labels from POS rules / CRM (matches crm.tax_rate_standard.tax_class_code dimension). */
const RECEIPT_ITEM_TAX_CLASS_CODES = new Set(['STANDARD_TAXABLE', 'EXEMPT', 'ZERO_RATED']);

const TAX_CLASS_ALIASES: Record<string, string> = {
    TAX_EXEMPT: 'EXEMPT',
    'TAX-EXEMPT': 'EXEMPT',
    TAXFREE: 'EXEMPT',
    'TAX-FREE': 'EXEMPT',
    NON_TAXABLE: 'EXEMPT',
    'NON-TAXABLE': 'EXEMPT',
    ZERO_RATED_SUPPLY: 'ZERO_RATED',
    ZR: 'ZERO_RATED',
    STANDARD: 'STANDARD_TAXABLE',
    TAXABLE: 'STANDARD_TAXABLE',
};

export function normalizeReceiptItemTaxClassCode(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  let u = String(raw).trim().toUpperCase().replace(/\s+/g, '_');
  u = TAX_CLASS_ALIASES[u] ?? u;
  return RECEIPT_ITEM_TAX_CLASS_CODES.has(u) ? u : null;
}

/** Payee string when entity is missing: AI payload often had supplierName before entity was created. */
export function extractSupplierNameFromProcessedBy(pb: unknown): string {
  if (pb == null) return '';
  const fromObject = (o: Record<string, unknown>): string => {
    for (const k of ['supplierName', 'merchantName', 'storeName'] as const) {
      const s = o[k];
      if (s != null && String(s).trim() !== '') return String(s).trim();
    }
    const nested = o.parsedResult;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = fromObject(nested as Record<string, unknown>);
      if (inner) return inner;
    }
    return '';
  };
  try {
    const o = typeof pb === 'string' ? JSON.parse(pb) : pb;
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const s = fromObject(o as Record<string, unknown>);
      if (s) return s;
    }
  } catch {
    /* not JSON */
  }
  if (typeof pb === 'string') {
    for (const key of ['supplierName', 'merchantName', 'storeName']) {
      const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'i');
      const m = pb.match(re);
      if (m?.[1]?.trim()) return m[1].trim();
    }
  }
  return '';
}

/**
 * POS rules match merchant_pattern to a normalized string (e.g. %WALMART%).
 * Linked entity.name may be user-edited or wrong; always include supplier hints from processed_by.
 */
export function mergeMerchantHintsForPosRules(primary: string, fromProcessedBy: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const raw of [primary, fromProcessedBy]) {
    const s = (raw ?? '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(s);
  }
  return parts.join(' ');
}

/** Max |receipt.tax − Σ line taxes| to absorb via penny-level tail allocation onto one taxable line. */
const RECONCILE_ROUNDING_EPS = new Decimal('0.02');

type PosTaxCodeRuleRow = {
  id: string;
  country_code: string;
  region_code: string;
  merchant_pattern: string;
  pos_tax_code: string;
  maps_to_tax_class_code: string;
  /** If set, only these tax_kind_code values apply to the line (CRM). */
  included_tax_kind_codes: string[] | null;
  priority: number;
  effective_from: string;
  effective_to: string | null;
};

function ruleEffectiveOnRow(effectiveFrom: string, effectiveTo: string | null | undefined, asOf: string): boolean {
  const d = asOf.slice(0, 10);
  if (cmpIsoDate(effectiveFrom, d) > 0) return false;
  if (effectiveTo && cmpIsoDate(effectiveTo, d) < 0) return false;
  return true;
}

/**
 * ILIKE-style %foo%bar% against merchant display name.
 * Alphanumeric-only segments so "Wal-Mart" still matches %WALMART%.
 */
function merchantMatchesPattern(merchantName: string, pattern: string): boolean {
  const p = (pattern ?? '%').trim();
  if (!p || p === '%') return true;
  const m = (merchantName ?? '').trim();
  if (!m) return false;
  const normM = m.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normM) return false;
  const parts = p
    .split('%')
    .map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter((s) => s.length > 0);
  if (parts.length === 0) return true;
  return parts.every((part) => normM.includes(part));
}

type EntityPosTaxCodeRow = {
  id: string;
  merchant_entity_id: string;
  country_code: string;
  jurisdiction_region: string;
  pos_tax_code: string;
  maps_to_tax_class_code: string;
  included_tax_kind_codes: string[] | null;
  priority: number;
  effective_from: string;
  effective_to: string | null;
};

function resolveEntityPosTaxCode(
  rules: EntityPosTaxCodeRow[],
  region: string,
  posCodeRaw: string | null | undefined,
  asOf: string,
): { taxClass: string | null; includedTaxKinds: string[] | null; ruleId: string | null } {
  let code = (posCodeRaw ?? '').trim().toUpperCase();
  if (!code) return { taxClass: null, includedTaxKinds: null, ruleId: null };
  const lettersOnly = code.replace(/[^A-Z]/g, '');
  if (lettersOnly.length === 1) code = lettersOnly;
  const reg = (region ?? '').trim().toUpperCase();
  const applicable = rules.filter(
    (r) =>
      ruleEffectiveOnRow(r.effective_from, r.effective_to, asOf) &&
      (r.pos_tax_code || '').trim().toUpperCase() === code &&
      ((r.jurisdiction_region || '').trim().toUpperCase() === reg ||
        (r.jurisdiction_region || '').trim() === ''),
  );
  if (applicable.length === 0) return { taxClass: null, includedTaxKinds: null, ruleId: null };
  applicable.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ar = (a.jurisdiction_region || '').trim() !== '' ? 0 : 1;
    const br = (b.jurisdiction_region || '').trim() !== '' ? 0 : 1;
    if (ar !== br) return ar - br;
    return 0;
  });
  const row = applicable[0];
  const taxClass = normalizeReceiptItemTaxClassCode(row.maps_to_tax_class_code) ?? null;
  const rawKinds = row.included_tax_kind_codes;
  if (!rawKinds || !Array.isArray(rawKinds) || rawKinds.length === 0) {
    return { taxClass, includedTaxKinds: null, ruleId: row.id };
  }
  const includedTaxKinds = rawKinds
    .map((k) => String(k).trim().toUpperCase())
    .filter((k) => k.length > 0);
  return {
    taxClass,
    includedTaxKinds: includedTaxKinds.length > 0 ? includedTaxKinds : null,
    ruleId: row.id,
  };
}

async function fetchEntityPosTaxCodesForMerchantEntity(
  supabase: SupabaseClient,
  merchantEntityId: string,
  country: string,
): Promise<EntityPosTaxCodeRow[]> {
  const c = (country || '').trim().toUpperCase();
  if (!c || !merchantEntityId) return [];
  const { data, error } = await supabase
    .from('entity_pos_tax_code')
    .select(
      'id, merchant_entity_id, country_code, jurisdiction_region, pos_tax_code, maps_to_tax_class_code, included_tax_kind_codes, priority, effective_from, effective_to',
    )
    .eq('merchant_entity_id', merchantEntityId)
    .eq('country_code', c);
  if (error) {
    console.warn('[receipt-item-tax] public.entity_pos_tax_code:', error.message);
    return [];
  }
  return (data || []) as EntityPosTaxCodeRow[];
}

function resolvePosTaxCodeRule(
  rules: PosTaxCodeRuleRow[],
  region: string,
  merchantName: string,
  posCodeRaw: string | null | undefined,
  asOf: string,
): { taxClass: string | null; includedTaxKinds: string[] | null } {
  let code = (posCodeRaw ?? '').trim().toUpperCase();
  if (!code) return { taxClass: null, includedTaxKinds: null };
  /** Single-letter Walmart-style markers are sometimes padded (e.g. "D " / "N0"). */
  const lettersOnly = code.replace(/[^A-Z]/g, '');
  if (lettersOnly.length === 1) code = lettersOnly;
  const reg = (region ?? '').trim().toUpperCase();
  const applicable = rules.filter(
    (r) =>
      ruleEffectiveOnRow(r.effective_from, r.effective_to, asOf) &&
      (r.pos_tax_code || '').trim().toUpperCase() === code &&
      ((r.region_code || '').trim().toUpperCase() === reg || (r.region_code || '').trim() === '') &&
      merchantMatchesPattern(merchantName, r.merchant_pattern || '%'),
  );
  if (applicable.length === 0) return { taxClass: null, includedTaxKinds: null };
  applicable.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ar = (a.region_code || '').trim() !== '' ? 0 : 1;
    const br = (b.region_code || '').trim() !== '' ? 0 : 1;
    if (ar !== br) return ar - br;
    return 0;
  });
  const row = applicable[0];
  const taxClass = normalizeReceiptItemTaxClassCode(row.maps_to_tax_class_code) ?? null;
  const rawKinds = row.included_tax_kind_codes;
  if (!rawKinds || !Array.isArray(rawKinds) || rawKinds.length === 0) {
    return { taxClass, includedTaxKinds: null };
  }
  const includedTaxKinds = rawKinds
    .map((k) => String(k).trim().toUpperCase())
    .filter((k) => k.length > 0);
  return {
    taxClass,
    includedTaxKinds: includedTaxKinds.length > 0 ? includedTaxKinds : null,
  };
}

function pickPosTaxClassFromRules(
  rules: PosTaxCodeRuleRow[],
  region: string,
  merchantName: string,
  posCodeRaw: string | null | undefined,
  asOf: string,
): string | null {
  return resolvePosTaxCodeRule(rules, region, merchantName, posCodeRaw, asOf).taxClass;
}

/** Shared-catalog POS rows (merchant_entity_id) win over CRM pattern rules. */
function resolveLinePosTaxResolution(
  catalogRules: EntityPosTaxCodeRow[],
  crmRules: PosTaxCodeRuleRow[],
  merchantEntityId: string | null | undefined,
  region: string,
  merchantName: string,
  posCodeRaw: string | null | undefined,
  asOf: string,
): {
  taxClass: string | null;
  includedTaxKinds: string[] | null;
  entityPosTaxCodeId: string | null;
} {
  if (merchantEntityId) {
    const er = resolveEntityPosTaxCode(catalogRules, region, posCodeRaw, asOf);
    if (er.taxClass) {
      return {
        taxClass: er.taxClass,
        includedTaxKinds: er.includedTaxKinds,
        entityPosTaxCodeId: er.ruleId,
      };
    }
  }
  const cr = resolvePosTaxCodeRule(crmRules, region, merchantName, posCodeRaw, asOf);
  return {
    taxClass: cr.taxClass,
    includedTaxKinds: cr.includedTaxKinds,
    entityPosTaxCodeId: null,
  };
}

async function fetchPosTaxCodeRulesForCountry(
  supabase: SupabaseClient,
  country: string,
): Promise<PosTaxCodeRuleRow[]> {
  const c = (country || '').trim().toUpperCase();
  if (!c) return [];
  const { data, error } = await supabase
    .schema('crm')
    .from('tax_pos_code_rule')
    .select(
      'id, country_code, region_code, merchant_pattern, pos_tax_code, maps_to_tax_class_code, included_tax_kind_codes, priority, effective_from, effective_to',
    )
    .eq('country_code', c);
  if (error) {
    console.warn('[receipt-item-tax] crm.tax_pos_code_rule:', error.message);
    return [];
  }
  return (data || []) as PosTaxCodeRuleRow[];
}

/** Above this vs max(tax,1) triggers async second pass with alternate regions. */
const RECALC_VARIANCE_MULT = 0.25;

export type TaxReconciliationStatus =
  | 'matched'
  | 'within_tolerance'
  | 'variance'
  | 'pending_recalc'
  | 'skipped';

type RateRowSource = 'crm_standard' | 'builtin';

export type TaxCatalogRow = {
  /** CRM uuid; null for in-memory builtin fallback rows */
  id: string | null;
  source: RateRowSource;
  country_code: string;
  region_code: string;
  tax_class_code: string;
  tax_kind_code: string;
  rate: number;
  price_basis: string;
  effective_from: string;
  effective_to: string | null;
};

type BuiltinRateLine = {
  tax_kind_code: string;
  rate: number;
  price_basis: 'exclusive' | 'inclusive';
};

function cmpIsoDate(a: string | null | undefined, b: string): number {
  const ad = (a || '').slice(0, 10);
  const bd = b.slice(0, 10);
  if (ad < bd) return -1;
  if (ad > bd) return 1;
  return 0;
}

/** ISO 3166-2:CA province/territory codes used in crm.tax_rate_standard.region_code */
const CA_REGION_CODES = new Set([
  'ON',
  'BC',
  'AB',
  'SK',
  'MB',
  'QC',
  'NL',
  'NS',
  'PE',
  'NB',
  'NT',
  'NU',
  'YT',
]);

/**
 * Maps full English/French province names (as models often return) to 2-letter codes.
 * Without this, pickRatesForRegion cannot match CRM rows (e.g. MB GST+RST): GST may still
 * win via CA '' fallback (score >= 3) while RST-only-on-MB rows score 2 and are dropped → one tax kind + big variance.
 */
export function normalizeCanadianRegionCode(raw: string | null | undefined): string {
  const t = (raw || '').trim();
  if (!t) return '';
  const u = t.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (u.length === 2 && CA_REGION_CODES.has(u)) return u;
  /** Common aliases; keys are normalized uppercase, no periods */
  const syn: Record<string, string> = {
    ONTARIO: 'ON',
    ONT: 'ON',
    'BRITISH COLUMBIA': 'BC',
    'COLOMBIE BRITANNIQUE': 'BC',
    ALBERTA: 'AB',
    ALTA: 'AB',
    MANITOBA: 'MB',
    MAN: 'MB',
    SASKATCHEWAN: 'SK',
    SASK: 'SK',
    QUEBEC: 'QC',
    QUÉBEC: 'QC',
    'NEWFOUNDLAND AND LABRADOR': 'NL',
    'NEWFOUNDLAND LABRADOR': 'NL',
    NEWFOUNDLAND: 'NL',
    LABRADOR: 'NL',
    'NOVA SCOTIA': 'NS',
    'NOUVELLE ÉCOSSE': 'NS',
    'PRINCE EDWARD ISLAND': 'PE',
    'ÎLE DU PRINCE ÉDOUARD': 'PE',
    PEI: 'PE',
    'NEW BRUNSWICK': 'NB',
    'NOUVEAU BRUNSWICK': 'NB',
    NUNAVUT: 'NU',
    'NORTHWEST TERRITORIES': 'NT',
    YUKON: 'YT',
  };
  const mapped = syn[u];
  if (mapped) return mapped;
  if (u.length === 2) return u;
  return '';
}

/** Provinces that use a single HST line (not GST+PST/RST split on typical receipts). */
const CA_HST_SINGLE_LINE_REGIONS = new Set(['ON', 'NB', 'NS', 'NL', 'PE']);

/**
 * Infer CA province from OCR/entity text when the model picked the wrong taxJurisdictionRegion
 * (e.g. NS 14% HST instead of MB GST+RST).
 */
export function inferCanadianRegionFromReceiptSignals(text: string | null | undefined): string | null {
  const t = (text || '').toUpperCase();
  if (!t.trim()) return null;
  if (/\bWINNIPEG\b/.test(t) || /\bMANITOBA\b/.test(t) || /\bMB\b/.test(t)) {
    return 'MB';
  }
  // Manitoba postal FSAs start with R (e.g. R3C 1A1)
  if (/\bR\d[A-Z]\s*\d[A-Z]\d\b/i.test(text || '')) return 'MB';
  if (/\bVANCOUVER\b/.test(t) || /\bBRITISH\s+COLUMBIA\b/.test(t) || /\bBC\b/.test(t)) return 'BC';
  if (/\bCALGARY\b|\bEDMONTON\b|\bALBERTA\b/.test(t)) return 'AB';
  return null;
}

/** Receipt text shows separate GST and PST/RST (not HST-only), common for MB/BC/SK. */
export function receiptTextSuggestsGstPlusProvincialNotHst(text: string | null | undefined): boolean {
  const u = (text || '').toUpperCase();
  return /\bGST\b/.test(u) && /\b(PST|RST)\b/.test(u);
}

/** Normalize receipt DATE to YYYY-MM-DD for CRM effective_from / effective_to comparisons. */
function receiptTaxAsOfDate(raw: unknown): string {
  if (raw == null || raw === '') return new Date().toISOString().slice(0, 10);
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

type CrmRateRaw = Omit<TaxCatalogRow, 'source'> & { id: string };

/** Rows valid on asOf; one row per (region_code, tax_kind_code) with latest effective_from. */
function narrowCrmRowsForAsOf(raw: CrmRateRaw[], asOf: string): CrmRateRaw[] {
  const d = asOf.slice(0, 10);
  const applicable = raw.filter(
    (r) =>
      cmpIsoDate(r.effective_from, d) <= 0 &&
      (!r.effective_to || cmpIsoDate(r.effective_to, d) >= 0),
  );
  const pool = applicable.length > 0 ? applicable : raw;
  const byKey = new Map<string, CrmRateRaw>();
  const sorted = [...pool].sort((a, b) => cmpIsoDate(b.effective_from, a.effective_from));
  for (const r of sorted) {
    const k = `${r.region_code}\t${r.tax_kind_code}`;
    if (!byKey.has(k)) byKey.set(k, r);
  }
  return [...byKey.values()];
}

/** STANDARD_TAXABLE built-ins (aligned with crm.tax_rate_standard seed); used for cache backfill. */
function builtinStandardTaxableLines(countryCode: string, regionCode: string): BuiltinRateLine[] {
  if (countryCode === 'US') {
    const r = (regionCode || '').toUpperCase();
    const rate =
      US_COMBINED_SALES_TAX_BUILTIN[r] ?? US_COMBINED_SALES_TAX_BUILTIN[''];
    if (rate == null) return [];
    return [{ tax_kind_code: 'COMBINED_SALES_TAX', rate, price_basis: 'exclusive' }];
  }
  if (countryCode !== 'CA') return [];

  const r = (regionCode || '').toUpperCase();
  if (r === 'ON') {
    return [{ tax_kind_code: 'HST', rate: 0.13, price_basis: 'exclusive' }];
  }
  if (['NB', 'NL', 'PE'].includes(r)) {
    return [{ tax_kind_code: 'HST', rate: 0.15, price_basis: 'exclusive' }];
  }
  if (r === 'NS') {
    return [{ tax_kind_code: 'HST', rate: 0.14, price_basis: 'exclusive' }];
  }
  if (r === 'BC') {
    return [
      { tax_kind_code: 'GST', rate: 0.05, price_basis: 'exclusive' },
      { tax_kind_code: 'PST', rate: 0.07, price_basis: 'exclusive' },
    ];
  }
  if (r === 'MB') {
    return [
      { tax_kind_code: 'GST', rate: 0.05, price_basis: 'exclusive' },
      { tax_kind_code: 'RST', rate: 0.07, price_basis: 'exclusive' },
    ];
  }
  if (r === 'SK') {
    return [
      { tax_kind_code: 'GST', rate: 0.05, price_basis: 'exclusive' },
      { tax_kind_code: 'PST', rate: 0.06, price_basis: 'exclusive' },
    ];
  }
  if (r === 'QC') {
    return [
      { tax_kind_code: 'GST', rate: 0.05, price_basis: 'exclusive' },
      { tax_kind_code: 'QST', rate: 0.09975, price_basis: 'exclusive' },
    ];
  }
  if (r === 'AB' || r === 'NT' || r === 'NU' || r === 'YT') {
    return [{ tax_kind_code: 'GST', rate: 0.05, price_basis: 'exclusive' }];
  }
  return [{ tax_kind_code: 'GST', rate: 0.05, price_basis: 'exclusive' }];
}

/**
 * In-memory standard rates when DB has no row (copied into space cache on demand).
 * EXEMPT / ZERO_RATED use the same tax_kind structure as STANDARD for the jurisdiction, all rates 0
 * (matches crm.tax_rate_standard mirror rows).
 */
export function builtinStandardRates(
  countryCode: string,
  regionCode: string,
  taxClassCode: string,
): BuiltinRateLine[] {
  if (taxClassCode === 'EXEMPT' || taxClassCode === 'ZERO_RATED') {
    return builtinStandardTaxableLines(countryCode, regionCode).map((l) => ({
      ...l,
      rate: 0,
    }));
  }
  return builtinStandardTaxableLines(countryCode, regionCode);
}

function inferDefaultJurisdiction(currency?: string | null): { country: string; region: string } {
  const c = (currency || 'USD').toUpperCase();
  if (c === 'CAD') return { country: 'CA', region: 'ON' };
  if (c === 'USD') return { country: 'US', region: '' };
  return { country: '', region: '' };
}

/**
 * CRM stores one set of zero-rate rows under EXEMPT (mirrored from STANDARD). ZERO_RATED lines use the same rows.
 */
function crmTaxClassForStandardLookup(taxClass: string): string {
  if (taxClass === 'ZERO_RATED') return 'EXEMPT';
  return taxClass;
}

async function queryCrmStandardRates(
  supabase: SupabaseClient,
  country: string,
  taxClass: string,
  asOf: string,
): Promise<TaxCatalogRow[]> {
  const crmClass = crmTaxClassForStandardLookup(taxClass);
  const { data, error } = await supabase
    .schema('crm')
    .from('tax_rate_standard')
    .select(
      'id, country_code, region_code, tax_class_code, tax_kind_code, rate, price_basis, effective_from, effective_to',
    )
    .eq('country_code', country)
    .eq('tax_class_code', crmClass);

  if (error) {
    console.warn(
      '[receipt-item-tax] crm.tax_rate_standard failed. Expose schema "crm" in Supabase API settings?',
      error.message,
    );
    return [];
  }
  const raw = (data || []) as CrmRateRaw[];
  const narrowed = narrowCrmRowsForAsOf(raw, asOf);
  const d = asOf.slice(0, 10);
  return narrowed
    .filter((row) => !row.effective_to || cmpIsoDate(row.effective_to, d) >= 0)
    .map((row) => ({
      ...row,
      source: 'crm_standard' as const,
    }));
}

function builtinLinesToTaxCatalogRows(
  country: string,
  region: string,
  taxClass: string,
  asOf: string,
): TaxCatalogRow[] {
  const lines = builtinStandardRates(country, region, taxClass);
  return lines.map((line) => ({
    id: null,
    source: 'builtin' as const,
    country_code: country,
    region_code: region || '',
    tax_class_code: taxClass,
    tax_kind_code: line.tax_kind_code,
    rate: line.rate,
    price_basis: line.price_basis,
    effective_from: '2000-01-01',
    effective_to: null,
  }));
}

function pickRatesForRegion(rows: TaxCatalogRow[], region: string): Map<string, TaxCatalogRow> {
  const reg = (region || '').trim().toUpperCase();
  /**
   * When jurisdiction province/state is known, only use rates for that code — not another
   * province's rows or CA '' federal GST alone when MB needs GST+RST, etc.
   */
  let scoped = reg
    ? rows.filter((r) => (r.region_code || '').trim().toUpperCase() === reg)
    : rows;
  /** If no rows for exact province/state, fall back to country-level CRM rows (region_code ''). */
  if (reg && scoped.length === 0) {
    scoped = rows.filter((r) => (r.region_code || '').trim().toUpperCase() === '');
  }
  const byKind = new Map<string, TaxCatalogRow>();

  const score = (row: TaxCatalogRow): number => {
    let s = 0;
    if (row.source === 'crm_standard') s += 2;
    else if (row.source === 'builtin') s += 1;
    const rr = (row.region_code || '').toUpperCase();
    if (reg && rr === reg) s += 3;
    if (!reg && rr === '') s += 2;
    if (reg && rr === '') s += 1;
    return s;
  };

  const kinds = new Set(scoped.map((r) => r.tax_kind_code));
  for (const kind of kinds) {
    const candidates = scoped.filter((r) => r.tax_kind_code === kind);
    let best: TaxCatalogRow | null = null;
    let bestScore = -1;
    for (const c of candidates) {
      const sc = score(c);
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    }
    if (best && bestScore >= 3) byKind.set(kind, best);
  }
  return byKind;
}

async function resolveRateRows(
  supabase: SupabaseClient,
  country: string,
  region: string,
  taxClass: string,
  asOf: string,
): Promise<Map<string, TaxCatalogRow>> {
  const crmRows = await queryCrmStandardRates(supabase, country, taxClass, asOf);
  let picked = pickRatesForRegion(crmRows, region);
  if (picked.size === 0 && country) {
    const builtins = builtinLinesToTaxCatalogRows(country, region, taxClass, asOf);
    picked = pickRatesForRegion([...crmRows, ...builtins], region);
  }
  return picked;
}

function finalizeReconciliation(
  receiptTaxRaw: number | null | undefined,
  finalSum: Decimal,
): {
  status: TaxReconciliationStatus;
  variance: number;
  taxItemsSum: number;
  auditRequired: boolean;
  auditComment: string | null;
} {
  const receiptTax = new Decimal(
    receiptTaxRaw == null || Number.isNaN(Number(receiptTaxRaw)) ? 0 : String(receiptTaxRaw),
  );
  const v = receiptTax.minus(finalSum);
  if (receiptTax.isZero() && finalSum.isZero()) {
    return { status: 'skipped', variance: 0, taxItemsSum: 0, auditRequired: false, auditComment: null };
  }
  if (v.abs().lte(new Decimal('0.0001'))) {
    return {
      status: 'matched',
      variance: 0,
      taxItemsSum: receiptTax.toDecimalPlaces(4).toNumber(),
      auditRequired: false,
      auditComment: null,
    };
  }
  const comment = `Line tax sum ${finalSum.toFixed(2)} vs receipt ${receiptTax.toFixed(2)} (diff ${v.toFixed(2)}). Check tax_jurisdiction, pos_tax_code, and entity or CRM POS rules.`;
  return {
    status: 'variance',
    variance: v.toDecimalPlaces(4).toNumber(),
    taxItemsSum: finalSum.toDecimalPlaces(4).toNumber(),
    auditRequired: true,
    auditComment: comment,
  };
}

export type ApplyReceiptItemTaxOptions = {
  /** If true, only try alternate regions (async second pass). */
  recalcPass?: boolean;
  regionOverride?: string;
  /** If true, skip greedy fit of POS-coded lines to receipt.tax (tests / forced path). */
  skipReceiptTaxFit?: boolean;
};

/** Resolved platform rate rows for a line (from DB only — no category-name heuristics). */
export async function getApplicableTaxRules(
  supabase: SupabaseClient,
  params: {
    country: string;
    region: string;
    asOf: string;
    merchantEntityId?: string | null;
    posTaxCode?: string | null;
    merchantName?: string | null;
  },
): Promise<{ taxClassCode: string; rateRows: TaxCatalogRow[] }> {
  const [posRules, catalogRules] = await Promise.all([
    fetchPosTaxCodeRulesForCountry(supabase, params.country),
    params.merchantEntityId
      ? fetchEntityPosTaxCodesForMerchantEntity(supabase, params.merchantEntityId, params.country)
      : Promise.resolve([] as EntityPosTaxCodeRow[]),
  ]);
  const posRes = resolveLinePosTaxResolution(
    catalogRules,
    posRules,
    params.merchantEntityId ?? null,
    params.region,
    params.merchantName ?? '',
    params.posTaxCode,
    params.asOf,
  );
  const taxClass: string = posRes.taxClass ?? DEFAULT_TAX_CLASS;
  const rateMap = await resolveRateRows(supabase, params.country, params.region, taxClass, params.asOf);
  let rows = [...rateMap.values()];
  if (posRes.includedTaxKinds && posRes.includedTaxKinds.length > 0) {
    const allow = new Set(posRes.includedTaxKinds);
    rows = rows.filter((row) => allow.has((row.tax_kind_code || '').toUpperCase()));
  }
  return { taxClassCode: taxClass, rateRows: rows };
}

type DraftTaxLine = {
  receipt_item_id: string;
  tax_kind_code: string;
  amount: Decimal;
  rate_applied: number;
  taxable_base: number;
  crm_tax_rate_standard_id: string | null;
  entity_pos_tax_code_id: string | null;
};

type ReceiptItemRow = {
  id: string;
  price: unknown;
  category_id?: string;
  pos_tax_code?: string | null;
};

type LineMeta = {
  itemId: string;
  posCode: string | null;
  posRuleMatched: boolean;
  taxClass: string;
};

const POS_CLASS_FIT_TRIAD: Array<'STANDARD_TAXABLE' | 'ZERO_RATED' | 'EXEMPT'> = [
  'STANDARD_TAXABLE',
  'ZERO_RATED',
  'EXEMPT',
];

const MAX_POS_LINES_FOR_RECEIPT_TAX_FIT = 28;

async function buildDraftsFromTaxClassMap(
  supabase: SupabaseClient,
  country: string,
  region: string,
  asOf: string,
  items: ReceiptItemRow[],
  taxClassByItemId: Map<string, string>,
  rateCache?: Map<string, Map<string, TaxCatalogRow>>,
  taxKindFilterByItemId?: Map<string, Set<string> | null>,
  entityPosTaxCodeByItemId?: Map<string, string | null>,
): Promise<DraftTaxLine[]> {
  const cache = rateCache ?? new Map<string, Map<string, TaxCatalogRow>>();
  const drafts: DraftTaxLine[] = [];
  for (const item of items) {
    const id = item.id as string;
    const taxClass = taxClassByItemId.get(id);
    if (!taxClass) continue;
    let rateMap = cache.get(taxClass);
    if (!rateMap) {
      rateMap = await resolveRateRows(supabase, country, region, taxClass, asOf);
      cache.set(taxClass, rateMap);
    }
    const kindFilter = taxKindFilterByItemId?.get(id);
    const lineBaseDec = new Decimal(String(item.price ?? 0));
    const lineBaseNum = lineBaseDec.toDecimalPlaces(4).toNumber();
    if (rateMap.size === 0 && lineBaseDec.gt(0)) {
      console.warn('[receipt-item-tax] No CRM/builtin rate rows for line (check crm schema, jurisdiction, tax_class)', {
        receiptItemId: id,
        taxClass,
        country,
        region,
      });
    }
    for (const [, row] of rateMap) {
      if (kindFilter && kindFilter.size > 0) {
        const k = (row.tax_kind_code || '').trim().toUpperCase();
        if (!kindFilter.has(k)) continue;
      }
      let taxAmt: Decimal;
      if (row.price_basis === 'inclusive') {
        if (rateMap.size !== 1) continue;
        const rdec = new Decimal(String(row.rate));
        taxAmt = lineBaseDec.minus(lineBaseDec.div(rdec.plus(1)));
      } else {
        taxAmt = lineBaseDec.mul(new Decimal(String(row.rate)));
      }
      taxAmt = taxAmt.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      const rateZero = new Decimal(String(row.rate)).isZero();
      const isZeroRatedSupply = taxClass === 'EXEMPT' || taxClass === 'ZERO_RATED';
      /** Skip only redundant all-zero rows for taxable supplies; keep 0-amount rows for EXEMPT/ZERO (1:N tax kinds). */
      if (taxAmt.isZero() && rateZero && !isZeroRatedSupply) continue;

      drafts.push({
        receipt_item_id: id,
        tax_kind_code: row.tax_kind_code,
        amount: taxAmt,
        rate_applied: Number(row.rate),
        taxable_base: lineBaseNum,
        crm_tax_rate_standard_id: row.source === 'crm_standard' ? row.id : null,
        entity_pos_tax_code_id: entityPosTaxCodeByItemId?.get(id) ?? null,
      });
    }
  }
  return drafts;
}

/** Penny-level tail on one line so |Σ − receipt.tax| ≤ RECONCILE_ROUNDING_EPS. Mutates drafts. */
function applyPennyTailAllocation(
  drafts: DraftTaxLine[],
  items: ReceiptItemRow[],
  receiptTaxDec: Decimal,
): Decimal {
  let sumDec = drafts.reduce((s, d) => s.plus(d.amount), new Decimal(0));
  const diffRaw = receiptTaxDec.minus(sumDec);
  if (diffRaw.abs().lte(RECONCILE_ROUNDING_EPS) && !diffRaw.isZero()) {
    const itemTaxById = new Map<string, Decimal>();
    for (const d of drafts) {
      itemTaxById.set(
        d.receipt_item_id,
        (itemTaxById.get(d.receipt_item_id) ?? new Decimal(0)).plus(d.amount),
      );
    }
    let targetId: string | null = null;
    let bestAbsPrice = new Decimal(0);
    for (const item of items) {
      const iid = item.id as string;
      const lineTax = itemTaxById.get(iid) ?? new Decimal(0);
      const ap = new Decimal(String(item.price ?? 0)).abs();
      if (lineTax.gt(0) && (targetId === null || ap.gt(bestAbsPrice))) {
        targetId = iid;
        bestAbsPrice = ap;
      }
    }
    if (!targetId) {
      bestAbsPrice = new Decimal(0);
      for (const item of items) {
        const iid = item.id as string;
        const ap = new Decimal(String(item.price ?? 0)).abs();
        if (targetId === null || ap.gte(bestAbsPrice)) {
          targetId = iid;
          bestAbsPrice = ap;
        }
      }
    }
    if (targetId) {
      const firstIdx = drafts.findIndex((d) => d.receipt_item_id === targetId);
      if (firstIdx >= 0) {
        drafts[firstIdx] = {
          ...drafts[firstIdx],
          amount: drafts[firstIdx].amount.plus(diffRaw),
        };
        sumDec = drafts.reduce((s, d) => s.plus(d.amount), new Decimal(0));
      }
    }
  }
  return sumDec;
}

/** MB receipt may say PST; CRM uses RST for provincial portion. */
function canonicalTaxKindFromBreakdownKey(kind: string, region: string): string {
  const k = kind.trim().toUpperCase();
  const r = (region || '').trim().toUpperCase();
  if (r === 'MB' && k === 'PST') return 'RST';
  return k;
}

/** Parsed ticket tax_breakdown JSON: { GST: 0.4, RST: 0.28 } — amounts applied to the single line item. */
function parseReceiptTaxBreakdown(
  raw: unknown,
  region: string,
): { kind: string; amount: Decimal }[] | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: { kind: string; amount: Decimal }[] = [];
  for (const [key, val] of Object.entries(o)) {
    const kind = canonicalTaxKindFromBreakdownKey(key, region);
    if (val == null) continue;
    const n = typeof val === 'number' ? val : Number(String(val).replace(/,/g, ''));
    if (Number.isNaN(n)) continue;
    out.push({ kind, amount: new Decimal(String(n)) });
  }
  return out.length > 0 ? out : null;
}

/** Single synthetic line when OCR saved header totals but no line items — English UI label. */
const MERGED_LINE_ITEM_NAME = 'Receipt total (merged)';

/**
 * Exclusive taxable base for rule-engine: total_amount minus tax when both present (typical add-tax receipt).
 * If base would be negative or zero but total is positive and tax missing, use total as base.
 */
function mergedLineExclusiveBase(totalAmount: unknown, tax: unknown): number {
  const totalDec = new Decimal(totalAmount == null || totalAmount === '' ? 0 : String(totalAmount));
  const taxDec = new Decimal(tax == null || tax === '' ? 0 : String(tax));
  let base = totalDec.minus(taxDec);
  if (base.lt(0)) base = new Decimal(0);
  if (base.isZero() && totalDec.gt(0)) base = totalDec;
  return base.toDecimalPlaces(4).toNumber();
}

async function pickDefaultExpenseCategoryId(
  supabase: SupabaseClient,
  spaceId: string,
): Promise<string | null> {
  const tryNames = ['Other', 'Shopping', 'Meal', 'Food', 'Grocery'];
  for (const name of tryNames) {
    const { data } = await supabase
      .from('categories')
      .select('id')
      .eq('space_id', spaceId)
      .ilike('name', name)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data: def } = await supabase
    .from('categories')
    .select('id')
    .eq('space_id', spaceId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  if (def?.id) return def.id as string;
  const { data: anyRow } = await supabase
    .from('categories')
    .select('id')
    .eq('space_id', spaceId)
    .limit(1)
    .maybeSingle();
  return (anyRow?.id as string) ?? null;
}

/**
 * Inserts one receipt_item so tax logic can use the same path as a single-line receipt
 * (tax_breakdown, catalog rates, reconciliation).
 */
async function ensureSingleMergedLineItem(
  supabase: SupabaseClient,
  receiptId: string,
  spaceId: string,
  receipt: { total_amount?: unknown; tax?: unknown },
): Promise<boolean> {
  const categoryId = await pickDefaultExpenseCategoryId(supabase, spaceId);
  if (!categoryId) {
    console.warn('[receipt-item-tax] No category for merged line; cannot create receipt_item', {
      receiptId,
      spaceId,
    });
    return false;
  }
  const price = mergedLineExclusiveBase(receipt.total_amount, receipt.tax);
  const { error } = await supabase.from('receipt_items').insert({
    receipt_id: receiptId,
    name: MERGED_LINE_ITEM_NAME,
    category_id: categoryId,
    attribution_id: null,
    price,
    is_asset: false,
    pos_tax_code: null,
  });
  if (error) {
    console.warn('[receipt-item-tax] merged receipt_item insert failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Coordinate descent: only lines with pos_tax_code and no CRM rule can switch class
 * so that Σ line taxes matches receipt.tax (after penny tail). Used for self-learning labels.
 */
async function greedyFitPosLineClassesToReceiptTax(
  supabase: SupabaseClient,
  country: string,
  region: string,
  asOf: string,
  items: ReceiptItemRow[],
  lineMetas: LineMeta[],
  taxClassByItemId: Map<string, string>,
  taxKindFilterByItemId: Map<string, Set<string> | null>,
  entityPosTaxCodeByItemId: Map<string, string | null>,
  receiptTaxDec: Decimal,
): Promise<Map<string, string> | null> {
  const variableIds = lineMetas
    .filter((m) => m.posCode && !m.posRuleMatched)
    .map((m) => m.itemId);
  if (variableIds.length === 0 || variableIds.length > MAX_POS_LINES_FOR_RECEIPT_TAX_FIT) {
    if (variableIds.length > MAX_POS_LINES_FOR_RECEIPT_TAX_FIT) {
      console.warn('[receipt-item-tax] receipt tax fit skipped: too many variable POS lines', {
        count: variableIds.length,
      });
    }
    return null;
  }

  const rateCache = new Map<string, Map<string, TaxCatalogRow>>();

  async function sumAfterPenny(map: Map<string, string>): Promise<Decimal> {
    const drafts = await buildDraftsFromTaxClassMap(
      supabase,
      country,
      region,
      asOf,
      items,
      map,
      rateCache,
      taxKindFilterByItemId,
      entityPosTaxCodeByItemId,
    );
    applyPennyTailAllocation(drafts, items, receiptTaxDec);
    return drafts.reduce((s, d) => s.plus(d.amount), new Decimal(0));
  }

  let current = new Map(taxClassByItemId);
  let bestLoss = receiptTaxDec.minus(await sumAfterPenny(current)).abs();

  if (bestLoss.lte(RECONCILE_ROUNDING_EPS)) {
    return null;
  }

  for (let iter = 0; iter < 72; iter++) {
    let bestTrial: Map<string, string> | null = null;
    let bestTrialLoss = bestLoss;

    for (const vid of variableIds) {
      const curCls = current.get(vid);
      if (!curCls) continue;
      for (const cls of POS_CLASS_FIT_TRIAD) {
        if (cls === curCls) continue;
        const trial = new Map(current);
        trial.set(vid, cls);
        const s = await sumAfterPenny(trial);
        const loss = receiptTaxDec.minus(s).abs();
        if (loss.lt(bestTrialLoss)) {
          bestTrialLoss = loss;
          bestTrial = trial;
        }
      }
    }

    if (!bestTrial || bestTrialLoss.gte(bestLoss.minus(new Decimal('0.000001')))) {
      break;
    }
    current = bestTrial;
    bestLoss = bestTrialLoss;
    if (bestLoss.lte(RECONCILE_ROUNDING_EPS)) {
      break;
    }
  }

  if (bestLoss.gt(RECONCILE_ROUNDING_EPS)) {
    return null;
  }

  return current;
}

/**
 * Deletes prior rows, recomputes item taxes from catalog + POS rules (default taxable),
 * writes receipt_item_taxes and updates receipts tax reconciliation columns.
 */
export async function applyReceiptItemTaxesAndReconcile(
  supabase: SupabaseClient,
  receiptId: string,
  spaceId: string,
  options: ApplyReceiptItemTaxOptions = {},
): Promise<void> {
  const { data: receipt, error: rErr } = await supabase
    .from('receipts')
    .select(
      'id, tax, total_amount, date, currency, tax_jurisdiction_country, tax_jurisdiction_region, space_id, processed_by, entity_id, merchant_entity_id, tax_breakdown',
    )
    .eq('id', receiptId)
    .single();

  if (rErr || !receipt) {
    console.warn('applyReceiptItemTaxes: receipt not found', receiptId);
    return;
  }

  let evidenceText = '';
  let merchantName = '';
  let supplierFromProcessedBy = '';
  try {
    const pb = receipt.processed_by;
    const pbStr =
      pb == null ? '' : typeof pb === 'string' ? pb : JSON.stringify(pb);
    let entityBits = '';
    supplierFromProcessedBy = extractSupplierNameFromProcessedBy(receipt.processed_by);
    if (receipt.entity_id) {
      const { data: ent } = await supabase
        .from('entities')
        .select('name, address')
        .eq('id', receipt.entity_id as string)
        .maybeSingle();
      if (ent) {
        merchantName = String(ent.name ?? '').trim();
        entityBits = [ent.name, ent.address].filter(Boolean).join(' ');
      }
    }
    evidenceText = [pbStr, entityBits].filter(Boolean).join(' ');
  } catch {
    evidenceText = '';
    supplierFromProcessedBy = extractSupplierNameFromProcessedBy(receipt.processed_by);
  }
  if (!merchantName) {
    merchantName = supplierFromProcessedBy;
  }
  const merchantNameForPosRules = mergeMerchantHintsForPosRules(
    merchantName,
    supplierFromProcessedBy,
  );

  const currencyNorm = (receipt.currency != null ? String(receipt.currency) : '').trim().toUpperCase();
  let country =
    (receipt.tax_jurisdiction_country as string | null)?.trim() ||
    inferDefaultJurisdiction(currencyNorm || undefined).country;
  let region =
    options.regionOverride ??
    (receipt.tax_jurisdiction_region as string | null)?.trim() ??
    inferDefaultJurisdiction(currencyNorm || undefined).region;

  if (!country) {
    if (currencyNorm === 'USD' || currencyNorm === '') {
      country = 'US';
      region = region || '';
    } else if (currencyNorm === 'CAD') {
      country = 'CA';
      region = region || inferDefaultJurisdiction('CAD').region;
    }
  }

  if (country === 'CA' && region) {
    const norm = normalizeCanadianRegionCode(region);
    if (norm) region = norm;
  }

  /** Prefer city/postal/GST+PST signals over a wrong model region (e.g. NS 14% HST vs MB GST+RST). */
  if (country === 'CA' && !options.regionOverride) {
    const inferred = inferCanadianRegionFromReceiptSignals(evidenceText);
    const gstPst = receiptTextSuggestsGstPlusProvincialNotHst(evidenceText);
    const looksHst = region !== '' && CA_HST_SINGLE_LINE_REGIONS.has(region);
    if (inferred && (inferred === 'MB' || inferred === 'BC' || (gstPst && looksHst))) {
      region = inferred;
    }
  }

  if (!country) {
    console.warn(
      '[receipt-item-tax] No tax jurisdiction (set tax_jurisdiction_* or use USD/CAD for standard rates)',
      { receiptId, currency: receipt.currency },
    );
    await supabase
      .from('receipts')
      .update({
        tax_reconciliation_status: 'skipped',
        tax_items_sum: null,
        tax_variance_amount: null,
        tax_audit_required: false,
        tax_audit_comment: null,
      })
      .eq('id', receiptId);
    return;
  }

  const merchantEntityKey = (receipt.merchant_entity_id as string | null)?.trim() || null;
  const [posRules, entityPosRules] = await Promise.all([
    fetchPosTaxCodeRulesForCountry(supabase, country),
    merchantEntityKey
      ? fetchEntityPosTaxCodesForMerchantEntity(supabase, merchantEntityKey, country)
      : Promise.resolve([] as EntityPosTaxCodeRow[]),
  ]);

  let { data: items, error: iErr } = await supabase
    .from('receipt_items')
    .select('id, price, category_id, pos_tax_code')
    .eq('receipt_id', receiptId);

  if (!iErr && (!items || items.length === 0)) {
    const inserted = await ensureSingleMergedLineItem(supabase, receiptId, spaceId, receipt);
    if (inserted) {
      const again = await supabase
        .from('receipt_items')
        .select('id, price, category_id, pos_tax_code')
        .eq('receipt_id', receiptId);
      items = again.data ?? [];
      iErr = again.error;
    }
  }

  if (iErr || !items?.length) {
    if (!items?.length) {
      console.warn(
        '[receipt-item-tax] No receipt_items (merged line insert failed or no categories); tax reconciliation skipped.',
        { receiptId },
      );
    }
    const tv = new Decimal(receipt.tax == null ? 0 : String(receipt.tax));
    await supabase
      .from('receipts')
      .update({
        tax_reconciliation_status: 'skipped',
        tax_items_sum: 0,
        tax_variance_amount: tv.toDecimalPlaces(4).toNumber(),
        tax_audit_required: false,
        tax_audit_comment: null,
      })
      .eq('id', receiptId);
    return;
  }

  const receiptTaxDec = new Decimal(receipt.tax == null ? 0 : String(receipt.tax));

  /** Face value total tax is zero — store zero line taxes and matched status. */
  if (receiptTaxDec.isZero()) {
    const itemIds = items.map((i) => i.id as string);
    await supabase.from('receipt_item_taxes').delete().in('receipt_item_id', itemIds);
    if (itemIds.length > 0) {
      await supabase.from('receipt_items').update({ applicable_tax_kinds: null }).in('id', itemIds);
    }
    await supabase
      .from('receipts')
      .update({
        tax_jurisdiction_country: country,
        tax_jurisdiction_region: region,
        tax_reconciliation_status: 'matched',
        tax_items_sum: 0,
        tax_variance_amount: 0,
        tax_audit_required: false,
        tax_audit_comment: null,
      })
      .eq('id', receiptId);
    return;
  }

  const asOf = receiptTaxAsOfDate(receipt.date);
  const receiptItems = items as ReceiptItemRow[];

  /** One line item + receipts.tax_breakdown: assign printed amounts per tax_kind to that item. */
  if (receiptItems.length === 1) {
    const br = parseReceiptTaxBreakdown(
      (receipt as { tax_breakdown?: unknown }).tax_breakdown,
      region,
    );
    if (br) {
      const sumBr = br.reduce((s, x) => s.plus(x.amount), new Decimal(0));
      if (receiptTaxDec.minus(sumBr).abs().lte(RECONCILE_ROUNDING_EPS)) {
        const item = receiptItems[0];
        const lineBaseDec = new Decimal(String(item.price ?? 0));
        const lineBaseNum = lineBaseDec.toDecimalPlaces(4).toNumber();
        const draftsSb: DraftTaxLine[] = br.map((x) => ({
          receipt_item_id: item.id as string,
          tax_kind_code: x.kind,
          amount: x.amount.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
          rate_applied: lineBaseDec.gt(0)
            ? x.amount.div(lineBaseDec).toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toNumber()
            : 0,
          taxable_base: lineBaseNum,
          crm_tax_rate_standard_id: null,
          entity_pos_tax_code_id: null,
        }));
        const sumDecSb = draftsSb.reduce((s, d) => s.plus(d.amount), new Decimal(0));
        const finalizedSb = finalizeReconciliation(receipt.tax as number | null, sumDecSb);
        const itemIds = [item.id as string];
        await supabase.from('receipt_item_taxes').delete().in('receipt_item_id', itemIds);
        if (draftsSb.length > 0) {
          await supabase.from('receipt_item_taxes').insert(
            draftsSb.map((d) => ({
              receipt_item_id: d.receipt_item_id,
              tax_kind_code: d.tax_kind_code,
              amount: d.amount.toDecimalPlaces(4).toNumber(),
              rate_applied: d.rate_applied,
              taxable_base: d.taxable_base,
              crm_tax_rate_standard_id: null,
              entity_pos_tax_code_id: null,
              computation_source: 'rule_engine',
            })),
          );
        }
        const kindsSb = [...new Set(draftsSb.map((d) => d.tax_kind_code))];
        await supabase
          .from('receipt_items')
          .update({ applicable_tax_kinds: kindsSb.length > 0 ? kindsSb : null })
          .eq('id', item.id as string);
        await supabase
          .from('receipts')
          .update({
            tax_jurisdiction_country: country,
            tax_jurisdiction_region: region,
            tax_reconciliation_status: finalizedSb.status,
            tax_items_sum: finalizedSb.taxItemsSum,
            tax_variance_amount: finalizedSb.variance,
            tax_audit_required: finalizedSb.auditRequired,
            tax_audit_comment: finalizedSb.auditComment,
          })
          .eq('id', receiptId);
        return;
      }
    }
  }

  const taxClassByItemId = new Map<string, string>();
  const taxKindFilterByItemId = new Map<string, Set<string> | null>();
  const entityPosTaxCodeByItemId = new Map<string, string | null>();
  const lineMetas: LineMeta[] = [];

  for (const item of receiptItems) {
    const posRes = resolveLinePosTaxResolution(
      entityPosRules,
      posRules,
      merchantEntityKey,
      region,
      merchantNameForPosRules,
      item.pos_tax_code as string | null,
      asOf,
    );
    const posClass = posRes.taxClass;
    const taxClass: string = posClass ?? DEFAULT_TAX_CLASS;
    const id = item.id as string;
    taxClassByItemId.set(id, taxClass);
    entityPosTaxCodeByItemId.set(id, posRes.entityPosTaxCodeId);
    taxKindFilterByItemId.set(
      id,
      posRes.includedTaxKinds && posRes.includedTaxKinds.length > 0
        ? new Set(posRes.includedTaxKinds)
        : null,
    );
    const rawPc = item.pos_tax_code as string | null;
    const posCodeNorm =
      rawPc != null && String(rawPc).trim() !== '' ? String(rawPc).trim().toUpperCase() : null;
    lineMetas.push({
      itemId: id,
      posCode: posCodeNorm,
      posRuleMatched: posClass != null,
      taxClass,
    });
  }

  let drafts = await buildDraftsFromTaxClassMap(
    supabase,
    country,
    region,
    asOf,
    receiptItems,
    taxClassByItemId,
    undefined,
    taxKindFilterByItemId,
    entityPosTaxCodeByItemId,
  );
  let sumDec = applyPennyTailAllocation(drafts, receiptItems, receiptTaxDec);

  let receiptTaxFitApplied = false;
  let finalized = finalizeReconciliation(receipt.tax as number | null, sumDec);

  if (finalized.status === 'variance' && !options.skipReceiptTaxFit && !options.recalcPass) {
    const fitted = await greedyFitPosLineClassesToReceiptTax(
      supabase,
      country,
      region,
      asOf,
      receiptItems,
      lineMetas,
      taxClassByItemId,
      taxKindFilterByItemId,
      entityPosTaxCodeByItemId,
      receiptTaxDec,
    );
    if (fitted) {
      receiptTaxFitApplied = true;
      for (const [k, v] of fitted) {
        taxClassByItemId.set(k, v);
      }
      for (const m of lineMetas) {
        const nc = taxClassByItemId.get(m.itemId);
        if (nc) m.taxClass = nc;
      }
      drafts = await buildDraftsFromTaxClassMap(
        supabase,
        country,
        region,
        asOf,
        receiptItems,
        taxClassByItemId,
        undefined,
        taxKindFilterByItemId,
        entityPosTaxCodeByItemId,
      );
      sumDec = applyPennyTailAllocation(drafts, receiptItems, receiptTaxDec);
      finalized = finalizeReconciliation(receipt.tax as number | null, sumDec);
      console.log('[receipt-item-tax] receipt.tax fit: adjusted POS line tax classes to match ticket total', {
        receiptId,
      });
    }
  }

  const compSrc = receiptTaxFitApplied ? 'recalc' : options.recalcPass ? 'recalc' : 'rule_engine';
  const inserts: Record<string, unknown>[] = drafts.map((d) => ({
    receipt_item_id: d.receipt_item_id,
    tax_kind_code: d.tax_kind_code,
    amount: d.amount.toDecimalPlaces(4).toNumber(),
    rate_applied: d.rate_applied,
    taxable_base: d.taxable_base,
    crm_tax_rate_standard_id: d.crm_tax_rate_standard_id,
    entity_pos_tax_code_id: d.entity_pos_tax_code_id,
    computation_source: compSrc,
  }));

  const itemIds = items.map((i) => i.id as string);
  await supabase.from('receipt_item_taxes').delete().in('receipt_item_id', itemIds);

  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from('receipt_item_taxes').insert(inserts);
    if (insErr) {
      console.warn('[receipt_item_taxes] insert failed:', insErr.message, insErr.code, (insErr as any).details);
    }
  } else if (items.length > 0) {
    console.warn('[receipt-item-tax] No tax rows computed (check CRM schema exposure, rates, or province/state)', {
      receiptId,
      country,
      region,
      asOf,
      currency: receipt.currency,
    });
  }

  if (finalized.status === 'variance') {
    console.warn('[receipt-item-tax] Line tax sum vs receipt.tax out of tolerance', {
      receiptId,
      receiptTax: receiptTaxDec.toFixed(2),
      sumItems: sumDec.toFixed(2),
      variance: finalized.variance,
      maxRoundingDiff: RECONCILE_ROUNDING_EPS.toString(),
    });
  }

  let finalStatus = finalized.status;
  if (finalized.status === 'variance' && !options.recalcPass) {
    const t = receiptTaxDec.abs().toNumber();
    if (Math.abs(finalized.variance) > RECALC_VARIANCE_MULT * Math.max(t, 1)) {
      finalStatus = 'pending_recalc';
    }
  }

  await supabase
    .from('receipts')
    .update({
      tax_jurisdiction_country: country,
      tax_jurisdiction_region: region,
      tax_reconciliation_status: finalStatus,
      tax_items_sum: finalized.taxItemsSum,
      tax_variance_amount: finalized.variance,
      tax_audit_required: finalized.auditRequired,
      tax_audit_comment: finalized.auditComment,
    })
    .eq('id', receiptId);

  /** Persist applicable tax_kind codes per line for UI/audit. */
  const kindsByItem = new Map<string, Set<string>>();
  for (const d of drafts) {
    const k = d.tax_kind_code;
    if (!kindsByItem.has(d.receipt_item_id)) kindsByItem.set(d.receipt_item_id, new Set());
    kindsByItem.get(d.receipt_item_id)!.add(k);
  }
  const applicableUpdates = receiptItems.map((it) => {
    const iid = it.id as string;
    const arr = kindsByItem.has(iid) ? [...kindsByItem.get(iid)!].sort() : [];
    return supabase
      .from('receipt_items')
      .update({ applicable_tax_kinds: arr.length > 0 ? arr : null })
      .eq('id', iid);
  });
  const applicableResults = await Promise.all(applicableUpdates);
  for (const r of applicableResults) {
    if (r.error) console.warn('[receipt-item-tax] applicable_tax_kinds update:', r.error.message);
  }

  /**
   * Auto-learn POS code → tax_class when Σ line taxes matches receipt.tax.
   * Requires receipts.merchant_entity_id (shared-catalog key, not public.entities.id).
   */
  if (
    (finalStatus === 'matched' || receiptTaxFitApplied) &&
    !options.recalcPass &&
    merchantEntityKey
  ) {
    for (const meta of lineMetas) {
      if (!meta.posCode || meta.posRuleMatched) continue;
      if (!receiptTaxFitApplied && meta.taxClass === DEFAULT_TAX_CLASS) {
        continue;
      }
      const { error: learnErr } = await supabase.rpc('record_entity_pos_tax_learning_and_maybe_promote', {
        p_space_id: spaceId,
        p_receipt_id: receiptId,
        p_merchant_entity_id: merchantEntityKey,
        p_country_code: country,
        p_jurisdiction_region: region || '',
        p_pos_tax_code: meta.posCode,
        p_maps_to_tax_class_code: meta.taxClass,
      });
      if (learnErr) {
        console.warn(
          '[receipt-item-tax] record_entity_pos_tax_learning_and_maybe_promote:',
          learnErr.message,
        );
      }
    }
  }

  try {
    if (
      finalStatus === 'variance' &&
      country === 'CA' &&
      currencyNorm === 'CAD' &&
      new Decimal(Math.abs(finalized.variance)).gt(RECONCILE_ROUNDING_EPS)
    ) {
      showToast(
        `Tax check: lines total ${sumDec.toFixed(2)} vs receipt ${receiptTaxDec.toFixed(2)}. Adjust POS code or CRM POS rules if needed.`,
        'info',
        7000,
      );
    }
  } catch {
    /* toast host may be unavailable during early boot */
  }
}

export function scheduleReceiptTaxRecalcIfNeeded(
  supabase: SupabaseClient,
  receiptId: string,
  spaceId: string,
  currency?: string | null,
): void {
  const run = () => {
    void (async () => {
      const { data: rec } = await supabase
        .from('receipts')
        .select(
          'tax_reconciliation_status, tax_jurisdiction_region, tax_jurisdiction_country, currency',
        )
        .eq('id', receiptId)
        .single();
      if (!rec || rec.tax_reconciliation_status !== 'pending_recalc') return;

      const currencyNorm = (rec.currency != null ? String(rec.currency) : '').trim().toUpperCase();
      let country = ((rec.tax_jurisdiction_country as string) || '').trim().toUpperCase();
      if (!country) {
        if (currencyNorm === 'CAD') country = 'CA';
        else if (currencyNorm === 'USD' || currencyNorm === '') country = 'US';
      }

      if (country !== 'CA') {
        await supabase
          .from('receipts')
          .update({ tax_reconciliation_status: 'variance' })
          .eq('id', receiptId);
        return;
      }

      /**
       * Province shopping is disabled: a wrong province often matched within_tolerance vs receipts.tax
       * (e.g. NS 14% HST vs MB 12% combined) and overwrote tax_jurisdiction + line taxes.
       * Jurisdiction correction runs in applyReceiptItemTaxesAndReconcile from OCR/entity evidence.
       */
      await supabase
        .from('receipts')
        .update({ tax_reconciliation_status: 'variance' })
        .eq('id', receiptId);
    })();
  };

  if (typeof queueMicrotask === 'function') queueMicrotask(run);
  else setTimeout(run, 0);
}
