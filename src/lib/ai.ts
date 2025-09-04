// src/lib/ai.ts
import Constants from 'expo-constants';

export type ReceiptItem = { description: string; amount: number };
export type ReceiptParse = {
  merchant?: string;
  date?: string;
  total?: number;
  tax?: number;
  tip?: number;
  items: ReceiptItem[];
  engine?: 'azure_receipt' | 'azure_read_gpt' | 'gpt_image' | string;
};

export type AnalyzeOptions = {
  /** If provided, overrides server env for this request only */
  includeTaxTip?: boolean;
  /** Number of people to split among (e.g., 2) */
  people?: number;
  /** Tip percentage (e.g., 20 = 20%) */
  tipPercent?: number;
};

function readApiBase(): string | null {
  // 1) Public env (preferred)
  const fromEnv = (process.env as any)?.EXPO_PUBLIC_API_BASE?.toString().trim();

  // 2) app.json/app.config extra (support both keys)
  const extra = (Constants?.expoConfig?.extra ?? {}) as Record<string, any>;
  const fromExtraPublic =
    typeof extra.EXPO_PUBLIC_API_BASE === 'string' ? extra.EXPO_PUBLIC_API_BASE.trim() : '';
  const fromExtraLegacy =
    typeof extra.apiBase === 'string' ? extra.apiBase.trim() : '';

  const raw = fromEnv || fromExtraPublic || fromExtraLegacy || '';
  return raw ? raw.replace(/\/+$/, '') : null; // strip trailing slash(es)
}

export const apiBase: string | null = readApiBase();
export const hasApi = !!apiBase;

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log('[SplitChamp] apiBase =', apiBase);
}

/** Parse and normalize server response */
function coerceReceipt(data: any): ReceiptParse {
  const parsed =
    typeof data?.output_text === 'string' ? JSON.parse(data.output_text) : data;
  if (!parsed?.items || !Array.isArray(parsed.items)) {
    throw new Error('AI response missing items[]');
  }
  return parsed as ReceiptParse;
}

/** Clamp + sanitize options so we never send NaN/bad values */
function normalizeOpts(opts?: AnalyzeOptions): Required<Pick<AnalyzeOptions, 'includeTaxTip'>> & Partial<AnalyzeOptions> {
  const out: AnalyzeOptions = { ...opts };
  if (typeof out.people === 'number') {
    out.people = Math.max(1, Math.floor(out.people));
  }
  if (typeof out.tipPercent === 'number') {
    out.tipPercent = Math.min(100, Math.max(0, Math.floor(out.tipPercent)));
  }
  return { includeTaxTip: !!out.includeTaxTip, ...out };
}

/** RN-safe query builder; appends only provided fields */
function withQuery(baseUrl: string, opts?: AnalyzeOptions): string {
  if (!opts) return baseUrl;
  const parts: string[] = [];

  if (typeof opts.includeTaxTip === 'boolean') {
    parts.push(`include_tax_tip=${opts.includeTaxTip ? 'true' : 'false'}`);
  }
  if (typeof opts.people === 'number') {
    parts.push(`people=${encodeURIComponent(String(opts.people))}`);
  }
  if (typeof opts.tipPercent === 'number') {
    parts.push(`tip_percent=${encodeURIComponent(String(opts.tipPercent))}`);
  }

  if (parts.length === 0) return baseUrl;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}${parts.join('&')}`;
}

/** Read server error body, but mask HTML error pages (e.g., 502 proxy) */
async function readErrorBodySafely(res: Response): Promise<string> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  const trimmed = text.trim().toLowerCase();
  if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
    return 'Server returned an HTML error page (likely 502 from host).';
  }
  return text;
}

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

/** Multipart upload (best) */
export async function analyzeReceiptFromUri(
  fileUri: string,
  opts?: AnalyzeOptions
): Promise<ReceiptParse> {
  if (!apiBase) {
    const err: any = new Error('No API configured');
    err.code = 'NO_API';
    throw err;
  }

  const norm = normalizeOpts(opts);

  const form = new FormData();
  form.append('file', {
    uri: fileUri,
    name: 'receipt.jpg',
    type: 'image/jpeg',
  } as any);

  // Also pass knobs as form fields (in addition to query) to maximize backend compatibility
  if (typeof norm.includeTaxTip === 'boolean') {
    form.append('include_tax_tip', String(norm.includeTaxTip));
  }
  if (typeof norm.people === 'number') {
    form.append('people', String(norm.people));
  }
  if (typeof norm.tipPercent === 'number') {
    form.append('tip_percent', String(norm.tipPercent));
  }

  const url = withQuery(`${apiBase}/analyze-receipt`, norm);

  const t = withTimeout(90_000); // 90s to match server/OpenAI timeouts
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json' }, // let RN set multipart boundary
      body: form,
      signal: t.signal,
    });

    if (!res.ok) {
      const text = await readErrorBodySafely(res);
      throw new Error(`AI analyze failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    return coerceReceipt(data);
  } finally {
    t.clear();
  }
}

/** JSON base64 upload (fallback) */
export async function analyzeReceipt(
  imageBase64: string,
  opts?: AnalyzeOptions
): Promise<ReceiptParse> {
  if (!apiBase) {
    const err: any = new Error('No API configured');
    err.code = 'NO_API';
    throw err;
  }

  const norm = normalizeOpts(opts);
  const url = withQuery(`${apiBase}/analyze-receipt`, norm);

  const body: Record<string, any> = { image_base64: imageBase64 };
  if (typeof norm.includeTaxTip === 'boolean') body.include_tax_tip = norm.includeTaxTip;
  if (typeof norm.people === 'number') body.people = norm.people;
  if (typeof norm.tipPercent === 'number') body.tip_percent = norm.tipPercent;

  const t = withTimeout(90_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: t.signal,
    });

    if (!res.ok) {
      const text = await readErrorBodySafely(res);
      throw new Error(`AI analyze failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    return coerceReceipt(data);
  } finally {
    t.clear();
  }
}
