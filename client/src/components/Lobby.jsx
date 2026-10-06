import { useState, useEffect, useCallback, useRef } from 'react';
import { getMe, signIn } from '../utils/api.js';
import ConsentGate from '../pages/ConsentGate.jsx';
import MoneyDisplay from './MoneyDisplay.jsx';
import LanguageToggle from './LanguageToggle.jsx';
import { useLang } from '../i18n/index.jsx';

const STAKE_OPTIONS = [5, 10, 25, 50, 100, 250];
const STAKES_TO_PLAY = 10;

const CHIP_RULES = [
  ['Start', '1,000 chips, plus 100 a day while you have less'],
  ['Scoring', 'Same points as the score tracker: places, chops, 2s left, 3♠ finish, cóng'],
  ['Stake', 'Each point is worth the stake. Every hand adds up to zero'],
  ['Table', 'You need 10× the stake to sit down'],
  ['Leaving', 'A bot finishes your hand and you keep the result'],
];

function ChipInfo() {
  const { t } = useLang();
  return (
    <>
      <dl className="chip-rules">
        {CHIP_RULES.map(([label, text]) => (
          <div key={label} className="chip-rule">
            <dt>{t(label)}</dt>
            <dd>{t(text)}</dd>
          </div>
        ))}
      </dl>
      <p className="chip-rules-note">{t('Rooms use practice chips. Nothing is saved.')}</p>
    </>
  );
}

function ChipInfoModal({ onClose }) {
  const { t } = useLang();
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
          <h2 id="chip-info-title">{t('How chips work')}</h2>
          <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label={t('Close')}>
            ×
          </button>
        </div>
        <ChipInfo />
      </div>
    </div>
  );
}

