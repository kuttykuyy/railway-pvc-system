/**
 * Instant-bill mode creates a bill with no click. It should PAUSE at the item-by-item vs
 * grouped comparison only when the choice actually matters:
 *   - the work is composite (no single class fits every sub-work), or
 *   - grouping under one class would move the PVC by 1% or more (and at least Rs 1).
 * Otherwise it proceeds to create the bill item-by-item straight away.
 *
 * Pure so the decision is unit-tested independently of the React effect that calls it.
 */
export interface InstantPreviewShape {
  totalPvc?: number | null;
  singleClassification?: {
    best?: { total?: number | null } | null;
    composite?: unknown;
  } | null;
}

export interface InstantDecision {
  pause: boolean;
  reason: 'composite' | 'material' | null;
}

/** How much the grouped total must differ from item-by-item to be worth a pause. */
export const INSTANT_MATERIAL_FRACTION = 0.01; // 1%

export function decideInstantPause(preview: InstantPreviewShape | null | undefined): InstantDecision {
  if (!preview) return { pause: false, reason: null };

  const composite = !!preview.singleClassification?.composite;
  if (composite) return { pause: true, reason: 'composite' };

  const itemTotal = Number(preview.totalPvc ?? 0);
  const groupedTotal = Number(preview.singleClassification?.best?.total ?? itemTotal);
  const diff = Math.abs(groupedTotal - itemTotal);
  const material = diff >= 1 && diff >= Math.abs(itemTotal) * INSTANT_MATERIAL_FRACTION;
  if (material) return { pause: true, reason: 'material' };

  return { pause: false, reason: null };
}
