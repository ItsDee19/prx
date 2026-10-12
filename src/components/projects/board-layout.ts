/**
 * Layout classes shared by the project board (client) and the /projects
 * loading skeleton (server). Plain module so both can import real strings.
 *
 * Track: bleeds to the page edges below 2xl (matching the app container's
 * px-4 / sm:px-6 / lg:px-8 padding) so scrolled columns slide under the edge
 * instead of being clipped by the padding; scroll-padding keeps snapped
 * columns aligned with the page content. From 2xl the five columns always
 * fit, so the track sits inside the container like any other block.
 */
export const BOARD_TRACK_CLASS =
  "relative -mx-4 flex gap-3 px-4 pb-4 scroll-px-4 " +
  "sm:-mx-6 sm:px-6 sm:scroll-px-6 " +
  "lg:-mx-8 lg:px-8 lg:scroll-px-8 " +
  "2xl:mx-0 2xl:gap-4 2xl:px-0 2xl:scroll-px-0";

/**
 * Column widths:
 * - phones: ~85% of the screen so one column is in focus and the next peeks;
 * - sm: fixed 18rem (two columns on a 640-767px screen);
 * - md and up: fluid (flex-1, basis 0) with a 12.25rem floor, so the five
 *   columns share the row with no horizontal scrolling once the main column
 *   is about 1030px wide (a 1366px laptop with the sidebar and up) and scroll
 *   with snap below that.
 */
export const BOARD_COLUMN_CLASS =
  "w-[min(20rem,85vw)] shrink-0 snap-start sm:w-72 md:w-auto md:min-w-[12.25rem] md:flex-1 md:basis-0";
