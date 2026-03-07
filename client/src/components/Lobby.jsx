import { useState, useEffect } from 'react';

export default function Lobby({ socket, roomCode, onRoomCreated, onGameStart, onGameState, error, setError }) {
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [ante, setAnte] = useState(10);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [fillWithBots, setFillWithBots] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);

  useEffect(() => {
    if (!socket) return;

    const handleRoomCreated = ({ roomCode }) => {
      onRoomCreated(roomCode);
      setWaiting(true);
    };

    const handleGameStart = (data) => {
      setWaiting(false);
      onGameStart(data);
    };

    const handleJoinError = ({ error }) => {
      setError(error);
    };

    const handlePlayerJoined = ({ nicknames, playerCount, maxPlayers }) => {
      setLobbyPlayers(Object.values(nicknames));
    };

    socket.on('room-created', handleRoomCreated);
    socket.on('game-start', handleGameStart);
    socket.on('game-state', onGameState);
    socket.on('join-error', handleJoinError);
    socket.on('player-joined', handlePlayerJoined);

    return () => {
      socket.off('room-created', handleRoomCreated);
      socket.off('game-start', handleGameStart);
      socket.off('game-state', onGameState);
      socket.off('join-error', handleJoinError);
      socket.off('player-joined', handlePlayerJoined);
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

  return (
    <div className="lobby">
      <h1 className="lobby-title">Tiên Lên</h1>
      <p className="lobby-subtitle">Vietnamese Card Game</p>

      <div className="lobby-form">
        <input
          type="text"
          placeholder="Your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          className="lobby-input"
        />

        {!roomCode ? (
          <>
            <div className="lobby-section">
              <h2>Create Room</h2>
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
              <button onClick={handleCreate} disabled={!nickname.trim()} className="btn btn-primary">
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
              <button onClick={handleJoin} disabled={!nickname.trim() || !joinCode.trim()} className="btn btn-primary">
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
