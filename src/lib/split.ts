// src/lib/split.ts
import { Expense, Participant, Transfer, ExpenseItem, ItemCategory } from '../types';

export function computeSettlements(participants: Participant[], expenses: Expense[]): Transfer[] {
  if (!participants.length || !expenses.length) return [];
  const everyone = participants.map(p => p.id);
  const bal = new Map<string, number>(everyone.map(id => [id, 0]));

  for (const e of expenses) {
    const total = e.splitMethod === 'itemized' && e.items?.length
      ? e.items.reduce((s, it) => s + it.amount, 0) + (e.tax || 0) + (e.tip || 0)
      : e.amount;

    // credit payer
    bal.set(e.paidBy, (bal.get(e.paidBy) || 0) + total);

    // compute per-person owed for this expense
    const per = sharesForExpense(e, everyone);
    for (const [id, owed] of per) bal.set(id, (bal.get(id) || 0) - owed);
  }

  // build transfers (same greedy as before)
  const debtors: { id: string; amt: number }[] = [];
  const creditors: { id: string; amt: number }[] = [];
  for (const id of everyone) {
    const v = round2(bal.get(id) || 0);
    if (v < -0.009) debtors.push({ id, amt: -v });
    else if (v > 0.009) creditors.push({ id, amt: v });
  }
  debtors.sort((a,b)=>b.amt-a.amt);
  creditors.sort((a,b)=>b.amt-a.amt);

  const transfers: Transfer[] = [];
  let i=0,j=0;
  while (i<debtors.length && j<creditors.length) {
    const pay = round2(Math.min(debtors[i].amt, creditors[j].amt));
    if (pay > 0) {
      transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
      debtors[i].amt = round2(debtors[i].amt - pay);
      creditors[j].amt = round2(creditors[j].amt - pay);
    }
    if (debtors[i].amt <= 0.009) i++;
    if (creditors[j].amt <= 0.009) j++;
  }
  return transfers;
}

function sharesForExpense(e: Expense, everyoneIds: string[]) {
  const per = new Map<string, number>();
  if (e.splitMethod === 'itemized' && e.items?.length) {
    let itemsTotal = 0;
    for (const it of e.items) {
      const group = it.splitAmong?.length ? it.splitAmong : everyoneIds;
      const share = it.amount / Math.max(1, group.length);
      itemsTotal += it.amount;
      for (const id of group) per.set(id, (per.get(id) || 0) + share);
    }
    const extra = (e.tax || 0) + (e.tip || 0);
    if (extra > 0 && itemsTotal > 0) {
      for (const [id, base] of per) per.set(id, base + (base / itemsTotal) * extra);
    }
  } else {
    const group = e.splitAmong?.length ? e.splitAmong : everyoneIds;
    const share = e.amount / Math.max(1, group.length);
    for (const id of group) per.set(id, (per.get(id) || 0) + share);
  }
  return per;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ----------------------------------------------------------------
 * OPTIONAL FALLBACK CATEGORIZATION
 * Use ONLY when backend doesn't provide `category`.
 * ---------------------------------------------------------------- */

/** Quick keyword buckets. Keep conservative to avoid mislabeling. */
const ALC = [
  'beer','ipa','lager','ale','stout','cider',
  'wine','rosé','rose','cabernet','merlot','pinot','sauvignon','riesling','prosecco','champagne',
  'vodka','tequila','whiskey','whisky','bourbon','rum','sake','soju',
  'cocktail','margarita','mojito','martini','negroni','old fashioned','spritz'
];

const APP = [
  'appetizer','app', 'nacho','nachos','wings','calamari','fries','chips','dip','edamame','spring roll','dumpling','garlic bread','hummus'
];

const TAX = ['tax','hst','gst','pst','vat','sales tax'];
const TIP = ['tip','gratuity','service charge','svc'];

const IGNORE = ['change','cash','card','auth','balance','subtotal']; // not usually lines to charge

/** Very small normalizer: lowercases and trims descriptors. */
const norm = (s: string) => (s || '').toLowerCase().trim();

/** Returns a best-guess ItemCategory based on description text. */
export function categorizeItem(description: string): ItemCategory {
  const d = norm(description);
  if (!d) return 'food';

  const isAny = (arr: string[]) => arr.some(k => d.includes(k));

  if (isAny(TAX)) return 'tax';
  if (isAny(TIP)) return 'tip';
  if (isAny(IGNORE)) return 'ignore';
  if (isAny(ALC)) return 'alcohol';
  if (isAny(APP)) return 'appetizer';

  // Everything else (including soda/juice/coffee) defaults to food
  return 'food';
}

/**
 * Walks expenses and adds `category` to items that don't have one yet.
 * Non-destructive: existing categories are kept.
 */
export function categorizeExpensesIfMissing(expenses: Expense[]): Expense[] {
  return expenses.map(e => {
    if (e.splitMethod !== 'itemized' || !Array.isArray(e.items)) return e;
    const items: ExpenseItem[] = e.items.map(it =>
      it.category ? it : { ...it, category: categorizeItem(it.description) }
    );
    return { ...e, items };
  });
}
