import { identifyCombo, canBeat, isBomb } from './validator.js';
import { sortCards, rankValue, cardValue } from './deck.js';

const BOT_NAMES = [
  'Minh', 'Lan', 'Hoa', 'Duc', 'Thao',
  'Phong', 'Linh', 'Tuan', 'Mai', 'Khoa',
];
const TWO = 12;
const ACE = 11;

let botCounter = 0;

function createBotId() {
  return `bot_${Date.now()}_${botCounter++}`;
}

function pickBotName(usedNames) {
  const available = BOT_NAMES.filter((n) => !usedNames.includes(n));
  if (available.length === 0) return `Bot${Math.floor(Math.random() * 99)}`;
  return available[Math.floor(Math.random() * available.length)];
}

const isTwo = (c) => c.rank === '2';
const isThreeSpades = (c) => c.rank === '3' && c.suit === 'S';
const comboKey = (combo) => combo.cards.map((c) => c.id).sort().join(',');

function byRank(cards) {
  const groups = new Map();
  for (const c of sortCards(cards)) {
    const r = rankValue(c.rank);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(c);
  }
  return groups;
}

function longestRun(pool, minPerRank) {
  const groups = byRank(pool);
  let best = [];
  let run = [];
  for (let r = 0; r < TWO; r++) {
    if ((groups.get(r)?.length || 0) >= minPerRank) {
      run.push(r);
      if (run.length > best.length) best = [...run];
    } else {
      run = [];
    }
  }
  return { ranks: best, groups };
}

function take(pool, cards) {
  return pool.filter((c) => !cards.includes(c));
}

function takeQuads(pool, units) {
  for (const [r, cards] of byRank(pool)) {
    if (cards.length === 4 && r !== TWO) {
      units.push(identifyCombo(cards));
      pool = take(pool, cards);
    }
  }
  return pool;
}

function takeRuns(pool, units, minPerRank, minLength) {
  for (;;) {
    const { ranks, groups } = longestRun(pool, minPerRank);
    if (ranks.length < minLength) return pool;
    const cards = ranks.flatMap((r) => groups.get(r).slice(-minPerRank));
    units.push(identifyCombo(cards));
    pool = take(pool, cards);
  }
}

function takeGroups(pool, units, minSize = 1) {
  for (const cards of byRank(pool).values()) {
    if (cards.length < minSize) continue;
    units.push(identifyCombo(cards));
    pool = take(pool, cards);
  }
  return pool;
}

function planScore(units) {
  const lowSingles = units.filter((u) => u.type === 'single' && rankValue(u.high.rank) < 7).length;
  return units.length * 10 + lowSingles * 3;
}

function planHand(hand) {
  const strategies = [
    (pool, units) => takeGroups(takeRuns(pool, units, 1, 3), units),
    (pool, units) => takeGroups(takeRuns(takeGroups(pool, units, 2), units, 1, 3), units),
    (pool, units) => takeGroups(takeRuns(pool, units, 1, 5), units),
  ];
  let best = null;
  for (const strategy of strategies) {
    const units = [];
    const pool = takeRuns(takeQuads(sortCards(hand), units), units, 2, 3);
    strategy(pool, units);
    if (!best || planScore(units) < planScore(best)) best = units;
  }
  return best;
}

function generateAllCombos(hand) {
  const combos = [];
  const groups = byRank(hand);
  for (const cards of groups.values()) {
    for (let i = 0; i < cards.length; i++) {
      combos.push(identifyCombo([cards[i]]));
      for (let j = i + 1; j < cards.length; j++) {
        combos.push(identifyCombo([cards[i], cards[j]]));
        for (let k = j + 1; k < cards.length; k++) combos.push(identifyCombo([cards[i], cards[j], cards[k]]));
      }
    }
    if (cards.length === 4) combos.push(identifyCombo(cards));
  }

  const ranks = [...groups.keys()].filter((r) => r !== TWO).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    for (let j = i; j < ranks.length && ranks[j] === ranks[i] + (j - i); j++) {
      const span = ranks.slice(i, j + 1);
      if (span.length >= 3) {
        const low = span.map((r) => groups.get(r)[0]);
        combos.push(identifyCombo(low));
        const top = groups.get(span[span.length - 1]);
        if (top.length > 1) combos.push(identifyCombo([...low.slice(0, -1), top[top.length - 1]]));
      }
      const pairs = span.every((r) => groups.get(r).length >= 2);
      if (pairs && span.length >= 3) {
        combos.push(identifyCombo(span.flatMap((r) => groups.get(r).slice(-2))));
      }
    }
  }
  return combos.filter(Boolean);
}

