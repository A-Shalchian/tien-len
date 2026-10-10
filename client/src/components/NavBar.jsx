import { useEffect, useRef, useState } from 'react';
import { api, getMe, signIn, signOut } from '../utils/api.js';
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

function waitText(at, t) {
  const minutes = Math.max(1, Math.floor((new Date(at) - Date.now()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return t('{d}d {h}h', { d: days, h: hours });
  if (hours) return t('{h}h {m}m', { h: hours, m: minutes % 60 });
  return t('{m}m', { m: minutes });
}

const ready = (at) => !at || new Date(at) <= Date.now();

function canClaim({ claims, balance }) {
  if (!claims) return false;
  return ready(claims.dailyAt) || (balance < claims.refillBelow && ready(claims.refillAt));
}

function ChipClaims({ me, onClaimed }) {
  const { t, locale } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { claims, balance } = me;
  const n = (value) => value.toLocaleString(locale);

  const claim = async (path) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api(path, { method: 'POST', body: {} });
      onClaimed({ balance: result.balance, claims: result.claims });
    } catch (err) {
      if (err.data?.claims) onClaimed({ balance: err.data.balance, claims: err.data.claims });
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const option = (at, path, label, wait) => (ready(at) ? (
    <button type="button" role="menuitem" className="nav-menu-item nav-claim" disabled={busy} onClick={() => claim(path)}>
      {label}
    </button>
  ) : (
    <p className="nav-claim-wait">{wait}</p>
  ));

  return (
    <div className="nav-claims">
      {option(
        claims.dailyAt,
        '/me/claim-daily',
        t('Claim {n} chips', { n: n(claims.daily) }),
        t('Next {n} chips in {time}', { n: n(claims.daily), time: claims.dailyAt && waitText(claims.dailyAt, t) }),
      )}
      {balance < claims.refillBelow && option(
        claims.refillAt,
        '/me/refill',
        t('Refill {n} chips', { n: n(claims.refill) }),
        t('Refill {n} chips in {time}', { n: n(claims.refill), time: claims.refillAt && waitText(claims.refillAt, t) }),
      )}
      {error && <p className="nav-claim-error" role="alert">{t(error)}</p>}
    </div>
  );
}

function UserMenu({ me, onClaimed }) {
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
        aria-label={canClaim(me) ? t('Account menu, chips ready to claim') : t('Account menu')}
        onClick={() => setOpen(!open)}
      >
        {avatar}
        {canClaim(me) && <span className="nav-dot" aria-hidden="true" />}
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
          {me.claims && <ChipClaims me={me} onClaimed={onClaimed} />}
          {MENU.map((item) => (
            <a key={item.href} role="menuitem" className="nav-menu-item" href={item.href}>{t(item.label)}</a>
          ))}
          {me.isAdmin && <a role="menuitem" className="nav-menu-item" href="/admin">{t('Admin')}</a>}
          <div className="nav-menu-lang">
            <span>{t('Language')}</span>
            <LanguageToggle className="nav-lang" />
          </div>
          <button type="button" role="menuitem" className="nav-menu-item nav-menu-signout" onClick={signOut}>
            {t('Sign out')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function NavBar({ path, theme = 'dark' }) {
  const { t, href } = useLang();
  const [me, setMe] = useState(null);

  useEffect(() => {
    setMe(cached('me'));
    const load = () => getMe().then(setMe).catch(() => {});
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  const onClaimed = (chips) => {
    setMe((current) => ({ ...current, ...chips }));
    window.dispatchEvent(new CustomEvent('chips-changed', { detail: chips }));
  };

  return (
    <nav className={`nav nav-${theme}`}>
      <a className="nav-brand" href={href('/')}>Tiến Lên</a>
      <div className="nav-links">
        {LINKS.map((link) => (
          <a key={link.href} href={href(link.href)} className={`nav-link ${link.active(path) ? 'nav-on' : ''}`}>
            {t(link.label)}
          </a>
        ))}
      </div>
      <div className="nav-right">
        {!me?.user && <LanguageToggle className="nav-lang" />}
        {me?.user && <UserMenu me={me} onClaimed={onClaimed} />}
        {me && !me.user && (
          <button type="button" className="nav-signin" onClick={() => signIn()}>{t('Sign in')}</button>
        )}
      </div>
    </nav>
  );
}
