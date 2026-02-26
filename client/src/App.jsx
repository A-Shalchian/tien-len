import { useState } from 'react';
import { useSocket } from './hooks/useSocket.js';
import Lobby from './components/Lobby.jsx';
import Game from './components/Game.jsx';

export default function App() {
  const socket = useSocket();
  const [gameState, setGameState] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [nicknames, setNicknames] = useState({});
  const [myId, setMyId] = useState(null);
  const [error, setError] = useState(null);

  const handleRoomCreated = (code) => {
    setRoomCode(code);
  };

  const handleGameStart = (data) => {
    setMyId(data.you);
    setNicknames(data.nicknames);
    setGameState({
      hand: data.hand,
      table: [],
      turn: data.firstPlayer,
      balances: data.balances,
      opponentCardCount: 13,
      mustPlay3S: data.mustPlay3S || false,
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
      opponentCardCount: data.opponentCardCount,
      lastPlay: data.lastPlay,
      passedBy: data.passedBy,
      newRound: data.newRound,
    }));
    if (data.nicknames) setNicknames(data.nicknames);
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
      myId={myId}
      roomCode={roomCode}
      onGameState={handleGameState}
      onGameStart={handleGameStart}
    />
  );
}
