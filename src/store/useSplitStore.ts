// src/store/useSplitStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { computeSettlements } from '../lib/split';
import type { Expense, Participant, Transfer, ExpenseItem } from '../types';

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

// --- NEW small helpers ---
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const safeNum = (n: any) => (Number.isFinite(Number(n)) ? Number(n) : 0);

export interface SplitState {
  participants: Participant[];
  expenses: Expense[];
  transfers: Transfer[];

  addParticipant: (name: string) => void;
  removeParticipant: (id: string) => void;
  addExpense: (e: Omit<Expense, 'id'>) => void;
  removeExpense: (id: string) => void;

  calculate: () => void;
  resetAll: () => void;

  // camera/parse helpers
  setParticipants: (p: Participant[]) => void;
  createParticipantsByCount: (count: number) => Participant[];
  upsertParticipantNames: (names: string[]) => void;
  setExpenses: (
    list: Omit<Expense, 'id'>[],
    opts?: { overwrite?: boolean; assignToAllIfEmpty?: boolean }
  ) => void;

  // --- NEW: Option 2 helpers ---
  /** If items contain names (e.g., "William Burger"), try to auto-assign to participants by name match */
  autoAssignItemsByName: () => void;

  /** Apply an even split across all current participants (overwrites splitAmong for each item/expense) */
  applyEqualSplit: () => void;

  /** Apply a weighted split. weights is an array same length as participants, e.g., [2,1,1] */
  applyWeightedSplit: (weights: number[]) => void;

  /** Compute a discrepancy if the single itemized expense total != sum(items)+tax+tip (in dollars) */
  getItemizationDiscrepancy: () => number;

  _hasHydrated: boolean;
  _setHasHydrated: (v: boolean) => void;
}

