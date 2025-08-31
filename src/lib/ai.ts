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

// prefer EXPO_PUBLIC_API_BASE if present, else app.json extra, else localhost
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  (Constants.expoConfig?.extra as any)?.apiBase ||
  'http://127.0.0.1:3000';

export async function analyzeReceipt(imageBase64: string): Promise<ReceiptParse> {
  const res = await fetch(`${API_BASE}/analyze-receipt`, {
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
