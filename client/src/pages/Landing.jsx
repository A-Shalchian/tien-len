import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PLACE_POINTS, DEFAULT_PENALTIES, sessionStats } from '../utils/scoring.js';
import './landing.css';

const API = `${import.meta.env.VITE_SERVER_URL || ''}/api`;

const SEATS = [
  { x: 0, y: 175, r: 0 },
  { x: 215, y: 0, r: 90 },
  { x: 0, y: -175, r: 180 },
  { x: -215, y: 0, r: -90 },
];
const PER_SEAT = 13;
const DEAL_COUNT = SEATS.length * PER_SEAT;
const HAND = [
  ['3', '♠'], ['4', '♠'], ['5', '♦'], ['6', '♣'], ['7', '♥'], ['8', '♠'], ['9', '♦'],
  ['9', '♥'], ['J', '♣'], ['Q', '♦'], ['K', '♠'], ['A', '♥'], ['2', '♥'],
].map(([rank, suit]) => ({ rank, suit }));

const RED_SUITS = new Set(['♦', '♥']);

function deckPose(i) {
  return { x: 0, y: 0, z: i * 0.35, rz: (i % 3) - 1, rx: 0, ry: 0 };
}

function seatPose(i) {
  const seat = SEATS[i % SEATS.length];
  const k = Math.floor(i / SEATS.length);
  const spread = (k - (PER_SEAT - 1) / 2) * 9;
  const rad = (seat.r * Math.PI) / 180;
  return {
    x: seat.x + spread * Math.cos(rad),
    y: seat.y + spread * Math.sin(rad),
    z: k * 0.5,
    rz: seat.r + ((i * 7) % 5) - 2,
    rx: 0,
    ry: 0,
  };
}

function revealPose(k) {
  const offset = k - (PER_SEAT - 1) / 2;
  return {
    x: offset * 25,
    y: 150 + k * 2,
    z: 72 + k * 2,
    rz: offset * 4.5,
    rx: -58,
    ry: 180,
  };
}

