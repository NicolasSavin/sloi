import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AdviceAction } from "@/lib/advisor";

export type SignalStatus = "open" | "target" | "stop" | "halt" | "reverse" | "expired";

export interface SignalHit {
  id: string;
  at: number;
  symbol: string;
  label: string;
  action: "long" | "short";
  entry: number | null;
  stop: number | null;
  target: number | null;
  title: string;
  decimals: number;
  status?: SignalStatus;
  closedAt?: number;
  exit?: number | null;
  resultR?: number | null;
  why?: string;
}

interface DispatchState {
  onDuty: boolean;
  log: SignalHit[];
  flash: SignalHit | null;
  setOnDuty: (on: boolean) => void;
  pushHit: (hit: SignalHit) => void;
  patchHits: (hits: SignalHit[]) => void;
  clearFlash: () => void;
}

export const useDispatchStore = create<DispatchState>()(
  persist(
    (set) => ({
      onDuty: false,
      log: [],
      flash: null,
      setOnDuty: (on) => set({ onDuty: on, flash: on ? null : null }),
      pushHit: (hit) =>
        set((s) => {
          const openSame = s.log.some(
            (h) => (h.status ?? "open") === "open" && h.symbol === hit.symbol && h.action === hit.action,
          );
          if (openSame) return { flash: hit };
          return { flash: hit, log: [{ ...hit, status: "open" as const }, ...s.log].slice(0, 400) };
        }),
      patchHits: (hits) =>
        set((s) => {
          const map = new Map(hits.map((h) => [h.id, h]));
          let changed = false;
          const log = s.log.map((h) => {
            const n = map.get(h.id);
            if (!n) return h;
            if (n.status !== h.status || n.why !== h.why) changed = true;
            return n;
          });
          return changed ? { log } : {};
        }),
      clearFlash: () => set({ flash: null }),
    }),
    {
      name: "stratum-dispatch",
      version: 2,
      partialize: (s) => ({ onDuty: s.onDuty, log: s.log }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<DispatchState>;
        return {
          onDuty: p.onDuty ?? false,
          log: (p.log ?? []).map((h) => ({ ...h, status: h.status ?? "open" })),
          flash: null,
        } as DispatchState;
      },
    },
  ),
);

export function isOpenAction(action: AdviceAction): action is "long" | "short" {
  return action === "long" || action === "short";
}
