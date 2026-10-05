import { useState, useEffect, useCallback, useRef } from 'react';
import { getMe, signIn } from '../utils/api.js';
import ConsentGate from '../pages/ConsentGate.jsx';
import MoneyDisplay from './MoneyDisplay.jsx';

const BET_OPTIONS = [10, 25, 50, 100, 250, 500];

const CHIP_RULES = [
  ['Start', '1,000 chips, plus 100 a day while you have less'],
  ['Bet', 'Everyone puts it in the pot. Winner takes it all'],
  ['Cards left', 'Losers pay 1 chip per card, 5 per 2'],
  ['Bombed 2', 'Pay the bet per black 2, double per red 2'],
  ['Instant win', 'Winner takes the pot, no card penalties'],
  ['Leaving', 'Mid-hand, you pay the bet plus your card penalty'],
];

function ChipInfo() {
  return (
    <>
      <dl className="chip-rules">
        {CHIP_RULES.map(([label, text]) => (
          <div key={label} className="chip-rule">
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <p className="chip-rules-note">Rooms use practice chips. Nothing is saved.</p>
    </>
  );
}

function ChipInfoModal({ onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chip-info-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="chip-info-title">How chips work</h2>
          <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <ChipInfo />
      </div>
    </div>
  );
}

export default function Lobby({ socket, roomCode, urlRoomCode, onRoomCreated, onRoomJoined, onLeaveRoom, onGameStart, onGameState, error, setError }) {
  const [me, setMe] = useState(undefined);
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState(urlRoomCode || '');
  const [ante, setAnte] = useState(10);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [fillWithBots, setFillWithBots] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [matchBet, setMatchBet] = useState(50);
  const [matchPlayers, setMatchPlayers] = useState(4);
  const [searching, setSearching] = useState(false);
  const [queueInfo, setQueueInfo] = useState(null);
  const [openRooms, setOpenRooms] = useState([]);
  const [showChipInfo, setShowChipInfo] = useState(false);

  const loadMe = useCallback(() => {
    getMe().then(setMe).catch(() => setMe({ user: null }));
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const signedIn = !!me?.user;
  const lockedName = signedIn ? (me.profile?.name || me.user.name || '').slice(0, 20) : null;
  const playerName = (lockedName ?? nickname).trim();
  const browsing = !roomCode && !searching;
  const closeChipInfo = useCallback(() => setShowChipInfo(false), []);

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

    const handlePlayerJoined = ({ nicknames, playerCount, maxPlayers, roomCode: joinedCode }) => {
      setLobbyPlayers(Object.values(nicknames));
      if (!roomCode && joinedCode) {
        onRoomJoined(joinedCode);
        setWaiting(true);
      }
    };

    const handlePlayerLeft = ({ nicknames, playerCount }) => {
      setLobbyPlayers(Object.values(nicknames));
    };

    const handleMatchQueued = (data) => {
      setQueueInfo(data);
    };

    const handleMatchCancelled = () => {
      setSearching(false);
      setQueueInfo(null);
    };

    const handleMatchError = ({ error, needsLogin, needsConsent }) => {
      setSearching(false);
      setQueueInfo(null);
      setError(error);
      if (needsLogin || needsConsent) loadMe();
    };

    socket.on('room-created', handleRoomCreated);
    socket.on('game-start', handleGameStart);
    socket.on('game-state', onGameState);
    socket.on('join-error', handleJoinError);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('match-queued', handleMatchQueued);
    socket.on('match-cancelled', handleMatchCancelled);
    socket.on('match-error', handleMatchError);
    socket.on('player-left', handlePlayerLeft);

    return () => {
      socket.off('room-created', handleRoomCreated);
      socket.off('game-start', handleGameStart);
      socket.off('game-state', onGameState);
      socket.off('join-error', handleJoinError);
      socket.off('player-joined', handlePlayerJoined);
      socket.off('match-queued', handleMatchQueued);
      socket.off('match-cancelled', handleMatchCancelled);
      socket.off('match-error', handleMatchError);
      socket.off('player-left', handlePlayerLeft);
    };
  }, [socket, roomCode, onRoomCreated, onRoomJoined, onGameStart, onGameState, setError, loadMe]);

  useEffect(() => {
    if (!socket || !browsing) return;
    const watch = () => socket.emit('watch-rooms');
    watch();
    socket.on('connect', watch);
    socket.on('room-list', setOpenRooms);
    return () => {
      socket.off('connect', watch);
      socket.off('room-list', setOpenRooms);
      socket.emit('unwatch-rooms');
    };
  }, [socket, browsing]);

  const handleCreate = () => {
    if (!playerName) return;
    setError(null);
    socket.emit('create-room', {
      nickname: playerName,
      ante,
      maxPlayers,
      fillWithBots,
      isPublic,
    });
  };

  const joinRoom = (code) => {
    if (!playerName || !code) return;
    setError(null);
    socket.emit('join-room', { roomCode: code, nickname: playerName });
  };

  const handleStartGame = () => {
    socket.emit('start-game');
  };

  const handleFindMatch = () => {
    if (!signedIn) return;
    setError(null);
    setSearching(true);
    socket.emit('find-match', {
      bet: matchBet,
      maxPlayers: matchPlayers,
    });
  };

  const handleCancelMatch = () => {
    socket.emit('cancel-match');
    setSearching(false);
    setQueueInfo(null);
  };

  const balance = me?.balance ?? 0;

  return (
    <div className="lobby">
      <h1 className="lobby-title">Tiến Lên</h1>
      <p className="lobby-subtitle">Vietnamese Card Game</p>

      <div className={`lobby-form ${browsing ? 'lobby-form-wide' : ''}`}>
        <div className="lobby-name">
          {signedIn ? (
            <>
              <input
                type="text"
                value={lockedName}
                className="lobby-input lobby-input-locked"
                disabled
                readOnly
                aria-label="Your name"
              />
              <p className="name-note">
                Signed in. Change your name on your <a href="/profile">profile</a>.
              </p>
            </>
          ) : (
            <input
              type="text"
              placeholder="Your nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={12}
              className="lobby-input"
              disabled={searching || !!roomCode}
            />
          )}
        </div>

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
          <div className="lobby-grid">
            <div className="lobby-col">
              <div className="lobby-section">
                <div className="section-head">
                  <h2>Quick Match</h2>
                  <button
                    type="button"
                    className={`info-btn ${showChipInfo ? 'info-open' : ''}`}
                    onClick={() => setShowChipInfo(true)}
                    aria-label="How chips work"
                    aria-haspopup="dialog"
                  >
                    i
                  </button>
                </div>
                {showChipInfo && <ChipInfoModal onClose={closeChipInfo} />}
                {me === undefined ? (
                  <p className="section-desc">Loading your account...</p>
                ) : !signedIn ? (
                  <>
                    <p className="section-desc">Quick Match bets the chips saved to your account. Sign in to play.</p>
                    <button onClick={() => signIn('/play')} className="btn btn-primary">
                      Sign in with Google
                    </button>
                  </>
                ) : me.needsConsent ? (
                  <ConsentGate onAccepted={loadMe} />
                ) : (
                  <>
                    <div className="chip-balance">
                      Your chips <MoneyDisplay amount={balance} />
                    </div>
                    <div className="bet-grid">
                      {BET_OPTIONS.map((amount) => (
                        <button
                          key={amount}
                          className={`bet-option ${matchBet === amount ? 'bet-selected' : ''}`}
                          onClick={() => setMatchBet(amount)}
                          disabled={amount > balance}
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
                    <button onClick={handleFindMatch} disabled={matchBet > balance} className="btn btn-primary">
                      Find Match
                    </button>
                    {matchBet > balance && (
                      <p className="section-desc section-desc-after">Not enough chips for this bet. Pick a smaller one.</p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="lobby-divider">or</div>

            <div className="lobby-col">
              <div className="lobby-section">
                <h2>Open Rooms</h2>
                {openRooms.length === 0 ? (
                  <p className="section-desc">No open rooms right now. Create a public room and it shows up here.</p>
                ) : (
                  <>
                    <ul className="room-list">
                      {openRooms.map((r) => (
                        <li key={r.code} className="room-row">
                          <div className="room-row-info">
                            <span className="room-row-host">{r.host}'s room</span>
                            <span className="room-row-meta">
                              Ante {r.ante} · {r.players}/{r.maxPlayers} players{r.fillWithBots ? ' · bots fill seats' : ''}
                            </span>
                          </div>
                          <button
                            onClick={() => joinRoom(r.code)}
                            disabled={!playerName}
                            className="btn btn-secondary"
                          >
                            Join
                          </button>
                        </li>
                      ))}
                    </ul>
                    {!playerName && <p className="section-desc">Enter a nickname to join a room.</p>}
                  </>
                )}
              </div>
            </div>

            <div className="lobby-divider">or</div>

            <div className="lobby-col">
              <div className="lobby-section">
                <h2>Create Room</h2>
                <p className="section-desc">Rooms use practice chips. Nothing is saved to your account.</p>
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
                <div className="ante-row">
                  <label className="bot-toggle">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                    />
                    List in open rooms so anyone can join
                  </label>
                </div>
                <button onClick={handleCreate} disabled={!playerName} className="btn btn-secondary">
                  Create Room
                </button>
              </div>

              <div className="lobby-divider">or</div>

              <div className="lobby-section">
                <h2>Join With Code</h2>
                <input
                  type="text"
                  placeholder="Room code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="lobby-input code-input"
                />
                <button onClick={() => joinRoom(joinCode.trim())} disabled={!playerName || !joinCode.trim()} className="btn btn-secondary">
                  Join
                </button>
              </div>
            </div>
          </div>
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
            <button onClick={onLeaveRoom} className="btn btn-secondary" style={{ marginTop: 8 }}>
              Back
            </button>
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}
      </div>
    </div>
  );
}
