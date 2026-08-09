import { FileUp, Keyboard, Send } from 'lucide-react';

/**
 * How a record came into being — typed, read from a PDF, or sent through Telegram.
 *
 * The first question asked of a figure someone doubts is "where did this come from?",
 * and the answer decides what to do about it: a typed figure is checked against the
 * document, an extracted one against the extraction. The app always knew (it prices a
 * PDF-read bill differently from a typed one) but spent the fact and forgot it, so the
 * screens could not say.
 *
 * Records created before the origin was stored show nothing rather than a guess —
 * "manual" would be a claim nobody made.
 */
export function CreatedViaBadge({ createdVia, className = '' }: { createdVia?: string | null; className?: string }) {
  if (!createdVia) return null;

  const config = {
    pdf: {
      label: 'From PDF',
      title: 'Filled by reading an uploaded PDF — check the figures against the document',
      icon: FileUp,
      classes: 'bg-violet-50 text-violet-700 border-violet-200',
    },
    telegram: {
      label: 'Telegram',
      title: 'Created through the Telegram bot from an uploaded PDF',
      icon: Send,
      classes: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    manual: {
      label: 'Typed in',
      title: 'Entered by hand',
      icon: Keyboard,
      classes: 'bg-slate-100 text-slate-600 border-slate-200',
    },
  }[createdVia] ?? null;

  if (!config) return null;
  const Icon = config.icon;

  return (
    <span
      title={config.title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${config.classes} ${className}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
