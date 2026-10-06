import { useEffect, useState } from 'react';
import { getMe, signIn } from '../utils/api.js';
import { cached } from '../utils/offline.js';
import { useLang } from '../i18n/index.jsx';
import LanguageToggle from './LanguageToggle.jsx';

const LINKS = [
  { href: '/play', label: 'Play online', active: (path) => path === '/play' || path.startsWith('/room/') },
  { href: '/scores', label: 'Score tracker', active: (path) => path.startsWith('/scores') },
];

export default function NavBar({ path }) {
  const { t, locale } = useLang();
  const [me, setMe] = useState(() => cached('me'));

  useEffect(() => {
    const load = () => getMe().then(setMe).catch(() => {});
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  const user = me?.user;
  const onProfile = path === '/profile' || (user && path === `/u/${user.id}`);

  return (
    <nav className="nav">
      <a className="nav-brand" href="/">Tiến Lên</a>
      <div className="nav-links">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className={`nav-link ${link.active(path) ? 'nav-on' : ''}`}>
            {t(link.label)}
          </a>
        ))}
      </div>
      <div className="nav-right">
        {user && (
          <a href="/profile" className={`nav-link nav-account ${onProfile ? 'nav-on' : ''}`}>
            {user.image && <img className="nav-avatar" src={user.image} alt="" referrerPolicy="no-referrer" />}
            <span className="nav-name">{user.name}</span>
            <span className="nav-short">{t('Profile')}</span>
            {typeof me.balance === 'number' && (
              <span className="nav-chips">{t('{n} chips', { n: me.balance.toLocaleString(locale) })}</span>
            )}
          </a>
        )}
        {me && !user && (
          <button type="button" className="nav-link nav-button" onClick={() => signIn()}>{t('Sign in')}</button>
        )}
        <LanguageToggle />
      </div>
    </nav>
  );
}
