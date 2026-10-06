import { useLang } from '../i18n/index.jsx';

export default function LanguageToggle({ className = '' }) {
  const { lang, setLang, t } = useLang();
  return (
    <button
      type="button"
      className={`lang-toggle ${className}`}
      onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
      aria-label={t('Change language')}
    >
      <span className={lang === 'en' ? 'lang-on' : ''}>EN</span>
      <span className={lang === 'vi' ? 'lang-on' : ''}>VI</span>
    </button>
  );
}
