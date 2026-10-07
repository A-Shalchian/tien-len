import { lazy, Suspense } from 'react';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';
import NavBar from './components/NavBar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { splitPath, isPublicPath } from './i18n/routes.js';

const GameApp = lazy(() => import('./GameApp.jsx'));
const ScoreTracker = lazy(() => import('./pages/ScoreTracker.jsx'));
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const Terms = lazy(() => import('./pages/Terms.jsx'));
const Rules = lazy(() => import('./pages/Rules.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const EmoteReview = lazy(() => import('./pages/EmoteReview.jsx'));

const ROOM_PATH = /^\/room\/[A-Z0-9]{4}$/i;
const SCORES_PATH = /^\/scores(\/join\/[a-f0-9]+|\/[a-f0-9]+)?$/;

function Page({ path }) {
  if (path === '/' || path === '') return <Landing />;
  if (path === '/privacy') return <Privacy />;
  if (path === '/terms') return <Terms />;
  if (path === '/rules') return <Rules />;
  if (SCORES_PATH.test(path)) return <ScoreTracker />;
  if (path === '/profile') return <Profile />;
  if (path === '/admin') return <Admin />;
  if (path === '/admin/emotes') return <EmoteReview />;
  const profileMatch = path.match(/^\/u\/([A-Za-z0-9_-]+)$/);
  if (profileMatch) return <Profile userId={profileMatch[1]} />;
  if (path === '/play' || ROOM_PATH.test(path)) return <GameApp />;
  return <NotFound />;
}

const DARK_PAGES = ['/play'];

export default function App({ pathname = window.location.pathname }) {
  const { prefixed, path } = splitPath(pathname);
  const known = !prefixed || isPublicPath(path);
  return (
    <div className="app-shell">
      <ErrorBoundary fallback={<nav className="nav"><a className="nav-brand" href="/">Tiến Lên</a></nav>}>
        <NavBar path={path} theme={DARK_PAGES.includes(path) || path.startsWith('/room/') ? 'dark' : 'lacquer'} />
      </ErrorBoundary>
      <main className="app-main">
        <ErrorBoundary>
          <Suspense fallback={null}>
            {known ? <Page path={path} /> : <NotFound />}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
