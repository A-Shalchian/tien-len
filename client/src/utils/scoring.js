export const DEFAULT_PLACE_POINTS = {
  2: [1, 0],
  3: [2, 1, 0],
  4: [3, 2, 1, 0],
};

export const DEFAULT_PENALTIES = {
  chopBlack: 1,
  chopRed: 2,
  stuckBlack: 1,
  stuckRed: 2,
  cong: 1,
  instantWin: 3,
  threeSpadeWin: 2,
};

export function isLegacyRules(rules) {
  return rules.stuckTwo !== undefined;
}

export function chopAmount(chop, rules) {
  if (isLegacyRules(rules)) return rules.chop * (chop.count || 1);
  return rules.chopBlack * (chop.black || 0) + rules.chopRed * (chop.red || 0);
}

export function stuckLastAmount(stuck, rules) {
  const black = rules.stuckBlack ?? DEFAULT_PENALTIES.stuckBlack;
  const red = rules.stuckRed ?? DEFAULT_PENALTIES.stuckRed;
  return black * (stuck.black || 0) + red * (stuck.red || 0);
}

export function gameDeltas(game, players, rules) {
  const deltas = Object.fromEntries(players.map((p) => [p, 0]));
  const legacy = isLegacyRules(rules);

  if (game.instantWin) {
    if (!legacy) {
      deltas[game.instantWin] += rules.instantWin;
      return deltas;
    }
    for (const p of players) {
      if (p === game.instantWin) continue;
      deltas[p] -= rules.instantWin;
      deltas[game.instantWin] += rules.instantWin;
    }
    return deltas;
  }

  const winner = game.order[0];
  game.order.forEach((p, i) => {
    deltas[p] += rules.place[i] ?? 0;
  });
  if (!legacy && game.threeSpadeWin) {
    deltas[winner] += rules.threeSpadeWin ?? DEFAULT_PENALTIES.threeSpadeWin;
  }
  if (!legacy && game.stuckLast && game.order.length > 1) {
    const last = game.order[game.order.length - 1];
    const above = game.order[game.order.length - 2];
    const amount = stuckLastAmount(game.stuckLast, rules);
    deltas[last] -= amount;
    deltas[above] += amount;
  }
  if (legacy) {
    for (const [p, count] of Object.entries(game.stuckTwos || {})) {
      deltas[p] -= rules.stuckTwo * count;
      deltas[winner] += rules.stuckTwo * count;
    }
  }
  for (const p of game.cong || []) {
    deltas[p] -= rules.cong;
    if (legacy) deltas[winner] += rules.cong;
  }
  for (const chop of game.chops || []) {
    const amount = chopAmount(chop, rules);
    deltas[chop.victim] -= amount;
    deltas[chop.by] += amount;
  }
  return deltas;
}

export function renamePlayers(game, rename) {
  return {
    ...game,
    order: (game.order || []).map(rename),
    instantWin: game.instantWin ? rename(game.instantWin) : null,
    cong: (game.cong || []).map(rename),
    chops: (game.chops || []).map((c) => ({ ...c, by: rename(c.by), victim: rename(c.victim) })),
    stuckTwos: Object.fromEntries(Object.entries(game.stuckTwos || {}).map(([k, v]) => [rename(k), v])),
  };
}

export function sessionStats(session) {
  const { players, rules, games } = session;
  const stats = Object.fromEntries(players.map((p) => [p, {
    name: p,
    total: 0,
    wins: 0,
    last: 0,
    placeSum: 0,
    chopsMade: 0,
    cong: 0,
  }]));

  for (const game of games) {
    const deltas = gameDeltas(game, players, game.rules || rules);
    for (const p of players) stats[p].total += deltas[p];

    if (game.instantWin) {
      stats[game.instantWin].wins += 1;
      for (const p of players) {
        stats[p].placeSum += p === game.instantWin ? 1 : players.length;
        if (p !== game.instantWin) stats[p].last += 1;
      }
      continue;
    }

    game.order.forEach((p, i) => {
      stats[p].placeSum += i + 1;
    });
    stats[game.order[0]].wins += 1;
    stats[game.order[game.order.length - 1]].last += 1;
    for (const p of game.cong || []) stats[p].cong += 1;
    for (const chop of game.chops || []) stats[chop.by].chopsMade += 1;
  }

  return players
    .map((p) => ({
      ...stats[p],
      avgPlace: games.length ? stats[p].placeSum / games.length : null,
    }))
    .sort((a, b) => b.total - a.total || b.wins - a.wins);
}

export function describeTwos({ black, red }) {
  const parts = [];
  if (black) parts.push(`${black} black`);
  if (red) parts.push(`${red} red`);
  return `${parts.join(' + ')} 2${(black || 0) + (red || 0) > 1 ? 's' : ''}`;
}

export function describeChop(chop) {
  if (chop.count !== undefined) return `${chop.by} chopped ${chop.victim}`;
  return `${chop.by} chopped ${chop.victim}'s ${describeTwos(chop)}`;
}

export function describeStuckLast(game) {
  const last = game.order[game.order.length - 1];
  return `${last} left with ${describeTwos(game.stuckLast)}`;
}

export function rulesSummary(rules) {
  const place = `Places ${rules.place.map(formatDelta).join(' / ')}`;
  if (isLegacyRules(rules)) {
    return `${place} · stuck 2 ${rules.stuckTwo} · chop ${rules.chop} · cóng ${rules.cong} · instant win ${rules.instantWin}`;
  }
  const stuckBlack = rules.stuckBlack ?? DEFAULT_PENALTIES.stuckBlack;
  const stuckRed = rules.stuckRed ?? DEFAULT_PENALTIES.stuckRed;
  return `${place} · chop black 2 ±${rules.chopBlack} · chop red 2 ±${rules.chopRed} · 2s left black ±${stuckBlack} red ±${stuckRed} · 3♠ win +${rules.threeSpadeWin ?? DEFAULT_PENALTIES.threeSpadeWin} · cóng -${rules.cong} · instant win +${rules.instantWin}`;
}

export function formatDelta(n) {
  return n > 0 ? `+${n}` : String(n);
}

export function ordinal(n) {
  return ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`;
}
