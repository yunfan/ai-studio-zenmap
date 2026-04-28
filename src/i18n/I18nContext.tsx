import React, { createContext, useContext, useState, useEffect } from 'react';
import en from './en.json';
import zh from './zh.json';

type ValidLocale = 'en' | 'zh';
type Translations = typeof en;

const translations = { en, zh };

interface I18nContextProps {
  t: (key: keyof Translations) => string;
  locale: ValidLocale;
  setLocale: (locale: ValidLocale) => void;
}

const I18nContext = createContext<I18nContextProps | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<ValidLocale>(() => {
    return navigator.language.startsWith('zh') ? 'zh' : 'en';
  });

  const setLocale = (newLocale: ValidLocale) => {
    setLocaleState(newLocale);
  };

  const t = (key: keyof Translations) => {
    return translations[locale][key] || key;
  };

  return (
    <I18nContext.Provider value={{ t, locale, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useTranslation must be used within I18nProvider');
  return context;
};
