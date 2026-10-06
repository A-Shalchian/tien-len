import { useState, useEffect, useCallback, useRef } from 'react';
import Hand from './Hand.jsx';
import OpponentHand from './OpponentHand.jsx';
import Table from './Table.jsx';
import MoneyDisplay from './MoneyDisplay.jsx';
import EmoteBar from './EmoteBar.jsx';
import EmoteOverlay from './EmoteOverlay.jsx';
import { useSound } from '../hooks/useSound.js';
import { formatDelta } from '../utils/scoring.js';
import { useLang } from '../i18n/index.jsx';
import { placeName, chopText, stuckLastText, twosText } from '../i18n/describe.js';

const CONFETTI_COLORS = ['#f0c040', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22'];

function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    bg: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: `${Math.random() * 0.8}s`,
    size: 6 + Math.random() * 6,
  }));

  return (
    <div className="confetti-container">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left,
            backgroundColor: p.bg,
            animationDelay: p.delay,
            width: p.size,
            height: p.size,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}

const INSTANT_WINS = { 'four-twos': 'Four 2s', dragon: 'Dragon (3 to A)' };

function tone(n) {
  return n > 0 ? 'positive' : n < 0 ? 'negative' : '';
}

function handEvents(t, data, name) {
  const events = [];
  if (data.threeSpadeWin) events.push(t('{name} finished with the 3♠', { name: name(data.order[0]) }));
  if (data.stuckLast) events.push(stuckLastText(t, { order: data.order.map(name), stuckLast: data.stuckLast }));
  for (const id of data.cong) events.push(t('{name} never played a card (cóng)', { name: name(id) }));
  for (const chop of data.chops) events.push(chopText(t, { ...chop, by: name(chop.by), victim: name(chop.victim) }));
  return events;
}

