// src/game/engine.js

// --- Imports ---
const state = require('./state'); // Our state management module
const { getEmbedding } = require('../services/embeddingService'); // Our OpenAI API service

// --- Configuration ---
const SIMILARITY_THRESHOLD = 0.35; // Adjust based on testing (OpenAI ada-002/3-small often needs lower than older models)

// --- Helper Functions ---
// Calculates the cosine similarity between two vectors (embeddings)
// Duplicated here from handler (could be moved to a shared utils file)
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        console.error("(Engine:Similarity) Invalid vectors:", vecA ? vecA.length : 'null', vecB ? vecB.length : 'null');
        return 0;
    }
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) {
        console.warn("(Engine:Similarity) Zero vector encountered.");
        return 0;
    }
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(-1, Math.min(1, similarity)); // Clamp to [-1, 1]
}

// --- Internal Game Logic Functions ---

// Starts the game if conditions are met
function _startGameIfReady() {
    if (state.getPlayer1() && state.getPlayer2() && !state.isGameActive()) {
        console.log("(Engine) Both players present. Starting game.");
        state.setGameActive(true);
        state.setCurrentPlayer(state.getPlayer1()); // Player 1 always starts
        const p1Role = state.getPlayerSocketInfo(state.getPlayer1())?.role || 'Player 1';
        return { // Return data needed by handler to emit 'game_start'
            gameStarted: true,
            initialState: {
                currentWord: state.getCurrentWord(),
                nextPlayer: p1Role, // Send role name
                history: state.getHistory()
            }
        };
    }
    return { gameStarted: false };
}

// Ends the game (used internally)
function _endGame() {
     console.log("(Engine) Ending game.");
     state.setGameActive(false);
     state.setCurrentPlayer(null); // No player's turn when game is over
     // state is reset elsewhere (e.g., in resetGame or when players leave)
}

// --- Exported Engine Functions ---

/**
 * Adds a player upon connection. Assigns role and starts game if possible.
 * @param {string} socketId - The socket ID of the connecting player.
 * @returns {object} Result containing assigned role and game start status/data.
 */
function addPlayer(socketId) {
    console.log(`(Engine) Adding player: ${socketId}`);
    let assignedRole = 'Spectator'; // Default

    if (!state.getPlayer1()) {
        assignedRole = 'Player 1';
        state.setPlayer1(socketId);
        state.addPlayerSocket(socketId, assignedRole);
        console.log(`(Engine) Assigned ${socketId} as Player 1.`);
    } else if (!state.getPlayer2()) {
        assignedRole = 'Player 2';
        state.setPlayer2(socketId);
        state.addPlayerSocket(socketId, assignedRole);
        console.log(`(Engine) Assigned ${socketId} as Player 2.`);
    } else {
         state.addPlayerSocket(socketId, assignedRole); // Add as spectator
         console.log(`(Engine) ${socketId} joined as Spectator.`);
    }

    const gameStartResult = _startGameIfReady();

    // Send back all info the handler needs
    return {
        role: assignedRole,
        gameStarted: gameStartResult.gameStarted,
        initialState: gameStartResult.initialState // Will be undefined if game didn't start here
    };
}

/**
 * Removes a player upon disconnection. Ends game if an active player leaves.
 * @param {string} socketId - The socket ID of the disconnecting player.
 * @returns {object} Result indicating if a player left and if the game ended.
 */
function removePlayer(socketId) {
     console.log(`(Engine) Removing player: ${socketId}`);
    const playerInfo = state.getPlayerSocketInfo(socketId);
    const wasActiveGame = state.isGameActive();
    let playerLeftRole = null;
    let gameEnded = false;

    if (playerInfo && playerInfo.role !== 'Spectator') {
        playerLeftRole = playerInfo.role;
        // Remove player from P1/P2 slot
        if (socketId === state.getPlayer1()) {
            state.setPlayer1(null);
        } else if (socketId === state.getPlayer2()) {
            state.setPlayer2(null);
        }

        if (wasActiveGame) {
             console.log(`(Engine) Active player ${playerLeftRole} disconnected. Ending game.`);
            _endGame(); // Mark game as inactive
            gameEnded = true;
            // Consider resetting fully here or let resetGame handle it
            // state.resetState(); // Option: Reset immediately
        }
    }
    // Always remove from socket list regardless of role
    state.removePlayerSocket(socketId);

    // Check if we should reset fully (e.g., if both P1/P2 are now null)
    // This might be better handled by a dedicated reset call from the handler if needed
    // if (!state.getPlayer1() && !state.getPlayer2()) {
    //     state.resetState();
    // }

    return { playerLeftRole, gameEnded, reason: gameEnded ? `${playerLeftRole} disconnected.` : null };
}

