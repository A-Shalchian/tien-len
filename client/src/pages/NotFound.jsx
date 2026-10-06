import { useLang } from '../i18n/index.jsx';
import './landing.css';

export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="lp">
      <div className="lp-page">
        <h1 className="lp-h2 lp-legal-title">{t('Page not found')}</h1>
        <p className="lp-lead">{t("This page doesn't exist. The link may be old or mistyped.")}</p>
        <nav className="lp-ctas">
          <a className="lp-btn lp-btn-gold" href="/">{t('Go to the home page')}</a>
          <a className="lp-btn" href="/play">{t('Play online')}</a>
        </nav>
      </div>
    </div>
  );
}
