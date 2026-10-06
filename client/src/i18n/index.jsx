import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import vi, { viPatterns } from './vi.js';

const STORAGE_KEY = 'tienlen-lang';
const LangContext = createContext(null);

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    return 'en';
  }
  return navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function translate(lang, text, vars) {
  if (typeof text !== 'string') return text;
  if (lang !== 'vi') return fill(text, vars);
  if (vi[text] !== undefined) return fill(vi[text], vars);
  for (const [pattern, replacement] of viPatterns) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return fill(text, vars);
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    setLang,
    locale: lang === 'vi' ? 'vi-VN' : 'en-US',
    t: (text, vars) => translate(lang, text, vars),
  }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
