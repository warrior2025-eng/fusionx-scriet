"use client";

import { createContext, useContext } from "react";

/** The colours of the day panel (the same on a video tile and on the candidate's card). */
export type StateTone = "green" | "amber" | "red" | "grey";

export const TONE_CLASS: Record<StateTone, string> = {
  green: "border-emerald-600/60 bg-emerald-600/15 text-ink",
  amber: "border-amber-500/70 bg-amber-500/15 text-ink",
  red: "border-red-600/70 bg-red-600/15 text-ink",
  grey: "border-ink/25 bg-ink/5 text-ink/80",
};
/** The tile border for each colour (on black video). */
export const TONE_BORDER: Record<StateTone, string> = {
  green: "ring-2 ring-emerald-500",
  amber: "ring-2 ring-amber-400",
  red: "ring-4 ring-red-500",
  grey: "ring-1 ring-white/30",
};

/** What a candidate's video tile shows on top: their hubs and where they are now. */
export type TileInfo = { hubs: string[]; state: { label: string; tone: StateTone } };

/**
 * Shared by the day room's video grid and its sidebar: which candidate is selected (a click on a tile or a card
 * selects them in both) and what each candidate's tile shows. Booking ids are the candidates' call identities.
 */
export type DayPanelContext = {
  selected: string | null;
  select: (bookingId: string) => void;
  tiles: Record<string, TileInfo>;
  setTiles: (tiles: Record<string, TileInfo>) => void;
};

export const TileContext = createContext<DayPanelContext | null>(null);

export function useDayPanel(): DayPanelContext | null {
  return useContext(TileContext);
}