function isBoss(unit) {
  return isBomb(unit) || unit.cards.some(isTwo) || (unit.type === 'single' && rankValue(unit.high.rank) >= ACE);
}

function chooseLead(hand, plan, ctx) {
  if (ctx.mustPlay3S) {
    return plan.find((u) => u.cards.some(isThreeSpades)) || identifyCombo([hand.find(isThreeSpades)]);
  }
  if (plan.length === 1) return plan[0];

  const bosses = plan.filter(isBoss);
  if (plan.length === 2 && bosses.length > 0) return bosses[0];

  let options = plan.filter((u) => !isBoss(u));
  if (!options.length) options = plan.filter((u) => !isBomb(u));
  if (!options.length) options = plan;

  if (ctx.minOpponent <= 1) {
    const multi = options.filter((u) => u.type !== 'single');
    if (multi.length) options = multi;
    else return identifyCombo([sortCards(hand)[hand.length - 1]]);
  }

  return [...options].sort((a, b) => cardValue(a.high) - cardValue(b.high) || b.cards.length - a.cards.length)[0];
}

function breakCost(combo, plan) {
  const used = new Set(combo.cards.map((c) => c.id));
  let cost = 0;
  for (const unit of plan) {
    const overlap = unit.cards.filter((c) => used.has(c.id)).length;
    if (overlap === 0 || overlap === unit.cards.length) continue;
    cost += unit.type === 'sequence' || unit.type === 'double-sequence' || unit.type === 'four-of-a-kind' ? 10 : 6;
  }
  return cost;
}

function chooseResponse(hand, plan, table, ctx) {
  const candidates = generateAllCombos(hand).filter((c) => canBeat(c, table));
  if (!candidates.length) return null;

  const finishing = candidates.find((c) => c.cards.length === hand.length);
  if (finishing) return finishing;

  const units = new Set(plan.map(comboKey));
  const chopping = table.high.rank === '2' || ctx.tableChopped;
  const headsUp = ctx.opponentCount === 1;
  const urgent = ctx.minOpponent <= (headsUp ? 4 : 2) || ctx.ownerCards <= 2;

  let best = null;
  let bestCost = Infinity;
  for (const c of candidates) {
    let cost = rankValue(c.high.rank);
    if (!units.has(comboKey(c))) cost += breakCost(c, plan);
    if (isBomb(c)) cost += chopping ? -30 : 15;
    else cost += 12 * c.cards.filter(isTwo).length;
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }

  const limit = urgent ? 45 : headsUp ? 30 : plan.length <= 3 ? 26 : ctx.opponentCount === 2 ? 22 : 16;
  return bestCost <= limit ? best : null;
}

function findBotPlay(hand, tableCombo, ctx = {}) {
  if (!hand.length) return null;
  const context = {
    mustPlay3S: Boolean(ctx.mustPlay3S),
    minOpponent: Math.min(13, ...(ctx.opponents || [])),
    opponentCount: (ctx.opponents || []).length,
    ownerCards: ctx.ownerCards ?? 13,
    tableChopped: Boolean(ctx.tableChopped),
  };
  const plan = planHand(hand);
  return tableCombo ? chooseResponse(hand, plan, tableCombo, context) : chooseLead(hand, plan, context);
}

export { createBotId, pickBotName, findBotPlay, planHand };
