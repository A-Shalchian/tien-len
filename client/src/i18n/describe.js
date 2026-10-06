import { DEFAULT_PENALTIES, formatDelta, isLegacyRules } from '../utils/scoring.js';

const PLACES = ['1st', '2nd', '3rd', '4th'];

export function placeName(t, n) {
  return t(PLACES[n - 1] || `${n}th`);
}

export function twosText(t, { black, red }) {
  const parts = [];
  if (black) parts.push(t('{n} black', { n: black }));
  if (red) parts.push(t('{n} red', { n: red }));
  const count = (black || 0) + (red || 0);
  return t(count > 1 ? '{parts} 2s' : '{parts} 2', { parts: parts.join(' + ') });
}

export function chopText(t, chop) {
  if (chop.count !== undefined) return t('{by} chopped {victim}', chop);
  return t("{by} chopped {victim}'s {twos}", { by: chop.by, victim: chop.victim, twos: twosText(t, chop) });
}

export function stuckLastText(t, game) {
  return t('{name} left with {twos}', { name: game.order[game.order.length - 1], twos: twosText(t, game.stuckLast) });
}

export function gameEvents(t, game) {
  const events = [];
  if (game.instantWin) events.push(t('{name} won instantly', { name: game.instantWin }));
  if (game.threeSpadeWin) events.push(t('{name} finished with the 3♠', { name: game.order[0] }));
  if (game.stuckLast) events.push(stuckLastText(t, game));
  for (const [name, n] of Object.entries(game.stuckTwos || {})) events.push(t('{name} was stuck with {n} × 2', { name, n }));
  for (const name of game.cong || []) events.push(t('{name} never played a card (cóng)', { name }));
  for (const chop of game.chops || []) events.push(chopText(t, chop));
  return events;
}

export function rulesText(t, rules) {
  const place = t('Places {list}', { list: rules.place.map(formatDelta).join(' / ') });
  if (isLegacyRules(rules)) {
    return [
      place,
      t('stuck 2 {n}', { n: rules.stuckTwo }),
      t('chop {n}', { n: rules.chop }),
      t('cóng {n}', { n: rules.cong }),
      t('instant win {n}', { n: rules.instantWin }),
    ].join(' · ');
  }
  return [
    place,
    t('chop black 2 ±{n}', { n: rules.chopBlack }),
    t('chop red 2 ±{n}', { n: rules.chopRed }),
    t('2s left black ±{black} red ±{red}', {
      black: rules.stuckBlack ?? DEFAULT_PENALTIES.stuckBlack,
      red: rules.stuckRed ?? DEFAULT_PENALTIES.stuckRed,
    }),
    t('3♠ win +{n}', { n: rules.threeSpadeWin ?? DEFAULT_PENALTIES.threeSpadeWin }),
    t('cóng -{n}', { n: rules.cong }),
    t('instant win +{n}', { n: rules.instantWin }),
  ].join(' · ');
}

export function formatDateTime(locale, value, withTime = false) {
  const date = new Date(value);
  return withTime
    ? date.toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}