export default function Lobby({ socket, roomCode, urlRoomCode, onRoomCreated, onRoomJoined, onLeaveRoom, onGameStart, onGameState, error, setError }) {
  const { t } = useLang();
  const [me, setMe] = useState(undefined);
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState(urlRoomCode || '');
  const [stake, setStake] = useState(10);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [fillWithBots, setFillWithBots] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [matchBet, setMatchBet] = useState(10);
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
      stake,
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
  const [nameNoteStart, nameNoteEnd] = t('Signed in. Change your name on your {link}.').split('{link}');

  return (
    <div className="lobby">
      <LanguageToggle className="lobby-lang" />
      <h1 className="lobby-title">Tiến Lên</h1>
      <p className="lobby-subtitle">{t('Vietnamese Card Game')}</p>

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
                aria-label={t('Your name')}
              />
              <p className="name-note">
                {nameNoteStart}<a href="/profile">{t('profile')}</a>{nameNoteEnd}
              </p>
            </>
          ) : (
            <input
              type="text"
              placeholder={t('Your nickname')}
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
            <h2>{t('Finding Match')}</h2>
            <div className="match-search-info">
              <div className="match-bet-display">
                <span className="money-chip" />
                <span className="match-bet-amount">{matchBet}</span>
                <span className="chip-label">{t('per point')}</span>
              </div>
              <p className="waiting-text">
                {queueInfo
                  ? t('{position} / {needed} players', { position: queueInfo.position, needed: queueInfo.needed })
                  : t('Searching...')}
              </p>
              <div className="match-dots">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
            <button onClick={handleCancelMatch} className="btn btn-secondary" style={{ marginTop: 12 }}>
              {t('Cancel')}
            </button>
          </div>
        ) : !roomCode ? (
          <div className="lobby-grid">
            <div className="lobby-col">
              <div className="lobby-section">
                <div className="section-head">
                  <h2>{t('Quick Match')}</h2>
                  <button
                    type="button"
                    className={`info-btn ${showChipInfo ? 'info-open' : ''}`}
                    onClick={() => setShowChipInfo(true)}
                    aria-label={t('How chips work')}
                    aria-haspopup="dialog"
                  >
                    i
                  </button>
                </div>
                {showChipInfo && <ChipInfoModal onClose={closeChipInfo} />}
                {me === undefined ? (
                  <p className="section-desc">{t('Loading your account...')}</p>
                ) : !signedIn ? (
                  <>
                    <p className="section-desc">{t('Quick Match bets the chips saved to your account. Sign in to play.')}</p>
                    <button onClick={() => signIn('/play')} className="btn btn-primary">
                      {t('Sign in with Google')}
                    </button>
                  </>
                ) : me.needsConsent ? (
                  <ConsentGate onAccepted={loadMe} />
                ) : (
                  <>
                    <div className="chip-balance">
                      {t('Your chips')} <MoneyDisplay amount={balance} />
                    </div>
                    <p className="section-desc">{t('Chips per point')}</p>
                    <div className="bet-grid">
                      {STAKE_OPTIONS.map((amount) => (
                        <button
                          key={amount}
                          className={`bet-option ${matchBet === amount ? 'bet-selected' : ''}`}
                          onClick={() => setMatchBet(amount)}
                          disabled={amount * STAKES_TO_PLAY > balance}
                        >
                          <span className="money-chip" />
                          {amount}
                        </button>
                      ))}
                    </div>
                    <div className="ante-row">
                      <label>{t('Players')}:</label>
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
                    <button onClick={handleFindMatch} disabled={matchBet * STAKES_TO_PLAY > balance} className="btn btn-primary">
                      {t('Find Match')}
                    </button>
                    {matchBet * STAKES_TO_PLAY > balance && (
                      <p className="section-desc section-desc-after">
                        {t('You need {chips} chips for this stake. Pick a smaller one.', { chips: matchBet * STAKES_TO_PLAY })}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="lobby-divider">{t('or')}</div>

            <div className="lobby-col">
              <div className="lobby-section">
                <h2>{t('Open Rooms')}</h2>
                {openRooms.length === 0 ? (
                  <p className="section-desc">{t('No open rooms right now. Create a public room and it shows up here.')}</p>
                ) : (
                  <>
                    <ul className="room-list">
                      {openRooms.map((r) => (
                        <li key={r.code} className="room-row">
                          <div className="room-row-info">
                            <span className="room-row-host">{t("{host}'s room", { host: r.host })}</span>
                            <span className="room-row-meta">
                              {t('{stake} per point', { stake: r.stake })} · {t('{players}/{max} players', { players: r.players, max: r.maxPlayers })}{r.fillWithBots ? ` · ${t('bots fill seats')}` : ''}
                            </span>
                          </div>
                          <button
                            onClick={() => joinRoom(r.code)}
                            disabled={!playerName}
                            className="btn btn-secondary"
                          >
                            {t('Join')}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {!playerName && <p className="section-desc">{t('Enter a nickname to join a room.')}</p>}
                  </>
                )}
              </div>
            </div>

            <div className="lobby-divider">{t('or')}</div>

            <div className="lobby-col">
              <div className="lobby-section">
                <h2>{t('Create Room')}</h2>
                <p className="section-desc">{t('Rooms use practice chips. Nothing is saved to your account.')}</p>
                <div className="ante-row">
                  <label>{t('Per point')}:</label>
                  <input
                    type="number"
                    value={stake}
                    onChange={(e) => setStake(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    min={1}
                    max={100}
                    className="lobby-input ante-input"
                  />
                  <span className="chip-label">{t('chips')}</span>
                </div>
                <div className="ante-row">
                  <label>{t('Players')}:</label>
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
                    {t('Fill empty seats with bots')}
                  </label>
                </div>
                <div className="ante-row">
                  <label className="bot-toggle">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                    />
                    {t('List in open rooms so anyone can join')}
                  </label>
                </div>
                <button onClick={handleCreate} disabled={!playerName} className="btn btn-secondary">
                  {t('Create Room')}
                </button>
              </div>

              <div className="lobby-divider">{t('or')}</div>

              <div className="lobby-section">
                <h2>{t('Join With Code')}</h2>
                <input
                  type="text"
                  placeholder={t('Room code')}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="lobby-input code-input"
                />
                <button onClick={() => joinRoom(joinCode.trim())} disabled={!playerName || !joinCode.trim()} className="btn btn-secondary">
                  {t('Join')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="lobby-section waiting-section">
            <h2>{t('Room Code')}</h2>
            <div className="room-code">{roomCode}</div>
            {lobbyPlayers.length > 0 && (
              <div className="lobby-players">
                {lobbyPlayers.map((name, i) => (
                  <span key={i} className="lobby-player-tag">{name}</span>
                ))}
              </div>
            )}
            <p className="waiting-text">
              {waiting ? t('Waiting for players to join...') : t('Share this code with your friends')}
            </p>
            {waiting && (
              <button onClick={handleStartGame} className="btn btn-secondary" style={{ marginTop: 12 }}>
                {t('Start with Bots')}
              </button>
            )}
            <button onClick={onLeaveRoom} className="btn btn-secondary" style={{ marginTop: 8 }}>
              {t('Back')}
            </button>
          </div>
        )}

        {error && <div className="error-msg">{t(error)}</div>}
      </div>
    </div>
  );
}
