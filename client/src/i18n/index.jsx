import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import vi, { viPatterns } from './vi.js';
import { splitPath, isPublicPath, langFromUrl, localePath } from './routes.js';

const STORAGE_KEY = 'tienlen-lang';
const LangContext = createContext(null);

function saveLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    return;
  }
}

function initialLang(pathname) {
  const fromUrl = langFromUrl(pathname);
  if (fromUrl) return fromUrl;
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

export function LanguageProvider({ pathname = window.location.pathname, children }) {
  const [lang, setLangState] = useState(() => initialLang(pathname));

  const setLang = useCallback((next) => {
    saveLang(next);
    const { path } = splitPath(window.location.pathname);
    if (isPublicPath(path)) {
      window.location.assign(localePath(path, next) + window.location.search + window.location.hash);
      return;
    }
    setLangState(next);
  }, []);

  useEffect(() => {
    const fromUrl = langFromUrl(pathname);
    if (fromUrl) saveLang(fromUrl);
  }, [pathname]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    setLang,
    locale: lang === 'vi' ? 'vi-VN' : 'en-US',
    t: (text, vars) => translate(lang, text, vars),
    href: (target) => localePath(target, lang),
  }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
