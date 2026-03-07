import { useState } from 'react';
import { useSocket } from './hooks/useSocket.js';
import Lobby from './components/Lobby.jsx';
import Game from './components/Game.jsx';

export default function App() {
  const socket = useSocket();
  const [gameState, setGameState] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [nicknames, setNicknames] = useState({});
  const [botFlags, setBotFlags] = useState({});
  const [myId, setMyId] = useState(null);
  const [playerOrder, setPlayerOrder] = useState([]);
  const [error, setError] = useState(null);

  const handleRoomCreated = (code) => {
    setRoomCode(code);
  };

  const handleGameStart = (data) => {
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
  };

  const handleGameState = (data) => {
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
  };

  if (!gameState) {
    return (
      <Lobby
        socket={socket}
        roomCode={roomCode}
        onRoomCreated={handleRoomCreated}
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