/**
 * Processes a word submitted by a player. Checks similarity, updates state, or ends game.
 * @param {string} playerId - The socket ID of the player submitting the word.
 * @param {string} newWord - The word/phrase submitted.
 * @returns {Promise<object>} A promise resolving to the result of the submission (accepted, rejected, error).
 */
async function submitWord(playerId, newWord) {
    console.log(`(Engine) Processing submission from ${playerId}: "${newWord}"`);

    // 1. Validations
    if (!state.isGameActive()) {
        return { error: 'Game is not active.' };
    }
    if (playerId !== state.getCurrentPlayer()) {
        return { error: 'Not your turn!' };
    }
    if (!newWord || typeof newWord !== 'string' || newWord.trim().length === 0 || newWord.length > 50) {
        return { error: 'Invalid word submitted (empty or too long).' };
    }

    const currentWord = state.getCurrentWord();
    newWord = newWord.trim().toLowerCase(); // Normalize

    if (newWord === currentWord.toLowerCase()) {
        return { error: 'Cannot submit the same word twice in a row.' };
    }

    // 2. Get Embeddings
    console.log(`(Engine) Getting embeddings for: "${currentWord}" and "${newWord}"`);
    let embedding1, embedding2;
    try {
        [embedding1, embedding2] = await Promise.all([
            getEmbedding(currentWord),
            getEmbedding(newWord)
        ]);
    } catch (error) {
        console.error("(Engine) Error fetching embeddings in Promise.all:", error);
        return { error: 'API error fetching embeddings. Please try again.' };
    }


    if (!embedding1 || !embedding2) {
         console.error(`(Engine) Embedding failed. Prev word (${currentWord}): ${!!embedding1}, New word (${newWord}): ${!!embedding2}`);
        return { error: 'Could not get embeddings for comparison (API error or invalid word).' };
    }

    // 3. Calculate Similarity & Check Threshold
    const similarity = cosineSimilarity(embedding1, embedding2);
    console.log(`(Engine) Similarity between "${currentWord}" and "${newWord}": ${similarity.toFixed(4)}`);

    if (similarity >= SIMILARITY_THRESHOLD) {
        // 4. Move Accepted
        console.log("(Engine) Move accepted.");
        state.setCurrentWord(newWord);
        state.addToHistory(newWord);
        const nextPlayerId = (playerId === state.getPlayer1()) ? state.getPlayer2() : state.getPlayer1();
        state.setCurrentPlayer(nextPlayerId);

        const nextPlayerInfo = state.getPlayerSocketInfo(nextPlayerId);

        return {
            moveAccepted: true,
            newState: {
                currentWord: state.getCurrentWord(),
                nextPlayer: nextPlayerInfo?.role || 'N/A', // Send role name
                history: state.getHistory(),
                similarity: similarity.toFixed(4)
            }
        };
    } else {
        // 5. Move Rejected - Game Over
        console.log(`(Engine) Move rejected. Similarity ${similarity.toFixed(4)} below threshold ${SIMILARITY_THRESHOLD}. Game Over.`);
        _endGame(); // Mark game as inactive

        const winnerId = (playerId === state.getPlayer1()) ? state.getPlayer2() : state.getPlayer1();
        const winnerInfo = state.getPlayerSocketInfo(winnerId);
        const reason = `"${newWord}" not related enough to "${currentWord}" (Sim: ${similarity.toFixed(4)}).`;

        return {
            moveAccepted: false,
            gameOver: true,
            winner: winnerInfo?.role || 'Unknown',
            reason: reason,
            finalHistory: state.getHistory()
            // Game state is marked inactive, but not fully reset here.
            // Handler will call resetGame if needed after emitting game_over.
        };
    }
}

/**
 * Resets the game state fully.
 * @param {string} reason - The reason for the reset (optional).
 * @returns {object} Object containing reset confirmation and initial state.
 */
function resetGame(reason = "Game was reset.") {
     console.log(`(Engine) Received request to reset game. Reason: ${reason}`);
     state.resetState();
     return {
         gameReset: true,
         reason: reason,
         initialState: { // Provide the new initial state after reset
              currentWord: state.getCurrentWord(),
              history: state.getHistory()
         }
     };
}

// --- Exports ---
module.exports = {
    addPlayer,
    removePlayer,
    submitWord,
    resetGame,
    // We don't need to export internal helpers like _startGameIfReady, _endGame
};