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
 * Analyze receipt image (base64 JPEG).
 * Throws { code: 'NO_API' } if no backend is configured.
 */
export async function analyzeReceipt(imageBase64: string): Promise<ReceiptParse> {
  if (!apiBase) {
    const err: any = new Error('No API configured');
    err.code = 'NO_API';
    throw err;
  }

  const res = await fetch(`${apiBase}/analyze-receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI analyze failed: ${res.status} ${text}`);
  }

  // The backend returns either the final JSON or { output_text: "json-string" }
  const data = await res.json();
  const parsed =
    typeof (data as any).output_text === 'string'
      ? JSON.parse((data as any).output_text)
      : data;

  if (!parsed?.items || !Array.isArray(parsed.items)) {
    throw new Error('AI response missing items[]');
  }

  return parsed as ReceiptParse;
}
