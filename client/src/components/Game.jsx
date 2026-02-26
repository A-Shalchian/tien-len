import { useState, useEffect, useCallback } from 'react';
import Hand from './Hand.jsx';
import OpponentHand from './OpponentHand.jsx';
import Table from './Table.jsx';
import MoneyDisplay from './MoneyDisplay.jsx';
import EmoteBar from './EmoteBar.jsx';
import EmoteOverlay from './EmoteOverlay.jsx';

export default function Game({ socket, gameState, setGameState, nicknames, myId, onGameState, onGameStart }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [handOver, setHandOver] = useState(null);
  const [toast, setToast] = useState(null);
  const [emotes, setEmotes] = useState([]);
  const [disconnected, setDisconnected] = useState(false);
  const [waitingNext, setWaitingNext] = useState(false);

  const opponentId = Object.keys(nicknames).find((id) => id !== myId);
  const isMyTurn = gameState.turn === myId;

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
    };

    const onHandOver = (data) => {
      setHandOver(data);
      setSelectedIds(new Set());
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
    };

    const onInvalidPlay = ({ reason }) => {
      setToast(reason);
      setTimeout(() => setToast(null), 2000);
    };

    const onEmote = ({ emoteId }) => {
      const id = Date.now() + Math.random();
      setEmotes((prev) => [...prev, { id, emoteId, from: 'opponent' }]);
      setTimeout(() => {
        setEmotes((prev) => prev.filter((e) => e.id !== id));
      }, 1500);
    };

    const onDisconnect = () => setDisconnected(true);
    const onWaiting = () => setWaitingNext(true);

    socket.on('game-state', onState);
    socket.on('game-start', onStart);
    socket.on('hand-over', onHandOver);
    socket.on('instant-win', onInstantWin);
    socket.on('invalid-play', onInvalidPlay);
    socket.on('emote', onEmote);
    socket.on('opponent-disconnected', onDisconnect);
    socket.on('waiting-for-opponent', onWaiting);

    return () => {
      socket.off('game-state', onState);
      socket.off('game-start', onStart);
      socket.off('hand-over', onHandOver);
      socket.off('instant-win', onInstantWin);
      socket.off('invalid-play', onInvalidPlay);
      socket.off('emote', onEmote);
      socket.off('opponent-disconnected', onDisconnect);
      socket.off('waiting-for-opponent', onWaiting);
    };
  }, [socket, onGameState, onGameStart]);

  const toggleCard = useCallback((cardId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const handlePlay = () => {
    if (selectedIds.size === 0) return;
    socket.emit('play-cards', { cardIds: Array.from(selectedIds) });
  };

  const handlePass = () => {
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

  const myBalance = gameState.balances?.[myId] ?? 0;
  const oppBalance = gameState.balances?.[opponentId] ?? 0;
  const myNickname = nicknames[myId] || 'You';
  const oppNickname = nicknames[opponentId] || 'Opponent';

  return (
    <div className="game">
      {/* Opponent area */}
      <div className="opponent-area">
        <div className="opponent-info">
          <span className="opponent-name">{oppNickname}</span>
          <OpponentHand count={gameState.opponentCardCount} />
        </div>
        <MoneyDisplay amount={oppBalance} />
      </div>

      {/* Table */}
      <div className="table-area">
        <div className={`turn-indicator ${isMyTurn ? 'your-turn' : ''}`}>
          {isMyTurn ? 'Your turn' : `${oppNickname}'s turn`}
        </div>
        <Table cards={gameState.table} />
      </div>

      {/* Emote bar */}
      <EmoteBar onSend={sendEmote} />

      {/* Action buttons */}
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

      {/* Your hand */}
      <div className="hand-area">
        <div className="hand-info">
          <span className="hand-name">{myNickname}</span>
          <MoneyDisplay amount={myBalance} />
        </div>
        <Hand cards={gameState.hand} selectedIds={selectedIds} onToggle={toggleCard} />
      </div>

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      {/* Emote animations */}
      {emotes.map((e) => (
        <EmoteOverlay key={e.id} emoteId={e.emoteId} from={e.from} />
      ))}

      {/* Hand over overlay */}
      {handOver && (
        <div className="overlay">
          <h2>{handOver.winner === myId ? 'You Win!' : `${handOver.winnerNickname} Wins`}</h2>
          {handOver.instantWin && (
            <p className="result-detail">Instant win: {handOver.instantWin.type === 'four-twos' ? 'Four 2s' : 'Dragon (3→A)'}</p>
          )}
          {handOver.penalty > 0 && (
            <p className="result-detail">
              Penalty: {handOver.penalty} chips ({handOver.loserCards?.length} cards remaining)
            </p>
          )}
          <div className={`chip-change ${handOver.winner === myId ? 'positive' : 'negative'}`}>
            {handOver.winner === myId ? '+' : '-'}
            {handOver.pot + handOver.penalty} chips
          </div>
          <button className="btn btn-primary" onClick={handleNewHand} disabled={waitingNext}>
            {waitingNext ? 'Waiting...' : 'Next Hand'}
          </button>
        </div>
      )}

      {/* Disconnected overlay */}
      {disconnected && (
        <div className="disconnected-overlay">
          <h2>Opponent Left</h2>
          <p>The game has ended.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Back to Lobby
          </button>
        </div>
      )}
    </div>
  );
}
