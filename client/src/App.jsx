import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './hooks/useSocket.js';
import Lobby from './components/Lobby.jsx';
import Game from './components/Game.jsx';
import ScoreTracker from './pages/ScoreTracker.jsx';
import Landing from './pages/Landing.jsx';
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';
import Profile from './pages/Profile.jsx';
import NavBar from './components/NavBar.jsx';

function getRoomCodeFromURL() {
  const match = window.location.pathname.match(/^\/room\/([A-Z0-9]{4})$/i);
  return match ? match[1].toUpperCase() : null;
}

function Page({ path }) {
  if (path === '/' || path === '') return <Landing />;
  if (path === '/privacy') return <Privacy />;
  if (path === '/terms') return <Terms />;
  if (path.startsWith('/scores')) return <ScoreTracker />;
  if (path === '/profile') return <Profile />;
  const profileMatch = path.match(/^\/u\/([A-Za-z0-9_-]+)$/);
  if (profileMatch) return <Profile userId={profileMatch[1]} />;
  return <GameApp />;
}

const LACQUER_PAGES = ['/', '', '/privacy', '/terms'];

export default function App() {
  const path = window.location.pathname;
  return (
    <div className="app-shell">
      <NavBar path={path} theme={LACQUER_PAGES.includes(path) ? 'lacquer' : 'dark'} />
      <main className="app-main">
        <Page path={path} />
      </main>
    </div>
  );
}

function GameApp() {
  const socket = useSocket();
  const [gameState, setGameState] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [nicknames, setNicknames] = useState({});
  const [botFlags, setBotFlags] = useState({});
  const [myId, setMyId] = useState(null);
  const [playerOrder, setPlayerOrder] = useState([]);
  const [error, setError] = useState(null);
  const [rejoinResult, setRejoinResult] = useState(null);
  const [urlRoomCode] = useState(() => getRoomCodeFromURL());

  const resetToLobby = useCallback(() => {
    setRoomCode(null);
    setGameState(null);
    setNicknames({});
    setBotFlags({});
    setPlayerOrder([]);
    setMyId(null);
    setError(null);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const codeFromURL = getRoomCodeFromURL();
      if (!codeFromURL) {
        socket.emit('leave-room');
        resetToLobby();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [socket, resetToLobby]);

  const handleRoomCreated = useCallback((code) => {
    setRoomCode(code);
    history.pushState({ roomCode: code }, '', `/room/${code}`);
  }, []);

  const handleRoomJoined = useCallback((code) => {
    setRoomCode(code);
    const current = getRoomCodeFromURL();
    if (current !== code) {
      history.pushState({ roomCode: code }, '', `/room/${code}`);
    }
  }, []);

  const handleLeaveRoom = useCallback(() => {
    socket.emit('leave-room');
    resetToLobby();
    history.pushState({}, '', '/play');
  }, [socket, resetToLobby]);

  const handleGameStart = useCallback((data) => {
    setMyId(data.you);
    setNicknames(data.nicknames);
    setBotFlags(data.bots || {});
    setPlayerOrder(data.players || []);
    setGameState({
      hand: data.hand,
      table: [],
      turn: data.firstPlayer,
      balances: data.balances,
      opponents: buildOpponents(data.players, data.you, 13),
      mustPlay3S: data.mustPlay3S || false,
      passedPlayers: [],
      finished: [],
      away: [],
      stake: data.stake,
    });
    setError(null);
  }, []);

  const handleGameState = useCallback((data) => {
    setGameState((prev) => ({
      ...prev,
      hand: data.hand,
      table: data.table,
      turn: data.turn,
      balances: data.balances,
      opponents: data.opponents || prev?.opponents || {},
      lastPlay: data.lastPlay,
      passedBy: data.passedBy,
      newRound: data.newRound,
      passedPlayers: data.passedPlayers || [],
      finished: data.finished || [],
      away: data.away || [],
      mustPlay3S: data.mustPlay3S || false,
    }));
    if (data.nicknames) setNicknames(data.nicknames);
    if (data.bots) setBotFlags(data.bots);
  }, []);

  useEffect(() => {
    const askToRejoin = () => socket.emit('rejoin');
    const onRejoined = ({ roomCode: code, start, state, handOver }) => {
      setRoomCode(code);
      if (getRoomCodeFromURL() !== code) history.replaceState({ roomCode: code }, '', `/room/${code}`);
      handleGameStart(start);
      handleGameState(state);
      setRejoinResult(handOver ? { ...handOver, at: Date.now() } : null);
    };
    if (socket.connected) askToRejoin();
    socket.on('connect', askToRejoin);
    socket.on('rejoined', onRejoined);
    return () => {
      socket.off('connect', askToRejoin);
      socket.off('rejoined', onRejoined);
    };
  }, [socket, handleGameStart, handleGameState]);

  if (!gameState) {
    return (
      <Lobby
        socket={socket}
        roomCode={roomCode}
        urlRoomCode={urlRoomCode}
        onRoomCreated={handleRoomCreated}
        onRoomJoined={handleRoomJoined}
        onLeaveRoom={handleLeaveRoom}
        onGameStart={handleGameStart}
        onGameState={handleGameState}
        error={error}
        setError={setError}
      />
    );
  }

  return (
    <Game
      socket={socket}
      gameState={gameState}
      setGameState={setGameState}
      nicknames={nicknames}
      botFlags={botFlags}
      myId={myId}
      playerOrder={playerOrder}
      roomCode={roomCode}
      rejoinResult={rejoinResult}
      onGameState={handleGameState}
      onGameStart={handleGameStart}
    />
  );
}

function buildOpponents(players, myId, cardCount) {
  const opponents = {};
  for (const pid of players || []) {
    if (pid !== myId) {
      opponents[pid] = cardCount;
    }
  }
  return opponents;
}
