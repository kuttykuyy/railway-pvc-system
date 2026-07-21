
/**
 * Validation Message Component
 * Displays validation errors and warnings with clear, user-friendly messages
 */

'use client';

import { AlertTriangle, XCircle, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ValidationMessageProps {
  type: 'error' | 'warning' | 'info' | 'success';
  messages: string[];
  className?: string;
}

export function ValidationMessage({ type, messages, className }: ValidationMessageProps) {
  if (messages.length === 0) return null;

  const styles = {
    error: {
      container: 'bg-red-50 border-red-300 text-red-900',
      icon: <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />,
      title: 'Please Fix These Issues:'
    },
    warning: {
      container: 'bg-amber-50 border-amber-300 text-amber-900',
      icon: <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />,
      title: 'Please Review:'
    },
    info: {
      container: 'bg-emerald-50 border-emerald-300 text-emerald-900',
      icon: <Info className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />,
      title: 'Information:'
    },
    success: {
      container: 'bg-green-50 border-green-300 text-green-900',
      icon: <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />,
      title: 'Success:'
    }
  };

  const style = styles[type];

  return (
    <div className={cn('rounded-lg border p-4', style.container, className)}>
      <div className="flex items-start gap-3">
        {style.icon}
        <div className="flex-1 space-y-2">
          <p className="font-semibold text-base">{style.title}</p>
          {messages.length === 1 ? (
            <p className="text-sm whitespace-pre-wrap">{messages[0]}</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((message, index) => (
                <li key={index} className="text-sm flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-current flex-shrink-0" />
                  <span className="flex-1 whitespace-pre-wrap">{message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
