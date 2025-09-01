// src/lib/ai.ts

export type ReceiptItem = { description: string; amount: number };
export type ReceiptParse = {
  merchant?: string;
  date?: string;
  total?: number;
  tax?: number;
  tip?: number;
  items: ReceiptItem[];
};

// Prefer an env var at build time. No default localhost in production.
const RAW_API_BASE = process.env.EXPO_PUBLIC_API_BASE?.trim() || null;

// Normalize (remove trailing slash)
export const apiBase: string | null = RAW_API_BASE ? RAW_API_BASE.replace(/\/+$/, '') : null;
export const hasApi = !!apiBase;

/**
 * Parse and normalize server response which may be either JSON already
 * or { output_text: "<json string>" } from an LLM wrapper.
 */
function coerceReceipt(data: any): ReceiptParse {
  const parsed = typeof data?.output_text === 'string' ? JSON.parse(data.output_text) : data;
  if (!parsed?.items || !Array.isArray(parsed.items)) {
    throw new Error('AI response missing items[]');
  }
  return parsed as ReceiptParse;
}

/**
 * Preferred: Analyze a receipt by sending an image file URI via multipart/form-data.
 * This avoids base64 memory bloat and is faster on device.
 */
export async function analyzeReceiptFromUri(fileUri: string): Promise<ReceiptParse> {
  if (!apiBase) {
    const err: any = new Error('No API configured');
    err.code = 'NO_API';
    throw err;
  }

  // React Native fetch supports FormData with { uri, name, type }
  const form = new FormData();
  form.append('file', {
    uri: fileUri,
    name: 'receipt.jpg',
    type: 'image/jpeg',
  } as any);

  const res = await fetch(`${apiBase}/analyze-receipt`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      // NOTE: Do NOT set Content-Type here; RN sets the correct multipart boundary.
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI analyze failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return coerceReceipt(data);
}

/**
 * Legacy: Analyze receipt image using base64 JSON body.
 * Kept for backwards compatibility if your backend only accepts JSON.
 */
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
