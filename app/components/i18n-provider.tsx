'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Language, translations } from '@/lib/i18n/translations';

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** Set the language from context (e.g. a contract's zone) WITHOUT overriding an explicit
   *  user choice, and without persisting — a per-page default, not a preference. */
  setLanguageAuto: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  // Whether the user has explicitly picked a language this session (or in a past one, via
  // localStorage). An explicit choice always wins over a zone default.
  const explicitRef = useRef(false);

  // Load language from localStorage after mount to avoid server hydration issues
  useEffect(() => {
    try {
      const stored = localStorage.getItem('app-language') as Language;
      if (stored === 'en' || stored === 'hi') {
        setLanguageState(stored);
        explicitRef.current = true;
      }
    } catch (e) {
      console.error('Failed to load language from localStorage', e);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    explicitRef.current = true;
    setLanguageState(lang);
    try {
      localStorage.setItem('app-language', lang);
    } catch (e) {
      console.error('Failed to save language to localStorage', e);
    }
  };

  const setLanguageAuto = (lang: Language) => {
    // The user's own choice is sacred; only apply a zone default when none was made.
    if (explicitRef.current) return;
    setLanguageState(prev => (prev === lang ? prev : lang));
  };

  const t = (key: string): string => {
    const langDict = translations[language] || translations['en'];
    return (langDict as any)[key] || (translations['en'] as any)[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, setLanguageAuto, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
