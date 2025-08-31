import { Expense, Participant, Transfer } from '../types';

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
      const share = it.amount / group.length;
      itemsTotal += it.amount;
      for (const id of group) per.set(id, (per.get(id) || 0) + share);
    }
    const extra = (e.tax || 0) + (e.tip || 0);
    if (extra > 0 && itemsTotal > 0) {
      for (const [id, base] of per) per.set(id, base + (base / itemsTotal) * extra);
    }
  } else {
    const group = e.splitAmong?.length ? e.splitAmong : everyoneIds;
    const share = e.amount / group.length;
    for (const id of group) per.set(id, (per.get(id) || 0) + share);
  }
  return per;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
