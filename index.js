import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

const app = express();
const server = createServer(app);
const io = new Server(server);

const port = 3000;

let games = {};
let waitingPlayer = null;

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  if (waitingPlayer) {
    const gameId = uuidv4();
    games[gameId] = {
      players: { [waitingPlayer.id]: "X", [socket.id]: "O" },
      board: Array(9).fill(null),
      currentPlayer: waitingPlayer.id,
      moves: 0,
    };
    waitingPlayer.emit("game_start", {
      gameId,
      symbol: "X",
      opponent: socket.id,
    });
    socket.emit("game_start", {
      gameId,
      symbol: "O",
      opponent: waitingPlayer.id,
    });
    console.log(
      `Game started between ${waitingPlayer.id} (X) and ${socket.id} (O)\n GameId: ${gameId}`
    );
    waitingPlayer = null;
  } else {
    waitingPlayer = socket;
    socket.emit("waiting", "Waiting for an opponent...");
    console.log(`Player ${socket.id} is waiting for an opponent...`);
  }

  socket.on("make_move", ({ gameId, index }) => {
    const game = games[gameId];
    if (
      game &&
      game.board[index] === null &&
      game.currentPlayer === socket.id
    ) {
      game.board[index] = game.players[socket.id];
      game.moves += 1;
      game.currentPlayer = Object.keys(game.players).find(
        (id) => id !== socket.id
      );

      io.to(game.players[socket.id]).emit("update_board", {
        board: game.board,
        gameId,
      });
      io.to(game.players[game.currentPlayer]).emit("update_board", {
        board: game.board,
        gameId,
      });

      console.log(`Player ${socket.id} made a move.`);
      displayBoard(game.board);

      const winner = checkWinner(game.board);
      if (winner) {
        io.to(game.players[socket.id]).emit("game_over", { winner });
        io.to(game.players[game.currentPlayer]).emit("game_over", { winner });
        console.log(`Game ${gameId} over. Winner: ${winner}`);
        delete games[gameId];
      } else if (game.moves === 9) {
        io.to(game.players[socket.id]).emit("game_over", { winner: "draw" });
        io.to(game.players[game.currentPlayer]).emit("game_over", {
          winner: "draw",
        });
        console.log(`Game ${gameId} over. It's a draw.`);
        delete games[gameId];
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
    for (const [gameId, game] of Object.entries(games)) {
      if (game.players[socket.id]) {
        const opponentId = Object.keys(game.players).find(
          (id) => id !== socket.id
        );
        io.to(opponentId).emit("game_over", {
          winner: "opponent_disconnected",
        });
        console.log(`Game ${gameId} over. Player ${socket.id} disconnected.`);
        delete games[gameId];
        break;
      }
    }
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

function checkWinner(board) {
  const winningCombinations = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // Rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // Columns
    [0, 4, 8],
    [2, 4, 6], // Diagonals
  ];

  for (const [a, b, c] of winningCombinations) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return null;
}

function displayBoard(board) {
  const display = board.map((cell) => (cell ? cell : "_"));
  console.log(`
    ${display[0]} | ${display[1]} | ${display[2]}
    ---------
    ${display[3]} | ${display[4]} | ${display[5]}
    ---------
    ${display[6]} | ${display[7]} | ${display[8]}
  `);
}
