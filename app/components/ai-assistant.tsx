'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  X,
  Send,
  Minimize2,
  Maximize2,
  Sparkles,
  RotateCcw,
  ArrowRight,
  FileText,
  Building2,
  Calculator,
  TrendingUp,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_ACTIONS = [
  { label: 'How to create a bill?', icon: FileText },
  { label: 'How to add a contract?', icon: Building2 },
  { label: 'What is PVC calculation?', icon: Calculator },
  { label: 'How to check price indices?', icon: TrendingUp },
];

const PAGE_HINTS: Record<string, string> = {
  '/dashboard': 'I see you\'re on the Dashboard. Need help understanding any of the stats here?',
  '/bills': 'You\'re on the Bills page. I can help you create a new bill or understand existing ones.',
  '/bills/new': 'Creating a new bill? I can guide you step by step!',
  '/contracts': 'You\'re managing contracts. Need help adding a new one or editing details?',
  '/contracts/new': 'Setting up a new contract? Let me walk you through it.',
  '/indices/view': 'These are the current price indices. Ask me what any index means!',
  '/class-analyzer': 'The Classification Analyzer helps find the right work classification. Tell me your work type and I\'ll help.',
  '/reports/abstract': 'Need help generating or understanding Bill Abstract reports?',
};

export function AIAssistant() {
  const { status } = useSession();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  // Don't show for unauthenticated users
  if (status !== 'authenticated') return null;

  const getWelcomeMessage = (): string => {
    const hint = PAGE_HINTS[pathname] || '';
    const base = 'Hi! I\'m your PVC Assistant. I can help you with creating bills, managing contracts, understanding calculations, and more.';
    return hint ? `${base}\n\n💡 ${hint}` : base;
  };

  const handleOpen = () => {
    setIsOpen(true);
    setIsMinimized(false);
    if (messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: getWelcomeMessage(),
        timestamp: new Date(),
      }]);
    }
  };

  const handleSend = async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || isLoading) return;

    setHasInteracted(true);
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msgText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const apiMessages = messages
        .filter(m => m.id !== 'welcome')
        .concat(userMsg)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          context: { currentPage: pathname },
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: err?.message || 'Sorry, I couldn\'t process that. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: getWelcomeMessage(),
      timestamp: new Date(),
    }]);
    setHasInteracted(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
        <Button
          onClick={handleOpen}
          className="h-14 w-14 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-xl hover:shadow-2xl transition-all duration-300 group"
          size="icon"
          aria-label="Open AI Assistant"
        >
          <Bot className="h-6 w-6 group-hover:scale-110 transition-transform" />
        </Button>
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
        </span>
      </div>
    );
  }

  // Minimized state
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
        <div
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 rounded-full shadow-xl cursor-pointer hover:shadow-2xl transition-all"
        >
          <Bot className="h-5 w-5" />
          <span className="text-sm font-medium">PVC Assistant</span>
          <Maximize2 className="h-4 w-4 ml-1" />
        </div>
      </div>
    );
  }

  // Full chat window
  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6 w-[calc(100vw-2rem)] sm:w-[400px] max-h-[80vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <div>
            <h4 className="font-semibold text-sm">PVC Assistant</h4>
            <p className="text-[10px] text-purple-200">AI-powered help</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasInteracted && (
            <button onClick={handleReset} className="p-1.5 rounded-lg hover:bg-white/20 transition" title="New conversation">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => setIsMinimized(true)} className="p-1.5 rounded-lg hover:bg-white/20 transition" title="Minimize">
            <Minimize2 className="h-4 w-4" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20 transition" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[250px] max-h-[50vh]">
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-purple-600 text-white rounded-br-md'
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              )}
            >
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking...
              </div>
            </div>
          </div>
        )}

        {/* Quick actions (only if no interaction yet) */}
        {!hasInteracted && messages.length <= 1 && (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-gray-400 font-medium px-1">Quick questions:</p>
            <div className="grid grid-cols-1 gap-1.5">
              {QUICK_ACTIONS.map((action, i) => {
                const Icon = action.icon;
                return (
                  <button
                    key={i}
                    onClick={() => handleSend(action.label)}
                    className="flex items-center gap-2 text-left text-sm px-3 py-2 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors group"
                  >
                    <Icon className="h-4 w-4 text-purple-500 shrink-0" />
                    <span className="text-gray-700 group-hover:text-purple-700">{action.label}</span>
                    <ArrowRight className="h-3 w-3 ml-auto text-gray-300 group-hover:text-purple-500 transition" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about PVC..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent max-h-20 overflow-y-auto"
            style={{ minHeight: '38px' }}
          />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-[38px] w-[38px] rounded-xl bg-purple-600 hover:bg-purple-700 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">AI responses may not always be accurate. Verify important details.</p>
      </div>
    </div>
  );
}