export const useSplitStore = create<SplitState>()(
  persist(
    (set, get) => {
      const recompute = () => {
        const { participants, expenses } = get();
        const hasInputs = participants.length > 0 && expenses.length > 0;
        const transfers = hasInputs
          ? computeSettlements(participants, expenses)
          : [];
        set({ transfers });
      };

      const normalizeExpenses = (
        raw: Omit<Expense, 'id'>[],
        assignToAllIfEmpty: boolean
      ): Expense[] => {
        const allIds = get().participants.map((p) => p.id);
        return raw.map((e) => {
          const splitAmong =
            assignToAllIfEmpty && (!e.splitAmong || e.splitAmong.length === 0)
              ? allIds
              : e.splitAmong ?? [];
          return { ...e, id: uid(), splitAmong };
        });
      };

      return {
        participants: [],
        expenses: [],
        transfers: [],

        addParticipant: (name) => {
          set((s) => ({ participants: [...s.participants, { id: uid(), name }] }));
          recompute();
        },

        removeParticipant: (id) => {
          set((s) => {
            const participants = s.participants.filter((p) => p.id !== id);
            const expenses = s.expenses.filter(
              (e) => e.paidBy !== id && e.splitAmong.every((pid) => pid !== id)
            );
            return { participants, expenses };
          });
          recompute();
        },

        addExpense: (e) => {
          set((s) => ({ expenses: [...s.expenses, { ...e, id: uid() }] }));
          recompute();
        },

        removeExpense: (id) => {
          set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
          recompute();
        },

        calculate: () => {
          const { participants, expenses } = get();
          if (!participants.length || !expenses.length) {
            set({ transfers: [] });
            return;
          }
          set({ transfers: computeSettlements(participants, expenses) });
        },

        resetAll: () => set({ participants: [], expenses: [], transfers: [] }),

        setParticipants: (p) => {
          set({ participants: p });
          recompute();
        },

        createParticipantsByCount: (count) => {
          const participants: Participant[] = Array.from({ length: count }).map(
            (_, i) => ({ id: uid(), name: `Person ${i + 1}` })
          );
          set(() => ({ participants }));
          recompute();
          return participants;
        },

        upsertParticipantNames: (names) => {
          const current = get().participants;
          if (current.length < names.length) {
            const toAdd = names.length - current.length;
            const extras: Participant[] = Array.from({ length: toAdd }).map(
              (_, i) => ({ id: uid(), name: `Person ${current.length + i + 1}` })
            );
            set({ participants: [...current, ...extras] });
          }
          const updated = get().participants.map((p, i) => ({
            ...p,
            name: names[i] ?? p.name,
          }));
          set({ participants: updated });
          recompute();
        },

        setExpenses: (list, opts) => {
          const { overwrite = true, assignToAllIfEmpty = true } = opts ?? {};
          const normalized = normalizeExpenses(list, assignToAllIfEmpty);
          set((s) => ({
            expenses: overwrite ? normalized : [...s.expenses, ...normalized],
          }));
          recompute();
        },

        // -------- NEW: AI-assisted splitting logic ----------
        autoAssignItemsByName: () => {
          const { participants, expenses } = get();
          if (!participants.length || !expenses.length) return;
          const nameMap = participants.map(p => ({
            id: p.id,
            name: (p.name || '').trim().toLowerCase()
          })).filter(n => n.name.length > 0);

          const newExpenses = expenses.map((e) => {
            if (e.splitMethod !== 'itemized' || !Array.isArray(e.items)) return e;
            const items: ExpenseItem[] = e.items.map((it) => {
              const desc = String(it.description || '').toLowerCase();
              const matches = nameMap.filter(n =>
                desc.includes(n.name) || desc.split(/\s+/).some(tok => tok === n.name)
              );
              // If exactly one match, assign to that person only; else leave as-is
              if (matches.length === 1) {
                return { ...it, splitAmong: [matches[0].id] };
              }
              return it;
            });
            // If some items now have specific owners, default remaining items to everyone
            const updatedItems = items.map(it =>
              (it.splitAmong && it.splitAmong.length > 0) ? it : { ...it, splitAmong: e.splitAmong }
            );
            return { ...e, items: updatedItems };
          });

          set({ expenses: newExpenses });
          recompute();
        },

        applyEqualSplit: () => {
          const { participants, expenses } = get();
          const everyone = participants.map(p => p.id);
          if (!everyone.length) return;

          const mapped = expenses.map((e) => {
            if (e.splitMethod === 'itemized' && Array.isArray(e.items)) {
              const items = e.items.map(it => ({ ...it, splitAmong: everyone }));
              return { ...e, splitAmong: everyone, items };
            }
            return { ...e, splitAmong: everyone };
          });

          set({ expenses: mapped });
          recompute();
        },

        applyWeightedSplit: (weights) => {
          const { participants, expenses } = get();
          const everyone = participants.map(p => p.id);
          if (!everyone.length || weights.length !== everyone.length) return;

          // Weights don’t change per-item math here; we store them on each expense as a per-participant multiplier
          // Minimal approach: we expand weights into repeated ids on splitAmong (keeps the rest of the pipeline intact).
          const expandByWeight = (ids: string[], w: number[]) => {
            const out: string[] = [];
            ids.forEach((id, i) => {
              const times = Math.max(0, Math.round(safeNum(w[i])));
              for (let t = 0; t < times; t++) out.push(id);
            });
            return out.length ? out : ids; // fallback to equal if weights all zero
          };

          const mapped = expenses.map((e) => {
            if (e.splitMethod === 'itemized' && Array.isArray(e.items)) {
              const items = e.items.map(it => ({ ...it, splitAmong: expandByWeight(everyone, weights) }));
              return { ...e, splitAmong: expandByWeight(everyone, weights), items };
            }
            return { ...e, splitAmong: expandByWeight(everyone, weights) };
          });

          set({ expenses: mapped });
          recompute();
        },

        getItemizationDiscrepancy: () => {
          const { expenses } = get();
          // Focus: single itemized import (your main scan flow)
          const e = expenses.length === 1 ? expenses[0] : undefined;
          if (!e || e.splitMethod !== 'itemized' || !Array.isArray(e.items)) return 0;
          const itemsTotal = sum(e.items.map(it => safeNum(it.amount)));
          const tax = safeNum((e as any).tax);
          const tip = safeNum((e as any).tip);
          const expected = itemsTotal + tax + tip;
          const diff = safeNum(e.amount) - expected;
          // Round small floating errors
          return Math.abs(diff) < 0.01 ? 0 : Number(diff.toFixed(2));
        },

        _hasHydrated: false,
        _setHasHydrated: (v) => set({ _hasHydrated: v }),
      };
    },
    {
      name: 'splitchamp-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      partialize: (s) => ({
        participants: s.participants,
        expenses: s.expenses,
      }) as any,
      onRehydrateStorage: () => (state) => {
        state?._setHasHydrated(true);
        setTimeout(() => {
          const { participants, expenses } = useSplitStore.getState();
          const hasInputs = participants.length > 0 && expenses.length > 0;
          useSplitStore.setState({
            transfers: hasInputs ? computeSettlements(participants, expenses) : [],
          });
        }, 0);
      },
      migrate: (persisted) => persisted as any,
    } as const
  )
);
