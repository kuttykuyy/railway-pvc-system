'use client';

import { useState } from 'react';
import { HelpCircle, X, ChevronRight, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpTip {
  title: string;
  content: string;
}

interface ContextualHelpProps {
  tips: HelpTip[];
  className?: string;
}

export function ContextualHelp({ tips, className }: ContextualHelpProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || tips.length === 0) return null;

  return (
    <div className={cn('mb-4', className)}>
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-800 transition-colors bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-2 border border-emerald-200"
        >
          <Lightbulb className="h-4 w-4" />
          <span>Need help? Click for tips</span>
          <ChevronRight className="h-3 w-3" />
        </button>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-emerald-900 text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Quick Tips
            </h4>
            <button onClick={() => setDismissed(true)} className="text-emerald-400 hover:text-emerald-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            {tips.map((tip, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-emerald-800">{tip.title}:</span>{' '}
                <span className="text-emerald-700">{tip.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
