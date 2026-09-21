import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en, type MessageCatalog } from './locales/en';
import { ko } from './locales/ko';

export type Locale = 'en' | 'ko';

export const LOCALES: { id: Locale; label: string; nativeLabel: string }[] = [
  { id: 'en', label: 'English', nativeLabel: 'English' },
  { id: 'ko', label: 'Korean', nativeLabel: '한국어' },
];

const STORAGE_KEY = 'dpot.locale';
const DEFAULT_LOCALE: Locale = 'en';

const catalogs: Record<Locale, MessageCatalog> = { en, ko };

type Params = Record<string, string | number>;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, params?: Params) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'en' || raw === 'ko') return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

function lookup(messages: MessageCatalog, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = messages;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] != null ? String(params[name]) : `{${name}}`,
  );
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'ko' ? 'ko' : 'en';
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Params) => {
      const from = lookup(catalogs[locale], key) ?? lookup(catalogs.en, key) ?? key;
      return interpolate(from, params);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

export function useT() {
  return useLocale().t;
}
