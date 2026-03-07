import { useState, useEffect, useCallback } from 'react';
import Hand from './Hand.jsx';
import OpponentHand from './OpponentHand.jsx';
import Table from './Table.jsx';
import MoneyDisplay from './MoneyDisplay.jsx';
import EmoteBar from './EmoteBar.jsx';
import EmoteOverlay from './EmoteOverlay.jsx';

export default function Game({ socket, gameState, setGameState, nicknames, botFlags, myId, playerOrder, onGameState, onGameStart }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [handOver, setHandOver] = useState(null);
  const [toast, setToast] = useState(null);
  const [emotes, setEmotes] = useState([]);
  const [disconnected, setDisconnected] = useState(false);
  const [waitingNext, setWaitingNext] = useState(false);

  const opponents = playerOrder.filter(id => id !== myId);
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

    const onEmote = ({ emoteId, from }) => {
      const id = Date.now() + Math.random();
      setEmotes((prev) => [...prev, { id, emoteId, from: 'opponent' }]);
      setTimeout(() => {
        setEmotes((prev) => prev.filter((e) => e.id !== id));
      }, 1500);
    };

    const onPlayerDisconnected = () => setDisconnected(true);
    const onWaiting = () => setWaitingNext(true);

    socket.on('game-state', onState);
    socket.on('game-start', onStart);
    socket.on('hand-over', onHandOver);
    socket.on('instant-win', onInstantWin);
    socket.on('invalid-play', onInvalidPlay);
    socket.on('emote', onEmote);
    socket.on('player-disconnected', onPlayerDisconnected);
    socket.on('waiting-for-opponent', onWaiting);

    return () => {
      socket.off('game-state', onState);
      socket.off('game-start', onStart);
      socket.off('hand-over', onHandOver);
      socket.off('instant-win', onInstantWin);
      socket.off('invalid-play', onInvalidPlay);
      socket.off('emote', onEmote);
      socket.off('player-disconnected', onPlayerDisconnected);
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
  const myNickname = nicknames[myId] || 'You';
  const turnNickname = nicknames[gameState.turn] || 'Unknown';
  const passedSet = new Set(gameState.passedPlayers || []);

  return (
    <div className="game">
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
        <Table cards={gameState.table} />
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
        <Hand cards={gameState.hand} selectedIds={selectedIds} onToggle={toggleCard} />
      </div>

      {toast && <div className="toast">{toast}</div>}

      {emotes.map((e) => (
        <EmoteOverlay key={e.id} emoteId={e.emoteId} from={e.from} />
      ))}

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
    </div>
  );
}
