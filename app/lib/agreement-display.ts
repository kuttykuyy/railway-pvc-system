/**
 * A contract created by a Telegram guest (not linked to a web account) is stored with a
 * namespace suffix on its agreement number — "<realNo> · tg:<chatId>" — so two different
 * guests' contracts that happen to share an agreement number do not collide on the unique
 * key. That suffix is a storage detail; it must never appear on a document or screen.
 *
 * This is the one place that strips it for display. Any report generator, page or export
 * that shows an agreement number should pass it through here, so the Telegram chat id can
 * never leak onto a PVC statement or into a shared PDF.
 */
export function displayAgreementNo(stored: string | null | undefined): string {
  return String(stored || '').replace(/\s*·\s*tg:\S+$/i, '').trim();
}
