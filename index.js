import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

const app = express();
const server = createServer(app);
const io = new Server(server);

const port = 3000;

let games = {};
let waitingPlayers = [];

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Add the new player to the waitingPlayers queue
  waitingPlayers.push(socket);

  if (waitingPlayers.length >= 2) {
    // If there are at least two players waiting, start a new game
    const player1 = waitingPlayers.shift();
    const player2 = waitingPlayers.shift();

    const gameId = uuidv4();
    games[gameId] = {
      players: { [player1.id]: "X", [player2.id]: "O" },
      board: Array(9).fill(null),
      currentPlayer: player1.id,
      moves: 0,
    };

    player1.emit("game_start", { gameId, symbol: "X", opponent: player2.id });
    player2.emit("game_start", { gameId, symbol: "O", opponent: player1.id });

    console.log(`Game started between ${player1.id} (X) and ${player2.id} (O)`);
  } else {
    socket.emit("waiting", "Waiting for an opponent...");
    console.log(`Player ${socket.id} is waiting for an opponent...`);
  }

  socket.on("make_move", ({ gameId, index }) => {
    const game = games[ gameId ];
     if (!game) {
       socket.emit("error", {
         message: "Invalid gameId, Wait for an opponent to join the game",
       });
       console.log(
         `Player ${socket.id} attempted to make a move with an invalid gameId`
       );
       return;
     }

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
    if (waitingPlayers && waitingPlayers.id === socket.id) {
      waitingPlayers = [];
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
