// src/store/useSplitStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { computeSettlements } from '../lib/split';
import type { Expense, Participant, Transfer } from '../types';

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

export interface SplitState {
  participants: Participant[];
  expenses: Expense[];
  transfers: Transfer[];

  // existing APIs
  addParticipant: (name: string) => void;
  removeParticipant: (id: string) => void;
  addExpense: (e: Omit<Expense, 'id'>) => void;
  removeExpense: (id: string) => void;

  // compute + reset
  calculate: () => void;
  resetAll: () => void;

  // NEW convenience APIs for the camera/parse flow
  setParticipants: (p: Participant[]) => void;
  createParticipantsByCount: (count: number) => Participant[]; // auto Person 1..N
  upsertParticipantNames: (names: string[]) => void;           // rename in place
  setExpenses: (
    list: Omit<Expense, 'id'>[],
    opts?: { overwrite?: boolean; assignToAllIfEmpty?: boolean }
  ) => void; // bulk set/append parsed items

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

      // helper: if an expense has empty splitAmong, assign to all participants
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

        // ---------- existing actions ----------
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

        // ---------- NEW actions for camera/parse flow ----------
        setParticipants: (p) => {
          set({ participants: p });
          recompute();
        },

        createParticipantsByCount: (count) => {
          const participants: Participant[] = Array.from({ length: count }).map(
            (_, i) => ({ id: uid(), name: `Person ${i + 1}` })
          );
          set((s) => ({ participants }));
          recompute();
          return participants;
        },

        upsertParticipantNames: (names) => {
          const current = get().participants;
          // ensure we have at least `names.length` participants
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

        _hasHydrated: false,
        _setHasHydrated: (v) => set({ _hasHydrated: v }),
      };
    },
    {
      name: 'splitchamp-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // Persist only participants & expenses (transfers are derived)
      partialize: (s) => ({
        participants: s.participants,
        expenses: s.expenses,
      }) as any,
      onRehydrateStorage: () => (state) => {
        state?._setHasHydrated(true);
        // Recompute transfers right after hydration
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
