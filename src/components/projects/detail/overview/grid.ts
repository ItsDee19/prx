/*
 * Grid of the project Overview tab, shared by the tab and the route's loading.tsx so the
 * skeleton always matches. Cards come from the overview registry (./registry.ts), each in
 * its "main" or "side" column, ordered by `order`. DOM order is the phone reading order:
 * the main stack, then the side stack (SPEC.md section 21.2).
 *
 *   base - xl  one column: main cards, then side cards. This covers 1024-1279 laptops and
 *              tablets too: beside the 256px app sidebar a side column would leave the main
 *              stack only ~360px, so it stays one 704-960px column, and the Details card
 *              lays its rows out in two columns (see DetailsPanel).
 *   xl         main column + side column (20rem, 22rem from 2xl, 24rem from 3xl). The side
 *              stack sits top-right; the main stack takes the rest of the width.
 *   no side    when no side card is visible the main stack spans the full width.
 */

export const OVERVIEW_GRID =
  "grid grid-cols-1 items-start gap-4 sm:gap-6 " +
  "xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem] 3xl:grid-cols-[minmax(0,1fr)_24rem]";

/** The main stack (description, phases, sub-projects, comments, ...). */
export const OVERVIEW_MAIN = "flex min-w-0 flex-col gap-4 sm:gap-6";

/** Main stack when there is no side column at all. */
export const OVERVIEW_MAIN_FULL = "xl:col-span-2";

/**
 * The side stack (details, latest update, go-live, ...). Not sticky: integrations add
 * cards, and a stuck stack taller than the window would hide its lower cards.
 */
export const OVERVIEW_SIDE = "flex min-w-0 flex-col gap-4 sm:gap-6";
