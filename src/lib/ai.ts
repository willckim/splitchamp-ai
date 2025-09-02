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
};

function readApiBase(): string | null {
  // 1) Public env (preferred)
  const fromEnv = (process.env as any)?.EXPO_PUBLIC_API_BASE?.toString().trim();

  // 2) app.json/app.config extra (support both keys)
  const extra = (Constants?.expoConfig?.extra ?? {}) as Record<string, any>;
  const fromExtraPublic = typeof extra.EXPO_PUBLIC_API_BASE === 'string'
    ? extra.EXPO_PUBLIC_API_BASE.trim()
    : '';
  const fromExtraLegacy = typeof extra.apiBase === 'string'
    ? extra.apiBase.trim()
    : '';

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
  const parsed = typeof data?.output_text === 'string' ? JSON.parse(data.output_text) : data;
  if (!parsed?.items || !Array.isArray(parsed.items)) {
    throw new Error('AI response missing items[]');
  }
  return parsed as ReceiptParse;
}

/** Multipart upload (best) */
export async function analyzeReceiptFromUri(fileUri: string): Promise<ReceiptParse> {
  if (!apiBase) {
    const err: any = new Error('No API configured');
    err.code = 'NO_API';
    throw err;
  }

  const form = new FormData();
  form.append('file', {
    uri: fileUri,
    name: 'receipt.jpg',
    type: 'image/jpeg',
  } as any);

  const res = await fetch(`${apiBase}/analyze-receipt`, {
    method: 'POST',
    // Let RN set the multipart boundary automatically; do NOT set Content-Type manually here.
    headers: { Accept: 'application/json' },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI analyze failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return coerceReceipt(data);
}

/** JSON base64 upload (fallback) */
export async function analyzeReceipt(imageBase64: string): Promise<ReceiptParse> {
  if (!apiBase) {
    const err: any = new Error('No API configured');
    err.code = 'NO_API';
    throw err;
  }
  const res = await fetch(`${apiBase}/analyze-receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI analyze failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return coerceReceipt(data);
}
