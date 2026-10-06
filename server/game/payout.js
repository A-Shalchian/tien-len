import { DEFAULT_PLACE_POINTS, DEFAULT_PENALTIES } from '../../client/src/utils/scoring.js';

export const STAKES_TO_PLAY = 10;

export function onlineRules(playerCount) {
  return { place: DEFAULT_PLACE_POINTS[playerCount], ...DEFAULT_PENALTIES };
}

export function minBalance(stake) {
  return stake * STAKES_TO_PLAY;
}

export function gameChips(deltas, rate) {
  const names = Object.keys(deltas);
  const average = names.reduce((sum, n) => sum + deltas[n], 0) / (names.length || 1);
  return Object.fromEntries(names.map((n) => [n, rate ? Math.round((deltas[n] - average) * rate) : 0]));
}

export function settleChips(points, stake, balances) {
  const chips = gameChips(points, stake);
  let shortfall = 0;
  for (const [id, amount] of Object.entries(chips)) {
    const available = Math.max(balances[id] ?? 0, 0);
    if (-amount > available) {
      shortfall += -amount - available;
      chips[id] = -available;
    }
  }
  const winners = Object.keys(chips).filter((id) => chips[id] > 0);
  const won = winners.reduce((sum, id) => sum + chips[id], 0);
  if (shortfall > 0 && won > 0) {
    let left = Math.min(shortfall, won);
    winners.forEach((id, i) => {
      const cut = i === winners.length - 1 ? left : Math.min(left, Math.round((shortfall * chips[id]) / won));
      chips[id] -= cut;
      left -= cut;
    });
  }
  const drift = Object.values(chips).reduce((sum, n) => sum + n, 0);
  if (drift !== 0) {
    const fix = Object.keys(chips).sort((a, b) => (drift > 0 ? chips[b] - chips[a] : chips[a] - chips[b]))[0];
    chips[fix] -= drift;
  }
  return chips;
}
