// src/types.ts

// People in the split
export type Participant = {
  id: string;
  name: string;
};

// Optional per-line item for itemized expenses
export type ExpenseItem = {
  id: string;
  description: string;
  amount: number;       // dollars
  splitAmong: string[]; // participant ids for THIS item
};

// Expense can be either:
// - even split (your existing flow), or
// - itemized (items[] + optional tip/tax, allocated proportionally)
export type Expense = {
  id: string;
  description: string;

  // For EVEN mode, this is the total (can already include tip/tax if user typed it).
  // For ITEMIZED mode, this can be derived = sum(items) + tip + tax,
  // but we keep it as a stored total for simplicity/consistency.
  amount: number;

  paidBy: string;        // participant id
  splitAmong: string[];  // used for EVEN mode (fallback if items missing)

  // New (optional)
  splitMethod?: 'even' | 'itemized';
  items?: ExpenseItem[]; // when itemized
  tip?: number;          // absolute dollars (store the computed value)
  tax?: number;          // absolute dollars (store the computed value)
};

// Settlement transfer (who pays who how much)
export type Transfer = {
  from: string; // participant id
  to: string;   // participant id
  amount: number;
};