function toTransform({ x, y, z, rz, rx, ry }) {
  return `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateZ(${rz}deg) rotateY(${ry}deg)`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function PlayingCard({ rank, suit, className = '' }) {
  return (
    <span className={`lp-face ${RED_SUITS.has(suit) ? 'lp-red' : ''} ${className}`}>
      <span className="lp-corner">{rank}<br />{suit}</span>
      <span className="lp-pip">{suit}</span>
      <span className="lp-corner lp-corner-flip">{rank}<br />{suit}</span>
    </span>
  );
}

function DealingTable() {
  const cardRefs = useRef([]);

  useEffect(() => {
    const cards = cardRefs.current;
    const poses = cards.map((_, i) => deckPose(i));
    const place = (i, pose) => {
      poses[i] = pose;
      cards[i].style.transform = toTransform(pose);
    };
    const handIndex = (k) => k * SEATS.length;
    const setLive = () => {
      for (let k = 0; k < PER_SEAT; k++) cards[handIndex(k)].classList.add('lp-live');
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let i = 0; i < DEAL_COUNT; i++) place(i, seatPose(i));
      for (let k = 0; k < PER_SEAT; k++) place(handIndex(k), revealPose(k));
      setLive();
      return undefined;
    }

    let cancelled = false;
    const running = [];

    const move = (i, to, options) => {
      const frames = [{ transform: toTransform(poses[i]) }, { transform: toTransform(to) }];
      const animation = cards[i].animate(frames, { fill: 'forwards', ...options });
      running.push(animation);
      poses[i] = to;
      return animation.finished.then(() => {
        if (!cancelled) cards[i].style.transform = toTransform(to);
      });
    };

    const deal = async () => {
      for (let i = 0; i < DEAL_COUNT; i++) place(i, deckPose(i));
      await wait(700);
      if (cancelled) return;

      const deals = [];
      for (let n = 0; n < DEAL_COUNT; n++) {
        const i = DEAL_COUNT - 1 - n;
        deals.push(move(i, seatPose(i), { duration: 520, delay: n * 76, easing: 'cubic-bezier(.22,.8,.3,1)' }));
      }
      await Promise.all(deals);
      if (cancelled) return;
      await wait(350);

      await Promise.all(Array.from({ length: PER_SEAT }, (_, k) => (
        move(handIndex(k), revealPose(k), { duration: 700, delay: k * 40, easing: 'cubic-bezier(.3,1.3,.5,1)' })
      )));
      if (cancelled) return;
      running.forEach((a) => a.cancel());
      setLive();
    };

    deal();
    return () => {
      cancelled = true;
      running.forEach((a) => a.cancel());
    };
  }, []);

  const drag = useRef(null);

  const onPointerDown = (e) => {
    const card = e.currentTarget;
    if (!card.classList.contains('lp-live')) return;
    e.preventDefault();
    const inner = card.firstChild;
    inner.style.transition = 'none';
    inner.style.transform = 'none';
    const center = () => {
      const r = inner.getBoundingClientRect();
      return [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
    };
    const [bx, by] = center();
    inner.style.transform = 'translate3d(100px, 0, 0)';
    const [xx, xy] = center();
    inner.style.transform = 'translate3d(0, 100px, 0)';
    const [yx, yy] = center();
    const a = (xx - bx) / 100;
    const c = (xy - by) / 100;
    const b = (yx - bx) / 100;
    const d = (yy - by) / 100;
    const det = a * d - b * c || 1;
    drag.current = {
      inner,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      tilt: 0,
      inv: [d / det, -b / det, -c / det, a / det],
    };
    inner.style.transform = 'translate3d(0, 0, -40px)';
    card.classList.add('lp-dragging');
    card.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const lx = d.inv[0] * dx + d.inv[1] * dy;
    const ly = d.inv[2] * dx + d.inv[3] * dy;
    d.tilt = Math.max(-16, Math.min(16, d.tilt * 0.8 + (e.clientX - d.lastX) * 0.9));
    d.lastX = e.clientX;
    d.inner.style.transform = `translate3d(${lx}px, ${ly}px, -40px) rotateZ(${d.tilt}deg)`;
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    e.currentTarget.classList.remove('lp-dragging');
    const from = d.inner.style.transform;
    const back = d.inner.animate([
      { transform: from },
      { transform: 'translate3d(0, -10px, -40px)', offset: 0.7 },
      { transform: 'translate3d(0, 0, 0)' },
    ], { duration: 520, easing: 'cubic-bezier(0.25, 0.9, 0.3, 1)' });
    d.inner.style.transform = '';
    back.finished.then(() => { d.inner.style.transition = ''; });
  };

  return (
    <div className="lp-stage" aria-hidden="true">
      <div className="lp-table">
        <div className="lp-felt" />
        {Array.from({ length: DEAL_COUNT }, (_, i) => {
          const handCard = i % SEATS.length === 0 ? HAND[i / SEATS.length] : null;
          return (
            <div
              key={i}
              className="lp-card"
              ref={(el) => { cardRefs.current[i] = el; }}
              onPointerDown={handCard ? onPointerDown : undefined}
              onPointerMove={handCard ? onPointerMove : undefined}
              onPointerUp={handCard ? onPointerUp : undefined}
              onPointerCancel={handCard ? onPointerUp : undefined}
            >
              <div className="lp-card-inner">
                <span className="lp-back" />
                {handCard
                  ? <PlayingCard {...handCard} className="lp-front" />
                  : <span className="lp-face lp-front lp-blank" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniHand({ cards }) {
  return (
    <span className="lp-mini-hand">
      {cards.map(([rank, suit], i) => (
        <PlayingCard key={i} rank={rank} suit={suit} className="lp-mini" />
      ))}
    </span>
  );
}

const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

const PLAYS = [
  { name: 'Single', cards: [['K', '♥']] },
  { name: 'Pair', cards: [['7', '♠'], ['7', '♦']] },
  { name: 'Triple', cards: [['9', '♣'], ['9', '♦'], ['9', '♥']] },
  { name: 'Straight, 3 or more in a row', cards: [['5', '♦'], ['6', '♠'], ['7', '♣']] },
  { name: 'Double straight, 3 or more pairs in a row', cards: [['4', '♠'], ['4', '♥'], ['5', '♣'], ['5', '♦'], ['6', '♠'], ['6', '♥']] },
];

function HowToPlay() {
  return (
    <section className="lp-section" id="how-to-play">
      <h2 className="lp-h2">How to play</h2>
      <p className="lp-lead">
        Four players, thirteen cards each. Get rid of all your cards before everyone else.
      </p>

      <div className="lp-ladder" role="img" aria-label="Card ranks from lowest to highest: 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2">
        {RANKS.map((rank) => (
          <PlayingCard key={rank} rank={rank} suit={rank === '2' ? '♥' : '♠'} className="lp-mini" />
        ))}
      </div>
      <div className="lp-ladder-ends">
        <span>3 is the lowest</span>
        <span>2 is the highest</span>
      </div>
      <p className="lp-text">
        When ranks tie, the suit decides: spades, then clubs, then diamonds, then hearts.
      </p>

      <h3 className="lp-h3">What you can play</h3>
      <ul className="lp-plays">
        {PLAYS.map((play) => (
          <li key={play.name}>
            <MiniHand cards={play.cards} />
            <span>{play.name}</span>
          </li>
        ))}
      </ul>
      <p className="lp-text">
        Beat the cards on the table with the same kind of play and the same number of cards, only higher. If you
        can't or won't, pass. Once you pass you sit out until someone clears the table.
      </p>

      <h3 className="lp-h3">Chops</h3>
      <p className="lp-text">
        A 2 can be chopped. Four of a kind or three pairs in a row beats a single 2. Four pairs in a row beats a pair of 2s.
      </p>

      <h3 className="lp-h3">Who starts</h3>
      <p className="lp-text">
        Whoever holds the 3♠ leads the first game. After that, the last winner leads.
      </p>
    </section>
  );
}

function HouseRules() {
  const place = DEFAULT_PLACE_POINTS[3];
  const p = DEFAULT_PENALTIES;
  const rows = [
    ['Finish 1st, 2nd, 3rd', place.map((v) => (v > 0 ? `+${v}` : v)).join('  ')],
    ['Chop a black 2', `±${p.chopBlack}`],
    ['Chop a red 2', `±${p.chopRed}`],
    ['Last place stuck with a black 2', `±${p.stuckBlack}`],
    ['Last place stuck with a red 2', `±${p.stuckRed}`],
    ['Win with the 3♠ as your last card', `+${p.threeSpadeWin}`],
    ['Cóng, you never played a card', `-${p.cong}`],
    ['Instant win', `+${p.instantWin}`],
  ];
  return (
    <section className="lp-section" id="house-rules">
      <h2 className="lp-h2">Our house rules</h2>
      <p className="lp-lead">
        How we score games at the table. ± means one player gains what the other loses.
      </p>
      <dl className="lp-ledger">
        {rows.map(([label, value]) => (
          <div key={label} className="lp-ledger-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="lp-text lp-muted">You can change every value when you start a session in the score tracker.</p>
    </section>
  );
}

async function loadLeaderboard() {
  const res = await fetch(`${API}/sessions`);
  if (!res.ok) throw new Error();
  const list = await res.json();
  const sessions = await Promise.all(list.map((s) => fetch(`${API}/sessions/${s.id}`).then((r) => r.json())));
  const table = new Map();
  for (const session of sessions) {
    for (const row of sessionStats(session)) {
      const key = row.name.toLocaleLowerCase();
      const entry = table.get(key) || { name: row.name, total: 0, wins: 0, games: 0 };
      entry.total += row.total;
      entry.wins += row.wins;
      entry.games += session.games.length;
      table.set(key, entry);
    }
  }
  return [...table.values()]
    .filter((e) => e.games > 0)
    .sort((a, b) => b.total - a.total || b.wins - a.wins)
    .slice(0, 8);
}

function Leaderboard() {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadLeaderboard().then(setRows).catch(() => setFailed(true));
  }, []);

  return (
    <section className="lp-section" id="leaderboard">
      <h2 className="lp-h2">All-time table</h2>
      <p className="lp-lead">Points from every game recorded in the score tracker.</p>
      {failed && <p className="lp-text">Scores couldn't load because the server isn't reachable. Try again in a minute.</p>}
      {!failed && rows === null && <p className="lp-text lp-muted">Loading scores...</p>}
      {rows?.length === 0 && (
        <p className="lp-text">
          No games recorded yet. <a className="lp-inline-link" href="/scores">Start a session</a> next time you play.
        </p>
      )}
      {rows?.length > 0 && (
        <ol className="lp-board">
          {rows.map((r, i) => (
            <li key={r.name} className={i === 0 ? 'lp-board-first' : ''}>
              <span className="lp-board-pos">{i + 1}</span>
              <span className="lp-board-name">{r.name}</span>
              <span className="lp-board-stat">{r.wins} {r.wins === 1 ? 'win' : 'wins'} in {r.games} {r.games === 1 ? 'game' : 'games'}</span>
              <span className="lp-board-pts">{r.total > 0 ? `+${r.total}` : r.total}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-hero">
        <DealingTable />
        <div className="lp-hero-copy">
          <h1 className="lp-title">Tiến Lên</h1>
          <p className="lp-tagline">
            The Vietnamese card game. Play online with friends, or keep score when you play at the table.
          </p>
          <nav className="lp-ctas">
            <a className="lp-btn lp-btn-gold" href="/play">Play online</a>
            <a className="lp-btn" href="/scores">Keep score</a>
            <a className="lp-btn lp-btn-quiet" href="#how-to-play">How to play</a>
          </nav>
        </div>
      </header>

      <main className="lp-body">
        <HowToPlay />
        <HouseRules />
        <Leaderboard />
      </main>

      <footer className="lp-footer">
        Made for our games with Vy and Thư.
      </footer>
    </div>
  );
}
