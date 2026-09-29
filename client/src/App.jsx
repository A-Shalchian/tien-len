import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './hooks/useSocket.js';
import Lobby from './components/Lobby.jsx';
import Game from './components/Game.jsx';
import ScoreTracker from './pages/ScoreTracker.jsx';
import Landing from './pages/Landing.jsx';
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';
import Profile from './pages/Profile.jsx';

function getRoomCodeFromURL() {
  const match = window.location.pathname.match(/^\/room\/([A-Z0-9]{4})$/i);
  return match ? match[1].toUpperCase() : null;
}

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith('/scores')) {
    return <ScoreTracker />;
  }
  if (path === '/privacy') {
    return <Privacy />;
  }
  if (path === '/terms') {
    return <Terms />;
  }
  if (path === '/profile') {
    return <Profile />;
  }
  const profileMatch = path.match(/^\/u\/([A-Za-z0-9_-]+)$/);
  if (profileMatch) {
    return <Profile userId={profileMatch[1]} />;
  }
  if (path === '/' || path === '') {
    return <Landing />;
  }
  return <GameApp />;
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
    }));
    if (data.nicknames) setNicknames(data.nicknames);
    if (data.bots) setBotFlags(data.bots);
  }, []);

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
