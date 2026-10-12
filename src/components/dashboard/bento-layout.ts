/*
 * Bento placement (Home). Columns: 1 below md, 2 from md, 3 from xl, 4 from 3xl.
 * The health strip spans the full row; the Today tile spans two columns (and,
 * when it has tasks, two rows from xl). Every other tile is one cell, except
 * the last one (Recent activity), which stretches to fill whatever is left of
 * its row so the grid never ends with a hole. Class names are literal so
 * Tailwind generates them.
 */

export const FULL_ROW_CLASS = "col-span-full";

/** Today with tasks: full row on md, a 2 x 2 block from xl. */
export const TODAY_TILE_CLASS = "md:col-span-2 xl:row-span-2";
/** Today without tasks: two columns, one row (its empty state needs no height). */
export const TODAY_TILE_COMPACT_CLASS = "md:col-span-2";

const MD_SPAN: Record<number, string> = { 1: "md:col-span-1", 2: "md:col-span-2" };
const XL_SPAN: Record<number, string> = { 1: "xl:col-span-1", 2: "xl:col-span-2", 3: "xl:col-span-3" };
const XXXL_SPAN: Record<number, string> = {
  1: "3xl:col-span-1",
  2: "3xl:col-span-2",
  3: "3xl:col-span-3",
  4: "3xl:col-span-4",
};

/**
 * Columns the closing tile needs to finish its row in a `columns`-wide grid
 * where the Today block (2 columns x `todayRows` rows) comes first and
 * `singles` one-cell tiles follow it (filling the cells beside it first).
 */
function closingSpan(singles: number, columns: number, todayRows: number): number {
  const besideWidth = columns - 2;
  const besideCells = besideWidth * todayRows;
  if (singles >= besideCells) {
    const left = (columns - ((singles - besideCells) % columns)) % columns;
    return left === 0 ? columns : left;
  }
  // Still beside the Today block: fill what is left of that row.
  return besideWidth - (singles % besideWidth);
}

/** Span classes for the closing tile after `singles` one-cell tiles that follow the Today tile. */
export function closingTileClass(singles: number, todayRows: 1 | 2 = 2): string {
  const count = Math.max(0, Math.floor(singles));
  const md = count % 2 === 0 ? 2 : 1;
  const xl = closingSpan(count, 3, todayRows);
  const xxxl = closingSpan(count, 4, todayRows);
  return [MD_SPAN[md], XL_SPAN[xl], XXXL_SPAN[xxxl]].join(" ");
}
