// src/store/useSplitStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { computeSettlements } from '../lib/split';
import type { Expense, Participant, Transfer, ExpenseItem } from '../types';

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

// --- small helpers ---
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const safeNum = (n: any) => (Number.isFinite(Number(n)) ? Number(n) : 0);

// crude alcohol detector as a fallback when backend category is missing
const ALC_TOKENS = [
  'beer','wine','lager','ipa','ale','stout','sauvignon','cabernet','merlot','riesling','pinot',
  'vodka','tequila','whiskey','whisky','bourbon','rum','sake','soju','cocktail','margarita','mojito',
  'martini','negroni','cider','rosé','rose','prosecco','champagne'
];
const isAlcohol = (it: Pick<ExpenseItem,'description'> & Partial<ExpenseItem>) => {
  const cat = (it as any).category as string | undefined;
  if (cat && cat.toLowerCase() === 'alcohol') return true;
  const s = (it.description || '').toLowerCase();
  return ALC_TOKENS.some(k => s.includes(k));
};

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

  // NEW for the wizard
  /** Assign the selected itemized receipt items to a single person (equal share if multiple later). */
  assignItemsTo: (expenseItemIds: string[], personId: string) => void;

  /** Exclude these people from paying for alcohol lines (keeps others as payers). */
  excludeAlcoholFor: (personIds: string[]) => void;

  /** Re-run totals/settlement computation (exposed for batch edits). */
  recompute: () => void;

  // Optional helpers that you already had
  autoAssignItemsByName: () => void;
  applyEqualSplit: () => void;
  applyWeightedSplit: (weights: number[]) => void;
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

        // expose recompute so UI can call it
        recompute,

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

        // --- NEW: Assign specific receipt items to a person
        assignItemsTo: (expenseItemIds, personId) => {
          if (!expenseItemIds?.length || !personId) return;
          const next = get().expenses.map((e) => {
            if (e.splitMethod !== 'itemized' || !Array.isArray(e.items)) return e;
            const items = e.items.map((it) =>
              expenseItemIds.includes(it.id)
                ? { ...it, splitAmong: [personId] }
                : it
            );
            return { ...e, items };
          });
          set({ expenses: next });
          recompute();
        },

        // --- NEW: Exclude certain people from paying for alcohol
        excludeAlcoholFor: (personIds) => {
          if (!personIds?.length) return;
          const everyone = get().participants.map((p) => p.id);

          const next = get().expenses.map((e) => {
            if (e.splitMethod !== 'itemized' || !Array.isArray(e.items)) return e;

            // baseline payers for items that don't have specific splitAmong yet
            const basePayers = e.splitAmong?.length ? e.splitAmong : everyone;

            const items = e.items.map((it) => {
              // only touch alcohol lines
              if (!isAlcohol(it)) return it;

              const current = (it.splitAmong && it.splitAmong.length ? it.splitAmong : basePayers);
              const filtered = current.filter((pid) => !personIds.includes(pid));

              // if everyone was excluded accidentally, keep original to avoid orphaning the charge
              const nextSplit = filtered.length ? filtered : current;
              return { ...it, splitAmong: nextSplit };
            });

            return { ...e, items };
          });

          set({ expenses: next });
          recompute();
        },

        // -------- Existing helpers ----------
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
              if (matches.length === 1) {
                return { ...it, splitAmong: [matches[0].id] };
              }
              return it;
            });
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

          // Minimal weight handling: repeat ids by weight to simulate proportional shares
          const expandByWeight = (ids: string[], w: number[]) => {
            const out: string[] = [];
            ids.forEach((id, i) => {
              const times = Math.max(0, Math.round(safeNum(w[i])));
              for (let t = 0; t < times; t++) out.push(id);
            });
            return out.length ? out : ids;
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
          const e = expenses.length === 1 ? expenses[0] : undefined;
          if (!e || e.splitMethod !== 'itemized' || !Array.isArray(e.items)) return 0;
          const itemsTotal = sum(e.items.map(it => safeNum(it.amount)));
          const tax = safeNum((e as any).tax);
          const tip = safeNum((e as any).tip);
          const expected = itemsTotal + tax + tip;
          const diff = safeNum(e.amount) - expected;
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
