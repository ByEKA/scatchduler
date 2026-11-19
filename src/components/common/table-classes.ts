/** The header cells of the app's tables: small, muted, upper-case labels (spec §6.6). */
export const TABLE_HEADER_CELL_CLASSES =
  'text-left text-2xs font-medium tracking-[0.04em] text-muted-foreground uppercase';

/**
 * A row's main link stretches over the row through its ::after box, so the whole row is the link.
 * Keyboard focus draws the 2 px outline on that box instead of the link text: inside the row and
 * with the panel's radius, so the panel's rounded overflow clip never cuts it. The ::after sets its
 * own outline style, apart from the link's outline-hidden. The row needs `relative`.
 */
export const ROW_LINK_CLASSES =
  'block truncate text-sm font-medium outline-hidden after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-solid focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring';
