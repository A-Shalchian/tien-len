import { useEffect, useRef, useState } from 'react';
import { getMe, signIn, signOut } from '../utils/api.js';
import { cached } from '../utils/offline.js';
import { useLang } from '../i18n/index.jsx';
import LanguageToggle from './LanguageToggle.jsx';

const LINKS = [
  { href: '/play', label: 'Play online', active: (path) => path === '/play' || path.startsWith('/room/') },
  { href: '/scores', label: 'Score tracker', active: (path) => path.startsWith('/scores') },
];

const MENU = [
  { href: '/profile', label: 'Profile' },
  { href: '/profile?tab=online', label: 'Online games' },
  { href: '/profile?tab=chips', label: 'Chip history' },
  { href: '/profile?tab=settings', label: 'Settings' },
];

function initials(name) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function UserMenu({ me }) {
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { user } = me;

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const avatar = user.image
    ? <img className="nav-avatar" src={user.image} alt="" referrerPolicy="no-referrer" />
    : <span className="nav-avatar nav-initials">{initials(user.name)}</span>;

  return (
    <div className="nav-user" ref={ref}>
      <button
        type="button"
        className="nav-user-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('Account menu')}
        onClick={() => setOpen(!open)}
      >
        {avatar}
        <span className="nav-name">{user.name}</span>
        <svg className={`nav-caret ${open ? 'nav-caret-open' : ''}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="nav-menu" role="menu">
          <div className="nav-menu-head">
            {avatar}
            <div className="nav-menu-who">
              <span className="nav-menu-name">{user.name}</span>
              {typeof me.balance === 'number' && (
                <span className="nav-chips">{t('{n} chips', { n: me.balance.toLocaleString(locale) })}</span>
              )}
            </div>
          </div>
          {MENU.map((item) => (
            <a key={item.href} role="menuitem" className="nav-menu-item" href={item.href}>{t(item.label)}</a>
          ))}
          <button type="button" role="menuitem" className="nav-menu-item nav-menu-signout" onClick={signOut}>
            {t('Sign out')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function NavBar({ path, theme = 'dark' }) {
  const { t } = useLang();
  const [me, setMe] = useState(() => cached('me'));

  useEffect(() => {
    const load = () => getMe().then(setMe).catch(() => {});
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  return (
    <nav className={`nav nav-${theme}`}>
      <a className="nav-brand" href="/">Tiến Lên</a>
      <div className="nav-links">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className={`nav-link ${link.active(path) ? 'nav-on' : ''}`}>
            {t(link.label)}
          </a>
        ))}
      </div>
      <div className="nav-right">
        <LanguageToggle className="nav-lang" />
        {me?.user && <UserMenu me={me} />}
        {me && !me.user && (
          <button type="button" className="nav-signin" onClick={() => signIn()}>{t('Sign in')}</button>
        )}
      </div>
    </nav>
  );
}
