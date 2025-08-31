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

  addParticipant: (name: string) => void;
  removeParticipant: (id: string) => void;
  addExpense: (e: Omit<Expense, 'id'>) => void;
  removeExpense: (id: string) => void;

  calculate: () => void;
  resetAll: () => void;

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
      }) as any, // keep typing simple across zustand versions
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
