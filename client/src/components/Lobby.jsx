import { useState, useEffect } from 'react';

const BET_OPTIONS = [10, 25, 50, 100, 250, 500];

export default function Lobby({ socket, roomCode, onRoomCreated, onGameStart, onGameState, error, setError }) {
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [ante, setAnte] = useState(10);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [fillWithBots, setFillWithBots] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [matchBet, setMatchBet] = useState(50);
  const [matchPlayers, setMatchPlayers] = useState(4);
  const [searching, setSearching] = useState(false);
  const [queueInfo, setQueueInfo] = useState(null);

  useEffect(() => {
    if (!socket) return;

    const handleRoomCreated = ({ roomCode }) => {
      onRoomCreated(roomCode);
      setWaiting(true);
    };

    const handleGameStart = (data) => {
      setWaiting(false);
      setSearching(false);
      setQueueInfo(null);
      onGameStart(data);
    };

    const handleJoinError = ({ error }) => {
      setError(error);
    };

    const handlePlayerJoined = ({ nicknames }) => {
      setLobbyPlayers(Object.values(nicknames));
    };

    const handleMatchQueued = (data) => {
      setQueueInfo(data);
    };

    const handleMatchCancelled = () => {
      setSearching(false);
      setQueueInfo(null);
    };

    socket.on('room-created', handleRoomCreated);
    socket.on('game-start', handleGameStart);
    socket.on('game-state', onGameState);
    socket.on('join-error', handleJoinError);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('match-queued', handleMatchQueued);
    socket.on('match-cancelled', handleMatchCancelled);

    return () => {
      socket.off('room-created', handleRoomCreated);
      socket.off('game-start', handleGameStart);
      socket.off('game-state', onGameState);
      socket.off('join-error', handleJoinError);
      socket.off('player-joined', handlePlayerJoined);
      socket.off('match-queued', handleMatchQueued);
      socket.off('match-cancelled', handleMatchCancelled);
    };
  }, [socket, onRoomCreated, onGameStart, onGameState, setError]);

  const handleCreate = () => {
    if (!nickname.trim()) return;
    socket.emit('create-room', {
      nickname: nickname.trim(),
      ante,
      maxPlayers,
      fillWithBots,
    });
  };

  const handleJoin = () => {
    if (!nickname.trim() || !joinCode.trim()) return;
    socket.emit('join-room', { roomCode: joinCode.trim(), nickname: nickname.trim() });
  };

  const handleStartGame = () => {
    socket.emit('start-game');
  };

  const handleFindMatch = () => {
    if (!nickname.trim()) return;
    setSearching(true);
    socket.emit('find-match', {
      nickname: nickname.trim(),
      bet: matchBet,
      maxPlayers: matchPlayers,
    });
  };

  const handleCancelMatch = () => {
    socket.emit('cancel-match');
    setSearching(false);
    setQueueInfo(null);
  };

  return (
    <div className="lobby">
      <h1 className="lobby-title">Ti\u00ean L\u00ean</h1>
      <p className="lobby-subtitle">Vietnamese Card Game</p>

      <div className="lobby-form">
        <input
          type="text"
          placeholder="Your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          className="lobby-input"
          disabled={searching || !!roomCode}
        />

        {searching ? (
          <div className="lobby-section">
            <h2>Finding Match</h2>
            <div className="match-search-info">
              <div className="match-bet-display">
                <span className="money-chip" />
                <span className="match-bet-amount">{matchBet}</span>
                <span className="chip-label">chips</span>
              </div>
              <p className="waiting-text">
                {queueInfo
                  ? `${queueInfo.position} / ${queueInfo.needed} players`
                  : 'Searching...'}
              </p>
              <div className="match-dots">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
            <button onClick={handleCancelMatch} className="btn btn-secondary" style={{ marginTop: 12 }}>
              Cancel
            </button>
          </div>
        ) : !roomCode ? (
          <>
            <div className="lobby-section">
              <h2>Quick Match</h2>
              <p className="section-desc">Bet chips and get matched with players</p>
              <div className="bet-grid">
                {BET_OPTIONS.map((amount) => (
                  <button
                    key={amount}
                    className={`bet-option ${matchBet === amount ? 'bet-selected' : ''}`}
                    onClick={() => setMatchBet(amount)}
                  >
                    <span className="money-chip" />
                    {amount}
                  </button>
                ))}
              </div>
              <div className="ante-row">
                <label>Players:</label>
                <select
                  value={matchPlayers}
                  onChange={(e) => setMatchPlayers(parseInt(e.target.value))}
                  className="lobby-input ante-input"
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </div>
              <button onClick={handleFindMatch} disabled={!nickname.trim()} className="btn btn-primary">
                Find Match
              </button>
            </div>

            <div className="lobby-divider">or</div>

            <div className="lobby-section">
              <h2>Private Room</h2>
              <div className="ante-row">
                <label>Ante:</label>
                <input
                  type="number"
                  value={ante}
                  onChange={(e) => setAnte(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  max={100}
                  className="lobby-input ante-input"
                />
                <span className="chip-label">chips</span>
              </div>
              <div className="ante-row">
                <label>Players:</label>
                <select
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                  className="lobby-input ante-input"
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </div>
              <div className="ante-row">
                <label className="bot-toggle">
                  <input
                    type="checkbox"
                    checked={fillWithBots}
                    onChange={(e) => setFillWithBots(e.target.checked)}
                  />
                  Fill empty seats with bots
                </label>
              </div>
              <button onClick={handleCreate} disabled={!nickname.trim()} className="btn btn-secondary">
                Create Room
              </button>
            </div>

            <div className="lobby-divider">or</div>

            <div className="lobby-section">
              <h2>Join Room</h2>
              <input
                type="text"
                placeholder="Room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={4}
                className="lobby-input code-input"
              />
              <button onClick={handleJoin} disabled={!nickname.trim() || !joinCode.trim()} className="btn btn-secondary">
                Join
              </button>
            </div>
          </>
        ) : (
          <div className="lobby-section waiting-section">
            <h2>Room Code</h2>
            <div className="room-code">{roomCode}</div>
            {lobbyPlayers.length > 0 && (
              <div className="lobby-players">
                {lobbyPlayers.map((name, i) => (
                  <span key={i} className="lobby-player-tag">{name}</span>
                ))}
              </div>
            )}
            <p className="waiting-text">
              {waiting ? 'Waiting for players to join...' : 'Share this code with your friends'}
            </p>
            {waiting && (
              <button onClick={handleStartGame} className="btn btn-secondary" style={{ marginTop: 12 }}>
                Start with Bots
              </button>
            )}
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}
      </div>
    </div>
  );
}
