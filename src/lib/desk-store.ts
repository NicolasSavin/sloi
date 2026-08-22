import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SYMBOLS } from "@/lib/market/symbols";
import type { Timeframe } from "@/lib/market/types";

export interface OverlayFlags {
  fvg: boolean;
  ob: boolean;
  liquidity: boolean;
  profile: boolean;
  waves: boolean;
  divergences: boolean;
  margin: boolean;
  patterns: boolean;
  flow: boolean;
}

interface DeskState {
  symbol: string;
  timeframe: Timeframe;
  autoAnalyze: boolean;
  soundOn: boolean;
  voiceOn: boolean;
  overlays: OverlayFlags;
  spreads: Record<string, number>;
  setSymbol: (id: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  setAutoAnalyze: (on: boolean) => void;
  setSoundOn: (on: boolean) => void;
  setVoiceOn: (on: boolean) => void;
  toggleOverlay: (key: keyof OverlayFlags) => void;
  setSpread: (id: string, spread: number) => void;
}

const ALLOWED = new Set(SYMBOLS.map((s) => s.id));

export const useDeskStore = create<DeskState>()(
  persist(
    (set) => ({
      symbol: "EURUSD",
      timeframe: "1h",
      autoAnalyze: false,
      soundOn: true,
      voiceOn: true,
      overlays: {
        fvg: true,
        ob: true,
        liquidity: true,
        profile: true,
        waves: false,
        divergences: true,
        margin: true,
        patterns: true,
        flow: true,
      },
      spreads: Object.fromEntries(SYMBOLS.map((s) => [s.id, s.spread])),
      setSymbol: (id) => set({ symbol: id }),
      setTimeframe: (tf) => set({ timeframe: tf }),
      setAutoAnalyze: (on) => set({ autoAnalyze: on }),
      setSoundOn: (on) => set({ soundOn: on }),
      setVoiceOn: (on) => set({ voiceOn: on }),
      toggleOverlay: (key) =>
        set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] } })),
      setSpread: (id, spread) =>
        set((s) => ({ spreads: { ...s.spreads, [id]: spread } })),
    }),
    {
      name: "stratum-desk",
      version: 8,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<DeskState>;
        const symbol = p.symbol && ALLOWED.has(p.symbol) ? p.symbol : "EURUSD";
        const spreads = { ...Object.fromEntries(SYMBOLS.map((s) => [s.id, s.spread])), ...(p.spreads ?? {}) };
        return {
          ...p,
          symbol,
          spreads,
          soundOn: p.soundOn ?? true,
          voiceOn: p.voiceOn ?? true,
          overlays: {
            fvg: true,
            ob: true,
            liquidity: true,
            profile: true,
            waves: false,
            divergences: true,
            margin: true,
            patterns: true,
            flow: true,
            ...p.overlays,
          },
        } as DeskState;
      },
    },
  ),
);
