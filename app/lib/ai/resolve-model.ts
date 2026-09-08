/**
 * Resolve which model an Abacus (RouteLLM) call uses. Server-only: it pulls in
 * model-spec.ts, which uses node:async_hooks, so it must never be imported from a
 * module that can end up in a client bundle (that is why this does not live in
 * admin-settings.ts, which client pages reach through wpi-series).
 *
 * Order: a per-call pin from withModelSpec() > the AI_MODEL admin setting (changed
 * from the admin page, no redeploy) > the BILL_AI_MODEL env var > the hardcoded default.
 */
import { getAdminSetting } from '@/lib/admin-settings';
import { pinnedModelSpec, isAnthropicSpec, abacusModelName, DEFAULT_MODEL_SPEC } from './model-spec';

export async function getAiModel(): Promise<string> {
  const pinned = pinnedModelSpec();
  if (pinned) return isAnthropicSpec(pinned) ? DEFAULT_MODEL_SPEC : pinned;
  try {
    const fromAdmin = await getAdminSetting('AI_MODEL', '');
    if (fromAdmin && String(fromAdmin).trim()) return String(fromAdmin).trim();
  } catch { /* fall through to env / default */ }
  return abacusModelName();
}
