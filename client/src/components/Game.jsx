import { useState, useEffect, useCallback, useRef } from 'react';
import Hand from './Hand.jsx';
import OpponentHand from './OpponentHand.jsx';
import Table from './Table.jsx';
import MoneyDisplay from './MoneyDisplay.jsx';
import EmoteBar from './EmoteBar.jsx';
import EmoteOverlay from './EmoteOverlay.jsx';
import { useSound } from '../hooks/useSound.js';

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

export default function Game({ socket, gameState, setGameState, nicknames, botFlags, myId, playerOrder, onGameState, onGameStart }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [handOver, setHandOver] = useState(null);
  const [toast, setToast] = useState(null);
  const [emotes, setEmotes] = useState([]);
  const [disconnected, setDisconnected] = useState(false);
  const [kickedInfo, setKickedInfo] = useState(null);
  const [gameOverInfo, setGameOverInfo] = useState(null);
  const [waitingNext, setWaitingNext] = useState(false);
  const [dealing, setDealing] = useState(true);
  const [animatePlay, setAnimatePlay] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const prevTableRef = useRef(null);
  const { playSound, muted, toggleMute } = useSound();
  const prevTurnRef = useRef(null);

  const opponents = playerOrder.filter(id => id !== myId);
  const isMyTurn = gameState.turn === myId;

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
      if (data.winner === myId) {
        setShowConfetti(true);
        playSound('win');
      } else {
        playSound('lose');
      }
    };

    const onInstantWin = (data) => {
      setHandOver({
        winner: data.winner,
        winnerNickname: data.winnerNickname,
        penalty: 0,
        pot: 0,
        balances: data.balances,
        instantWin: data.instantWin,
      });
      if (data.winner === myId) {
        setShowConfetti(true);
        playSound('win');
      } else {
        playSound('lose');
      }
    };

    const onInvalidPlay = ({ reason }) => {
      setToast(reason);
      setTimeout(() => setToast(null), 2000);
    };

    const onEmote = ({ emoteId, from }) => {
      const id = Date.now() + Math.random();
      setEmotes((prev) => [...prev, { id, emoteId, from: 'opponent' }]);
      playSound('emote');
      setTimeout(() => {
        setEmotes((prev) => prev.filter((e) => e.id !== id));
      }, 1500);
    };

    const onPlayerDisconnected = () => setDisconnected(true);
    const onWaiting = () => setWaitingNext(true);

    const onKicked = (data) => {
      setKickedInfo(data);
      playSound('lose');
    };

    const onGameOver = (data) => {
      setGameOverInfo(data);
    };

    const onPlayerKicked = ({ nickname }) => {
      setToast(`${nickname} was removed (insufficient chips)`);
      setTimeout(() => setToast(null), 3000);
    };

    socket.on('game-state', onState);
    socket.on('game-start', onStart);
    socket.on('hand-over', onHandOver);
    socket.on('instant-win', onInstantWin);
    socket.on('invalid-play', onInvalidPlay);
    socket.on('emote', onEmote);
    socket.on('player-disconnected', onPlayerDisconnected);
    socket.on('waiting-for-opponent', onWaiting);
    socket.on('kicked-low-balance', onKicked);
    socket.on('game-over-insufficient', onGameOver);
    socket.on('player-kicked', onPlayerKicked);

    return () => {
      socket.off('game-state', onState);
      socket.off('game-start', onStart);
      socket.off('hand-over', onHandOver);
      socket.off('instant-win', onInstantWin);
      socket.off('invalid-play', onInvalidPlay);
      socket.off('emote', onEmote);
      socket.off('player-disconnected', onPlayerDisconnected);
      socket.off('waiting-for-opponent', onWaiting);
      socket.off('kicked-low-balance', onKicked);
      socket.off('game-over-insufficient', onGameOver);
      socket.off('player-kicked', onPlayerKicked);
    };
  }, [socket, myId, onGameState, onGameStart, playSound]);

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

      if (e.key === 'Enter' && isMyTurn) {
        e.preventDefault();
        handlePlay();
      } else if (e.key === ' ' && isMyTurn) {
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
      <button className="mute-btn" onClick={toggleMute}>
        {muted ? '\u{1F507}' : '\u{1F50A}'}
      </button>
      <div className="opponents-area">
        {opponents.map((oppId) => (
          <div key={oppId} className={`opponent-slot ${gameState.turn === oppId ? 'active-turn' : ''} ${passedSet.has(oppId) ? 'passed' : ''}`}>
            <div className="opponent-info">
              <span className="opponent-name">
                {nicknames[oppId] || 'Player'}
                {botFlags[oppId] && <span className="bot-badge">BOT</span>}
              </span>
              <MoneyDisplay amount={gameState.balances?.[oppId] ?? 0} />
            </div>
            <OpponentHand count={gameState.opponents?.[oppId] ?? 0} />
            {passedSet.has(oppId) && <span className="passed-label">Passed</span>}
          </div>
        ))}
      </div>

      <div className="table-area">
        <div className={`turn-indicator ${isMyTurn ? 'your-turn' : ''}`}>
          {isMyTurn ? 'Your turn' : `${turnNickname}'s turn`}
        </div>
        <Table cards={gameState.table} animatePlay={animatePlay} />
      </div>

      <EmoteBar onSend={sendEmote} />

      {isMyTurn && (
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

      {handOver && (
        <div className="overlay">
          <h2>{handOver.winner === myId ? 'You Win!' : `${handOver.winnerNickname} Wins`}</h2>
          {handOver.instantWin && (
            <p className="result-detail">Instant win: {handOver.instantWin.type === 'four-twos' ? 'Four 2s' : 'Dragon (3→A)'}</p>
          )}
          {handOver.losers && Object.keys(handOver.losers).length > 0 && (
            <div className="loser-details">
              {Object.entries(handOver.losers).map(([loserId, data]) => (
                data.penalty > 0 && (
                  <p key={loserId} className="result-detail">
                    {nicknames[loserId]}: -{data.penalty} chips ({data.cards.length} cards left)
                  </p>
                )
              ))}
            </div>
          )}
          <div className={`chip-change ${handOver.winner === myId ? 'positive' : 'negative'}`}>
            {handOver.winner === myId ? '+' : ''}
            {handOver.winner === myId
              ? handOver.pot + Object.values(handOver.losers || {}).reduce((sum, l) => sum + l.penalty, 0)
              : -(handOver.losers?.[myId]?.penalty || 0)} chips
          </div>
          <button className="btn btn-primary" onClick={handleNewHand} disabled={waitingNext}>
            {waitingNext ? 'Waiting...' : 'Next Hand'}
          </button>
        </div>
      )}

      {disconnected && (
        <div className="disconnected-overlay">
          <h2>Player Disconnected</h2>
          <p>The game has ended.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Back to Lobby
          </button>
        </div>
      )}

      {kickedInfo && (
        <div className="disconnected-overlay">
          <h2>Insufficient Chips</h2>
          <p>You need at least {kickedInfo.ante} chips to continue.</p>
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
