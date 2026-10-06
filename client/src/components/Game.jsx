import { useState, useEffect, useCallback, useRef } from 'react';
import Hand from './Hand.jsx';
import OpponentHand from './OpponentHand.jsx';
import Table from './Table.jsx';
import MoneyDisplay from './MoneyDisplay.jsx';
import EmoteBar from './EmoteBar.jsx';
import EmoteOverlay from './EmoteOverlay.jsx';
import { useSound } from '../hooks/useSound.js';
import { ordinal, formatDelta, describeChop, describeStuckLast, describeTwos } from '../utils/scoring.js';

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

function handEvents(data, name) {
  const events = [];
  if (data.threeSpadeWin) events.push(`${name(data.order[0])} finished with the 3♠`);
  if (data.stuckLast) events.push(describeStuckLast({ order: data.order.map(name), stuckLast: data.stuckLast }));
  for (const id of data.cong) events.push(`${name(id)} never played a card (cóng)`);
  for (const chop of data.chops) events.push(describeChop({ ...chop, by: name(chop.by), victim: name(chop.victim) }));
  return events;
}

function HandResult({ result, myId, waiting, onNext }) {
  const { data } = result;
  const name = (id) => result.nicknames[id] || 'Player';
  const winner = data.instantWin || data.order[0];
  const ids = data.instantWin
    ? [winner, ...Object.keys(result.points).filter((id) => id !== winner)]
    : data.order;
  const events = handEvents(data, name);
  const myChips = result.chips[myId] ?? 0;

  return (
    <div className="overlay">
      <h2>{winner === myId ? 'You win!' : `${name(winner)} wins`}</h2>
      {data.instantWin && <p className="result-detail">Instant win: {INSTANT_WINS[result.instantWinType]}</p>}
      <table className="result-table">
        <thead>
          <tr>
            <th>Place</th>
            <th>Player</th>
            <th>Points</th>
            <th>Chips</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id, i) => (
            <tr key={id} className={id === myId ? 'result-me' : ''}>
              <td>{data.instantWin && i > 0 ? '-' : ordinal(i + 1)}</td>
              <td>{id === myId ? 'You' : name(id)}</td>
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
      <div className={`chip-change ${tone(myChips)}`}>{formatDelta(myChips)} chips</div>
      <button className="btn btn-primary" onClick={onNext} disabled={waiting}>
        {waiting ? 'Waiting...' : 'Next Hand'}
      </button>
    </div>
  );
}

export default function Game({ socket, gameState, setGameState, nicknames, botFlags, myId, playerOrder, rejoinResult, onGameState, onGameStart }) {
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
  const awaySet = new Set(gameState.away || []);
  const myPlace = finished.indexOf(myId) + 1;

  const showToast = useCallback((msg, ms = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }, []);

  useEffect(() => {
    if (rejoinResult) setHandOver(rejoinResult);
  }, [rejoinResult]);

  useEffect(() => {
    if (finished.length > prevFinishedRef.current) {
      const id = finished[finished.length - 1];
      showToast(`${id === myId ? 'You' : nicknames[id] || 'Player'} finished ${ordinal(finished.length)}`);
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

    const onInvalidPlay = ({ reason }) => showToast(reason, 2000);

    const onEmote = ({ emoteId, from }) => {
      const id = Date.now() + Math.random();
      setEmotes((prev) => [...prev, { id, emoteId, from: 'opponent' }]);
      playSound('emote');
      setTimeout(() => {
        setEmotes((prev) => prev.filter((e) => e.id !== id));
      }, 1500);
    };

    const onPlayerAway = ({ nickname, left }) => showToast(
      left ? `${nickname} left. A bot is finishing their hand.` : `${nickname} lost connection. A bot plays until they're back.`,
      3500,
    );
    const onPlayerBack = ({ nickname }) => showToast(`${nickname} is back`);
    const onWaiting = () => setWaitingNext(true);

    const onKicked = (data) => {
      setKickedInfo(data);
      playSound('lose');
    };

    const onGameOver = (data) => {
      setGameOverInfo(data);
    };

    const onPlayerKicked = ({ nickname }) => showToast(`${nickname} was removed (not enough chips)`, 3000);

    const onChop = (chop) => {
      const twos = describeTwos(chop);
      if (chop.by === myId) showToast(`You chopped ${chop.victimName}'s ${twos}`, 3000);
      else if (chop.victim === myId) showToast(`${chop.byName} chopped your ${twos}`, 3000);
      else showToast(`${chop.byName} chopped ${chop.victimName}'s ${twos}`, 3000);
    };

    socket.on('game-state', onState);
    socket.on('game-start', onStart);
    socket.on('hand-over', onHandOver);
    socket.on('invalid-play', onInvalidPlay);
    socket.on('emote', onEmote);
    socket.on('player-away', onPlayerAway);
    socket.on('player-back', onPlayerBack);
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
  const myNickname = nicknames[myId] || 'You';
  const turnNickname = nicknames[gameState.turn] || 'Unknown';
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
                  {nicknames[oppId] || 'Player'}
                  {botFlags[oppId] && <span className="bot-badge">BOT</span>}
                  {awaySet.has(oppId) && <span className="bot-badge">AWAY</span>}
                </span>
                <MoneyDisplay amount={gameState.balances?.[oppId] ?? 0} />
              </div>
              <OpponentHand count={gameState.opponents?.[oppId] ?? 0} />
              {place > 0 && <span className="passed-label place-label">{ordinal(place)}</span>}
              {!place && passedSet.has(oppId) && <span className="passed-label">Passed</span>}
            </div>
          );
        })}
      </div>

      <div className="table-area">
        <button className="mute-btn" onClick={toggleMute}>
          {muted ? '\u{1F507}' : '\u{1F50A}'}
        </button>
        <div className={`turn-indicator ${isMyTurn ? 'your-turn' : ''}`}>
          {myPlace ? `You finished ${ordinal(myPlace)}` : isMyTurn ? 'Your turn' : `${turnNickname}'s turn`}
        </div>
        <Table cards={gameState.table} animatePlay={animatePlay} />
      </div>

      <EmoteBar onSend={sendEmote} />

      {isMyTurn && !myPlace && (
        <div className="action-bar">
          <button
            className="btn btn-pass"
            onClick={handlePass}
            disabled={!gameState.table || gameState.table.length === 0}
          >
            Pass
          </button>
          <button
            className="btn btn-primary"
            onClick={handlePlay}
            disabled={selectedIds.size === 0}
          >
            Play {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
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

      {toast && <div className="toast">{toast}</div>}

      {emotes.map((e) => (
        <EmoteOverlay key={e.id} emoteId={e.emoteId} from={e.from} />
      ))}

      {showConfetti && <Confetti />}

      {handOver && <HandResult result={handOver} myId={myId} waiting={waitingNext} onNext={handleNewHand} />}

      {kickedInfo && (
        <div className="disconnected-overlay">
          <h2>Insufficient Chips</h2>
          <p>You need at least {kickedInfo.needed} chips to continue.</p>
          <p>Your balance: {kickedInfo.balance} chips</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Back to Lobby
          </button>
        </div>
      )}

      {gameOverInfo && (
        <div className="disconnected-overlay">
          <h2>Game Over</h2>
          <p>{gameOverInfo.reason}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Back to Lobby
          </button>
        </div>
      )}
    </div>
  );
}
