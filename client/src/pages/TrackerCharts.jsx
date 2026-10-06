import { useMemo, useRef, useState } from 'react';
import { gameDeltas, formatDelta } from '../utils/scoring.js';

const WIDTH = 520;
const HEIGHT = 220;
const PAD = { top: 14, right: 92, bottom: 28, left: 38 };
const LABEL_GAP = 16;

function niceTicks(min, max, count = 4) {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => s >= raw) || Math.ceil(raw / 100) * 100;
  const ticks = [Math.floor(min / step) * step];
  while (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function spreadLabels(items, top, bottom) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    sorted[i].y = Math.max(sorted[i].y, sorted[i - 1].y + LABEL_GAP);
  }
  const overflow = sorted.length ? sorted[sorted.length - 1].y - bottom : 0;
  if (overflow > 0) for (const item of sorted) item.y = Math.max(top, item.y - overflow);
  return sorted;
}

export function PointsChart({ session }) {
  const { players, games, rules } = session;
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const series = useMemo(() => {
    const totals = Object.fromEntries(players.map((p) => [p, [0]]));
    for (const game of games) {
      const deltas = gameDeltas(game, players, game.rules || rules);
      for (const p of players) totals[p].push(totals[p][totals[p].length - 1] + deltas[p]);
    }
    return players.map((p, i) => ({ name: p, slot: i + 1, values: totals[p] }));
  }, [players, games, rules]);

  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const steps = games.length;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (steps ? (i / steps) * innerW : 0);
  const y = (v) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const xEvery = Math.max(1, Math.ceil(steps / 8));

  const labels = spreadLabels(
    series.map((s) => ({ ...s, y: y(s.values[steps]) })),
    PAD.top,
    PAD.top + innerH,
  );

  const track = (event) => {
    const box = svgRef.current.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    const sx = ((point.clientX - box.left) / box.width) * WIDTH;
    const i = Math.round(((sx - PAD.left) / innerW) * steps);
    setHover(Math.min(steps, Math.max(0, i)));
  };

  return (
    <section className="st-card tc-card">
      <h2 className="st-h2 st-h2-flush">Points over time</h2>
      <div className="tc-legend">
        {series.map((s) => (
          <span key={s.name} className="tc-legend-item">
            <span className={`tc-swatch tc-series-${s.slot}`} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="tc-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="tc-svg"
          role="img"
          aria-label={`Running points after each of ${steps} games`}
          onMouseMove={track}
          onTouchStart={track}
          onTouchMove={track}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} className={t === 0 ? 'tc-zero' : 'tc-grid'} />
              <text x={PAD.left - 6} y={y(t)} className="tc-axis" textAnchor="end" dominantBaseline="middle">
                {formatDelta(t)}
              </text>
            </g>
          ))}
          {Array.from({ length: steps + 1 }, (_, i) => i).filter((i) => i % xEvery === 0 || i === steps).map((i) => (
            <text key={i} x={x(i)} y={HEIGHT - 8} className="tc-axis" textAnchor="middle">{i}</text>
          ))}
          {series.map((s) => (
            <polyline
              key={s.name}
              className={`tc-line tc-stroke-${s.slot}`}
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            />
          ))}
          {labels.map((s) => (
            <text key={s.name} x={x(steps) + 8} y={s.y} className="tc-label" dominantBaseline="middle">
              {s.name} {formatDelta(s.values[steps])}
            </text>
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="tc-crosshair" />
              {series.map((s) => (
                <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r="4" className={`tc-dot tc-fill-${s.slot}`} />
              ))}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div
            className="tc-tooltip"
            style={{ left: `${(x(hover) / WIDTH) * 100}%`, transform: `translateX(${hover > steps / 2 ? '-105%' : '5%'})` }}
          >
            <div className="tc-tooltip-title">{hover === 0 ? 'Start' : `After game ${hover}`}</div>
            {[...series].sort((a, b) => b.values[hover] - a.values[hover]).map((s) => (
              <div key={s.name} className="tc-tooltip-row">
                <span className={`tc-swatch tc-series-${s.slot}`} />
                <span>{s.name}</span>
                <span className="tc-tooltip-value">{formatDelta(s.values[hover])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function placeIndex(game, player) {
  if (game.instantWin) return player === game.instantWin ? 0 : null;
  return game.order.indexOf(player);
}

export function HeadToHead({ session }) {
  const { players, games } = session;
  const record = useMemo(() => {
    const r = {};
    for (const a of players) for (const b of players) r[`${a}|${b}`] = 0;
    for (const game of games) {
      for (const a of players) {
        for (const b of players) {
          if (a === b) continue;
          const pa = placeIndex(game, a);
          const pb = placeIndex(game, b);
          if (pa === null && pb === null) continue;
          if (pb === null || (pa !== null && pa < pb)) r[`${a}|${b}`] += 1;
        }
      }
    }
    return r;
  }, [players, games]);

  return (
    <section className="st-card tc-card">
      <h2 className="st-h2 st-h2-flush">Head to head</h2>
      <p className="st-small st-muted">Games each player finished above the other.</p>
      <table className="st-table tc-h2h">
        <thead>
          <tr>
            <th className="st-left" />
            {players.map((p) => <th key={p}>vs {p}</th>)}
          </tr>
        </thead>
        <tbody>
          {players.map((a) => (
            <tr key={a}>
              <td className="st-left st-strong">{a}</td>
              {players.map((b) => (
                <td key={b} className={a === b ? 'st-muted' : ''}>
                  {a === b ? '-' : `${record[`${a}|${b}`]}-${record[`${b}|${a}`]}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
