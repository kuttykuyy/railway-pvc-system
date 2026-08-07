/**
 * Whether the app derives cement out of DSR/USSOR work items.
 *
 * It does not. A DSR item's rate already includes its cement, and the item's own work
 * classification already carries a cement share under the GCC component table. Pulling
 * that cement into a "C" sub-classification prices the same cement through the cement
 * index a second time and takes it out of the class meant to carry it. "C" is for
 * cement supplied as an item in its own right, which comes from the bill, not from a
 * coefficient.
 *
 * The machinery is kept — the coefficient table, the calculator component, the split
 * and its reverse — because an agreement may yet be read the other way, and because
 * bills already carrying a split still need the undo on the edit page. Flip this to
 * true to offer it again.
 */
export const CEMENT_DERIVATION_ENABLED = false;