function HandResult({ result, myId, waiting, onNext }) {
  const { t } = useLang();
  const { data } = result;
  const name = (id) => result.nicknames[id] || t('Player');
  const winner = data.instantWin || data.order[0];
  const ids = data.instantWin
    ? [winner, ...Object.keys(result.points).filter((id) => id !== winner)]
    : data.order;
  const events = handEvents(t, data, name);
  const myChips = result.chips[myId] ?? 0;

  return (
    <div className="overlay">
      <h2>{winner === myId ? t('You win!') : t('{name} wins', { name: name(winner) })}</h2>
      {data.instantWin && <p className="result-detail">{t('Instant win: {type}', { type: t(INSTANT_WINS[result.instantWinType]) })}</p>}
      <table className="result-table">
        <thead>
          <tr>
            <th>{t('Place')}</th>
            <th>{t('Player')}</th>
            <th>{t('Points')}</th>
            <th>{t('Chips')}</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id, i) => (
            <tr key={id} className={id === myId ? 'result-me' : ''}>
              <td>{data.instantWin && i > 0 ? '-' : placeName(t, i + 1)}</td>
              <td>{id === myId ? t('You') : name(id)}</td>
              <td className={tone(result.points[id])}>{formatDelta(result.points[id])}</td>
              <td className={tone(result.chips[id])}>{formatDelta(result.chips[id])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {events.length > 0 && (
        <ul className="result-events">
          {events.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <div className={`chip-change ${tone(myChips)}`}>{t('{chips} chips', { chips: formatDelta(myChips) })}</div>
      <button className="btn btn-primary" onClick={onNext} disabled={waiting}>
        {waiting ? t('Waiting...') : t('Next Hand')}
      </button>
    </div>
  );
}

const TURN_SECONDS = 25;

function TurnClock({ deadline }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const share = Math.min(1, left / TURN_SECONDS);
  return (
    <span className={`turn-clock ${left <= 5 ? 'turn-clock-low' : ''}`} aria-label={`${left}s`}>
      <span className="turn-clock-bar" style={{ transform: `scaleX(${share})` }} />
      <span className="turn-clock-num">{left}s</span>
    </span>
  );
}

export default function Game({ socket, gameState, setGameState, nicknames, botFlags, myId, playerOrder, rejoinResult, onGameState, onGameStart }) {
  const { t } = useLang();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [handOver, setHandOver] = useState(null);
  const [toast, setToast] = useState(null);
  const [emotes, setEmotes] = useState([]);
  const [kickedInfo, setKickedInfo] = useState(null);
  const [gameOverInfo, setGameOverInfo] = useState(null);
  const [waitingNext, setWaitingNext] = useState(false);
  const [dealing, setDealing] = useState(true);
  const [animatePlay, setAnimatePlay] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const prevTableRef = useRef(null);
  const { playSound, muted, toggleMute } = useSound();
  const prevTurnRef = useRef(null);
  const prevFinishedRef = useRef(0);

  const opponents = playerOrder.filter(id => id !== myId);
  const isMyTurn = gameState.turn === myId;
  const finished = gameState.finished || [];
  const awaySet = new Set([...(gameState.away || []), ...(gameState.idle || [])]);
  const iAmIdle = (gameState.idle || []).includes(myId);
  const myPlace = finished.indexOf(myId) + 1;

  const showToast = useCallback((render, ms = 2500) => {
    setToast(() => render);
    setTimeout(() => setToast(null), ms);
  }, []);

  useEffect(() => {
    if (rejoinResult) setHandOver(rejoinResult);
  }, [rejoinResult]);

  useEffect(() => {
    if (finished.length > prevFinishedRef.current) {
      const id = finished[finished.length - 1];
      const place = finished.length;
      showToast((t) => (id === myId
        ? t('You finished {place}', { place: placeName(t, place) })
        : t('{name} finished {place}', { name: nicknames[id] || t('Player'), place: placeName(t, place) })));
    }
    prevFinishedRef.current = finished.length;
  }, [finished, myId, nicknames, showToast]);

  useEffect(() => {
    if (dealing) {
      const timer = setTimeout(() => setDealing(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [dealing]);

  useEffect(() => {
    const currentTable = gameState.table;
    const prevTable = prevTableRef.current;

    if (currentTable && currentTable.length > 0 && currentTable !== prevTable) {
      const isNew = !prevTable || prevTable.length === 0 ||
        (currentTable[0] && prevTable[0] && currentTable[0].id !== prevTable[0].id);
      if (isNew) {
        setAnimatePlay(true);
        playSound('play');
        const timer = setTimeout(() => setAnimatePlay(false), 500);
        prevTableRef.current = currentTable;
        return () => clearTimeout(timer);
      }
    }
    prevTableRef.current = currentTable;
  }, [gameState.table, playSound]);

  useEffect(() => {
    const currentTurn = gameState.turn;
    if (currentTurn === myId && prevTurnRef.current !== myId && prevTurnRef.current !== null) {
      playSound('turn');
    }
    prevTurnRef.current = currentTurn;
  }, [gameState.turn, myId, playSound]);

  useEffect(() => {
    if (!socket) return;

    const onState = (data) => {
      onGameState(data);
      setSelectedIds(new Set());
    };

    const onStart = (data) => {
      onGameStart(data);
      setSelectedIds(new Set());
      setHandOver(null);
      setWaitingNext(false);
      setDealing(true);
      setShowConfetti(false);
    };

    const onHandOver = (data) => {
      setHandOver(data);
      setSelectedIds(new Set());
      prevFinishedRef.current = 0;
      if ((data.data.instantWin || data.data.order[0]) === myId) {
        setShowConfetti(true);
        playSound('win');
      } else {
        playSound('lose');
      }
    };

    const onInvalidPlay = ({ reason }) => showToast((t) => t(reason), 2000);

    const onEmote = ({ emoteId, from }) => {
      const id = Date.now() + Math.random();
      setEmotes((prev) => [...prev, { id, emoteId, from: 'opponent' }]);
      playSound('emote');
      setTimeout(() => {
        setEmotes((prev) => prev.filter((e) => e.id !== id));
      }, 1500);
    };

    const onPlayerAway = ({ nickname, left }) => showToast(
      (t) => t(left ? '{name} left. A bot is finishing their hand.' : "{name} lost connection. A bot plays until they're back.", { name: nickname }),
      3500,
    );
    const onPlayerBack = ({ nickname }) => showToast((t) => t('{name} is back', { name: nickname }));
    const onTurnTimeout = ({ playerId, nickname, action }) => showToast((t) => {
      if (playerId !== myId) return t('{name} ran out of time', { name: nickname });
      return action === 'pass' ? t("Time's up. You passed.") : t("Time's up. Your lowest card was played.");
    }, 3000);
    const onWaiting = () => setWaitingNext(true);

    const onKicked = (data) => {
      setKickedInfo(data);
      playSound('lose');
    };

    const onGameOver = (data) => {
      setGameOverInfo(data);
    };

    const onPlayerKicked = ({ nickname }) => showToast((t) => t('{name} was removed (not enough chips)', { name: nickname }), 3000);

    const onChop = (chop) => {
      if (chop.by === myId) showToast((t) => t("You chopped {victim}'s {twos}", { victim: chop.victimName, twos: twosText(t, chop) }), 3000);
      else if (chop.victim === myId) showToast((t) => t('{by} chopped your {twos}', { by: chop.byName, twos: twosText(t, chop) }), 3000);
      else showToast((t) => t("{by} chopped {victim}'s {twos}", { by: chop.byName, victim: chop.victimName, twos: twosText(t, chop) }), 3000);
    };

    socket.on('game-state', onState);
    socket.on('game-start', onStart);
    socket.on('hand-over', onHandOver);
    socket.on('invalid-play', onInvalidPlay);
    socket.on('emote', onEmote);
    socket.on('player-away', onPlayerAway);
    socket.on('player-back', onPlayerBack);
    socket.on('turn-timeout', onTurnTimeout);
    socket.on('waiting-for-opponent', onWaiting);
    socket.on('kicked-low-balance', onKicked);
    socket.on('game-over-insufficient', onGameOver);
    socket.on('player-kicked', onPlayerKicked);
    socket.on('chop', onChop);

    return () => {
      socket.off('game-state', onState);
      socket.off('game-start', onStart);
      socket.off('hand-over', onHandOver);
      socket.off('invalid-play', onInvalidPlay);
      socket.off('emote', onEmote);
      socket.off('player-away', onPlayerAway);
      socket.off('player-back', onPlayerBack);
      socket.off('turn-timeout', onTurnTimeout);
      socket.off('waiting-for-opponent', onWaiting);
      socket.off('kicked-low-balance', onKicked);
      socket.off('game-over-insufficient', onGameOver);
      socket.off('player-kicked', onPlayerKicked);
      socket.off('chop', onChop);
    };
  }, [socket, myId, onGameState, onGameStart, playSound, showToast]);

  const toggleCard = useCallback((cardId) => {
    playSound('click');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, [playSound]);

  const handlePlay = () => {
    if (selectedIds.size === 0) return;
    socket.emit('play-cards', { cardIds: Array.from(selectedIds) });
  };

  const handlePass = () => {
    playSound('pass');
    socket.emit('pass');
  };

  const handleNewHand = () => {
    socket.emit('new-hand');
    setWaitingNext(true);
  };

  const sendEmote = (emoteId) => {
    socket.emit('emote', { emoteId });
    const id = Date.now() + Math.random();
    setEmotes((prev) => [...prev, { id, emoteId, from: 'self' }]);
    setTimeout(() => {
      setEmotes((prev) => prev.filter((e) => e.id !== id));
    }, 1500);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Enter' && isMyTurn && !myPlace) {
        e.preventDefault();
        handlePlay();
      } else if (e.key === ' ' && isMyTurn && !myPlace) {
        e.preventDefault();
        if (gameState.table && gameState.table.length > 0) handlePass();
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
      } else if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (gameState.hand && index < gameState.hand.length) {
          toggleCard(gameState.hand[index].id);
        }
      } else if (e.key === '0') {
        const index = 9;
        if (gameState.hand && index < gameState.hand.length) {
          toggleCard(gameState.hand[index].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const myBalance = gameState.balances?.[myId] ?? 0;
  const myNickname = nicknames[myId] || t('You');
  const turnNickname = nicknames[gameState.turn] || t('Unknown');
  const passedSet = new Set(gameState.passedPlayers || []);

  return (
    <div className="game">
      <div className="opponents-area">
        {opponents.map((oppId) => {
          const place = finished.indexOf(oppId) + 1;
          return (
            <div key={oppId} className={`opponent-slot ${gameState.turn === oppId ? 'active-turn' : ''} ${passedSet.has(oppId) || place ? 'passed' : ''}`}>
              <div className="opponent-info">
                <span className="opponent-name">
                  {nicknames[oppId] || t('Player')}
                  {botFlags[oppId] && <span className="bot-badge">{t('BOT')}</span>}
                  {awaySet.has(oppId) && <span className="bot-badge">{t('AWAY')}</span>}
                </span>
                <MoneyDisplay amount={gameState.balances?.[oppId] ?? 0} />
              </div>
              <OpponentHand count={gameState.opponents?.[oppId] ?? 0} />
              {place > 0 && <span className="passed-label place-label">{placeName(t, place)}</span>}
              {!place && passedSet.has(oppId) && <span className="passed-label">{t('Passed')}</span>}
            </div>
          );
        })}
      </div>

      <div className="table-area">
        <button className="mute-btn" onClick={toggleMute}>
          {muted ? '\u{1F507}' : '\u{1F50A}'}
        </button>
        <div className={`turn-indicator ${isMyTurn ? 'your-turn' : ''}`}>
          {myPlace
            ? t('You finished {place}', { place: placeName(t, myPlace) })
            : isMyTurn ? t('Your turn') : t("{name}'s turn", { name: turnNickname })}
          {!myPlace && gameState.turnDeadline && <TurnClock deadline={gameState.turnDeadline} />}
        </div>
        <Table cards={gameState.table} animatePlay={animatePlay} />
      </div>

      <EmoteBar onSend={sendEmote} />

      {iAmIdle && !myPlace && (
        <div className="idle-banner" role="status">
          <span>{t('You missed 2 turns, so a bot is playing for you.')}</span>
          <button className="btn btn-primary" onClick={() => socket.emit('resume')}>{t("I'm back")}</button>
        </div>
      )}

      {isMyTurn && !myPlace && !iAmIdle && (
        <div className="action-bar">
          <button
            className="btn btn-pass"
            onClick={handlePass}
            disabled={!gameState.table || gameState.table.length === 0}
          >
            {t('Pass')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handlePlay}
            disabled={selectedIds.size === 0}
          >
            {selectedIds.size > 0 ? t('Play ({n})', { n: selectedIds.size }) : t('Play')}
          </button>
        </div>
      )}

      <div className="hand-area">
        <div className="hand-info">
          <span className="hand-name">{myNickname}</span>
          <MoneyDisplay amount={myBalance} />
        </div>
        <Hand cards={gameState.hand} selectedIds={selectedIds} onToggle={toggleCard} dealing={dealing} />
      </div>

      {toast && <div className="toast">{toast(t)}</div>}

      {emotes.map((e) => (
        <EmoteOverlay key={e.id} emoteId={e.emoteId} from={e.from} />
      ))}

      {showConfetti && <Confetti />}

      {handOver && <HandResult result={handOver} myId={myId} waiting={waitingNext} onNext={handleNewHand} />}

      {kickedInfo && (
        <div className="disconnected-overlay">
          <h2>{t('Insufficient Chips')}</h2>
          <p>{t('You need at least {needed} chips to continue.', { needed: kickedInfo.needed })}</p>
          <p>{t('Your balance: {balance} chips', { balance: kickedInfo.balance })}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {t('Back to Lobby')}
          </button>
        </div>
      )}

      {gameOverInfo && (
        <div className="disconnected-overlay">
          <h2>{t('Game Over')}</h2>
          <p>{t(gameOverInfo.reason)}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {t('Back to Lobby')}
          </button>
        </div>
      )}
    </div>
  );
}
