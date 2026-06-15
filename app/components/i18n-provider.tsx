'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations } from '@/lib/i18n/translations';

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  // Load language from localStorage after mount to avoid server hydration issues
  useEffect(() => {
    try {
      const stored = localStorage.getItem('app-language') as Language;
      if (stored === 'en' || stored === 'hi') {
        setLanguageState(stored);
      }
    } catch (e) {
      console.error('Failed to load language from localStorage', e);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('app-language', lang);
    } catch (e) {
      console.error('Failed to save language to localStorage', e);
    }
  };

  const t = (key: string): string => {
    const langDict = translations[language] || translations['en'];
    return (langDict as any)[key] || (translations['en'] as any)[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
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
