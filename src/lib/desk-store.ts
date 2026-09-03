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
  structure: boolean;
}

interface DeskState {
  symbol: string;
  timeframe: Timeframe;
  autoAnalyze: boolean;
  soundOn: boolean;
  voiceOn: boolean;
  overlays: OverlayFlags;
  chochLen: 2 | 3 | 4;
  chochClose: boolean;
  spreads: Record<string, number>;
  setSymbol: (id: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  setAutoAnalyze: (on: boolean) => void;
  setSoundOn: (on: boolean) => void;
  setVoiceOn: (on: boolean) => void;
  toggleOverlay: (key: keyof OverlayFlags) => void;
  setChochLen: (n: 2 | 3 | 4) => void;
  setChochClose: (on: boolean) => void;
  setSpread: (id: string, spread: number) => void;
}

const ALLOWED = new Set(SYMBOLS.map((s) => s.id));

export const useDeskStore = create<DeskState>()(
  persist(
    (set) => ({
      symbol: "EURUSD",
      timeframe: "1h",
      autoAnalyze: true,
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
        structure: true,
      },
      chochLen: 3,
      chochClose: true,
      spreads: Object.fromEntries(SYMBOLS.map((s) => [s.id, s.spread])),
      setSymbol: (id) => set({ symbol: id }),
      setTimeframe: (tf) => set({ timeframe: tf }),
      setAutoAnalyze: (on) => set({ autoAnalyze: on }),
      setSoundOn: (on) => set({ soundOn: on }),
      setVoiceOn: (on) => set({ voiceOn: on }),
      toggleOverlay: (key) => set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] } })),
      setChochLen: (n) => set({ chochLen: n }),
      setChochClose: (on) => set({ chochClose: on }),
      setSpread: (id, spread) => set((s) => ({ spreads: { ...s.spreads, [id]: spread } })),
    }),
    {
      name: "stratum-desk",
      version: 10,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<DeskState>;
        const symbol = p.symbol && ALLOWED.has(p.symbol) ? p.symbol : "EURUSD";
        const spreads = { ...Object.fromEntries(SYMBOLS.map((s) => [s.id, s.spread])), ...(p.spreads ?? {}) };
        const len = p.chochLen === 2 || p.chochLen === 4 ? p.chochLen : 3;
        return {
          ...p,
          symbol,
          spreads,
          autoAnalyze: true,
          soundOn: p.soundOn ?? true,
          voiceOn: p.voiceOn ?? true,
          chochLen: len,
          chochClose: p.chochClose ?? true,
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
            structure: true,
            ...p.overlays,
          },
        } as DeskState;
      },
    },
  ),
);
