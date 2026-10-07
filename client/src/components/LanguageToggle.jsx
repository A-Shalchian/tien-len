import { useLang } from '../i18n/index.jsx';
import { localePath } from '../i18n/routes.js';

export default function LanguageToggle({ className = '' }) {
  const { lang, setLang, t, path } = useLang();
  const next = lang === 'vi' ? 'en' : 'vi';
  return (
    <a
      className={`lang-toggle ${className}`}
      href={localePath(path, next)}
      hrefLang={next}
      aria-label={t('Change language')}
      onClick={(e) => {
        e.preventDefault();
        setLang(next);
      }}
    >
      <span className={lang === 'en' ? 'lang-on' : ''}>EN</span>
      <span className={lang === 'vi' ? 'lang-on' : ''}>VI</span>
    </a>
  );
}
