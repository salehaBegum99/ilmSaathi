import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'en' | 'hi' | 'ur';

const copy = {
  en: { explore: 'Explore educators', teach: 'Teach with us', login: 'Log in', headline: 'Learn what moves your life forward.', subhead: 'Private, live one-to-one learning with women educators you can trust.' },
  hi: { explore: 'शिक्षक खोजें', teach: 'हमारे साथ पढ़ाएँ', login: 'लॉग इन', headline: 'वह सीखें जो आपकी ज़िंदगी को आगे बढ़ाए।', subhead: 'भरोसेमंद महिला शिक्षकों के साथ निजी, लाइव वन-टू-वन लर्निंग।' },
  ur: { explore: 'اساتذہ تلاش کریں', teach: 'ہمارے ساتھ پڑھائیں', login: 'لاگ اِن', headline: 'وہ سیکھیں جو آپ کی زندگی کو آگے بڑھائے۔', subhead: 'قابلِ اعتماد خواتین اساتذہ کے ساتھ نجی، براہِ راست ون ٹو ون تعلیم۔' }
};

interface LocaleValue { locale: Locale; setLocale: (locale: Locale) => void; t: typeof copy.en }
const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      const stored = localStorage.getItem('ilmsaathi-locale');
      return stored === 'en' || stored === 'hi' || stored === 'ur' ? stored : 'en';
    } catch {
      return 'en';
    }
  });
  useEffect(() => {
    try { localStorage.setItem('ilmsaathi-locale', locale); } catch { /* Storage can be blocked. */ }
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ur' ? 'rtl' : 'ltr';
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: copy[locale] }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used within LocaleProvider');
  return value;
}
