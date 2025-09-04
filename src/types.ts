// src/types.ts

// People in the split
export type Participant = {
  id: string;
  name: string;
};

// Item categories from backend post-processing
export type ItemCategory =
  | 'food'
  | 'alcohol'
  | 'appetizer'
  | 'tax'
  | 'tip'
  | 'ignore';

// Optional per-line item for itemized expenses
export type ExpenseItem = {
  id: string;                // backend now provides a stable id per item
  description: string;
  amount: number;            // dollars
  splitAmong: string[];      // participant ids for THIS item

  // NEW (optional) — coming from backend and/or local edits
  category?: ItemCategory;   // enables alcohol exclusion, appetizer sharing, etc.
  assigned?: string[];       // UI convenience: explicit owners (alias of splitAmong in some flows)
  shares?: Record<string, number>; // custom proportional shares (advanced)
};

// Expense can be either:
// - even split (your existing flow), or
// - itemized (items[] + optional tip/tax, allocated proportionally)
export type Expense = {
  id: string;
  description: string;

  // For EVEN mode, this is the total (can include tip/tax if user typed it).
  // For ITEMIZED mode, this can be derived = sum(items) + tip + tax,
  // but we keep it as a stored total for simplicity/consistency.
  amount: number;

  paidBy: string;        // participant id
  splitAmong: string[];  // EVEN mode (fallback if items missing)

  // Mode + details
  splitMethod?: 'even' | 'itemized';
  items?: ExpenseItem[]; // when itemized
  tip?: number;          // absolute dollars
  tax?: number;          // absolute dollars

  // Optional (parity with ExpenseItem & simple/non-itemized imports)
  category?: ItemCategory;
  assigned?: string[];
  shares?: Record<string, number>;
};

// Settlement transfer (who pays who how much)
export type Transfer = {
  from: string; // participant id
  to: string;   // participant id
  amount: number;
};

// Optional store helpers (used by SummaryCard if you add them later)
export type Totals = {
  receipt: number;   // total of receipt(s)
  toSettle: number;  // sum of transfers
};

export type Settlement = {
  summary?: string;  // optional human-readable summary
  transfers: Transfer[];
};
