// src/socket/handler.js (Refactored for Multiplayer Target Word Game)

// --- Imports ---
const state = require('../game/state'); // Use our state management module (will need adaptation)

// --- Constants ---
const MAX_PLAYERS = 2;

// --- Main Handler Setup Function ---
// Now accepts io, pythonServiceUrl, and axios instance from server.js
function setupSocketHandlers(io, pythonServiceUrl, axios) {

    // Initialize game state on setup
    state.resetState(); // Use the state reset function
    // Add new state needed for this game - MODIFY state.js or manage here/new module
    let targetWord = null;
    let targetVector = null;
    let playerSubmissions = {}; // Store submissions: { socketId: { expression: '...', score: 0.0 }, ... }
    let wordList = []; // Start with empty list, will be populated by fetch

    console.log("(Socket Handler) Initializing connection listener for Target Word game.");
    console.log(`(Socket Handler) Python service URL: ${pythonServiceUrl}`);

    // --- Helper: Get Word List (UPDATED) ---
    async function fetchWordList() {
        console.log("(Socket Handler) Attempting to fetch word list from Python service...");
        try {
            // *** UPDATED: Call the /get-words endpoint ***
            const response = await axios.get(`${pythonServiceUrl}/get-words`);

            if (response.data && Array.isArray(response.data.words) && response.data.words.length > 0) {
                wordList = response.data.words;
                console.log(`(Socket Handler) Successfully fetched and stored ${wordList.length} words.`);
            } else {
                // Handle cases where response is okay but data is missing/invalid
                console.error("(Socket Handler) Failed to fetch valid word list from Python service. Response data:", response.data);
                wordList = []; // Ensure list is empty on failure
                // Optionally use a fallback list here if critical
                // wordList = ["science", "art", "king", "queen", "technology"];
                // console.warn("(Socket Handler) Using fallback word list due to fetch issue.");
            }
        } catch (error) {
            console.error("(Socket Handler) Error fetching word list:", error.response?.data || error.message);
            wordList = []; // Ensure list is empty on error
            // Optionally use fallback
            // wordList = ["science", "art", "king", "queen", "technology"];
            // console.warn("(Socket Handler) Using fallback word list due to network/server error.");

            // Rethrow or handle error appropriately. If word list is critical for startup,
            // the server might need to prevent games from starting.
            // For now, we log the error and proceed (startGame will fail if list is empty).
        }
        // Optional: Check if list is empty after fetch attempt
        if (wordList.length === 0) {
             console.error("(Socket Handler) CRITICAL: Word list is empty after fetch attempt. Games cannot start correctly.");
        }
    }

    // --- Helper: Start Game (Unchanged from previous version) ---
    async function startGame() {
        console.log("(Socket Handler) Starting new game...");
        state.setGameActive(true);
        playerSubmissions = {}; // Reset submissions for new round/game

        // 1. Choose a target word (ensure wordList is populated)
        if (!wordList || wordList.length === 0) {
             await fetchWordList(); // Attempt to fetch if empty
        }
        // ** Check again after attempting fetch **
        if (!wordList || wordList.length === 0) {
             console.error("(Socket Handler) Cannot start game, word list unavailable.");
             io.emit('error_message', "Server error: Could not load word list to start game.");
             state.setGameActive(false);
             return;
        }
        targetWord = wordList[Math.floor(Math.random() * wordList.length)];
        console.log(`(Socket Handler) Chosen target word: "${targetWord}"`);

        // 2. Get target word embedding from Python service
        try {
            console.log(`(Socket Handler) Getting embedding for target "${targetWord}"...`);
            const response = await axios.post(`${pythonServiceUrl}/get-embedding`, { word: targetWord });
            if (response.data && response.data.vector) {
                targetVector = response.data.vector; // Store the vector
                console.log(`(Socket Handler) Got target vector (length: ${targetVector.length})`);

                // 3. Emit game start event to players
                const players = state.getAllPlayerSockets();
                const playerInfo = Object.values(players)
                    .filter(p => p.role !== 'Spectator')
                    .map(p => ({ id: p.id, role: p.role }));

                io.emit('game_start', {
                    targetWord: targetWord,
                    players: playerInfo
                });
                console.log(`(Socket Handler) Emitted game_start with target "${targetWord}".`);

            } else {
                throw new Error(response.data?.error || "Invalid response from /get-embedding");
            }
        } catch (error) {
            console.error(`(Socket Handler) Error getting target vector for "${targetWord}":`, error.response?.data || error.message);
            targetWord = null; // Reset target if failed
            targetVector = null;
            state.setGameActive(false);
            io.emit('error_message', `Server error starting game: Could not get embedding for target word "${targetWord}".`);
        }
    }

     // --- Helper: End Game/Round (Unchanged from previous version) ---
     function endGame() {
         // ... (Keep the exact same function body as in the previous step) ...
         console.log("(Socket Handler) Ending game/round.");
         if (!state.isGameActive()) return;
         state.setGameActive(false);
         let winnerId = null;
         let bestScore = -Infinity;
         let results = [];
         const playerIds = Object.keys(playerSubmissions);
         if (!targetVector) {
              console.error("(Socket Handler) Cannot determine winner: Target vector is missing.");
              io.emit('game_over', { reason: "Error determining winner: Missing target vector.", results });
              return;
         }
         playerIds.forEach(id => {
             const sub = playerSubmissions[id];
             const playerInfo = state.getPlayerSocketInfo(id);
             if (sub && typeof sub.score === 'number') {
                 results.push({
                     role: playerInfo?.role || `Player (${id.substring(0,4)})`,
                     expression: sub.expression,
                     score: sub.score.toFixed(4)
                 });
                 if (sub.score > bestScore) {
                     bestScore = sub.score;
                     winnerId = id;
                 }
             } else {
                  results.push({
                     role: playerInfo?.role || `Player (${id.substring(0,4)})`,
                     expression: sub?.expression || "(No submission)",
                     score: "N/A"
                 });
             }
         });
         const winnerInfo = winnerId ? state.getPlayerSocketInfo(winnerId) : null;
         const winnerMsg = winnerInfo ? `${winnerInfo.role} wins!` : "It's a tie or no valid scores!";
         console.log(`(Socket Handler) Winner determined: ${winnerInfo?.role || 'None'} with score ${bestScore.toFixed(4)}`);
         io.emit('game_over', {
             reason: winnerMsg,
             results: results,
             targetWord: targetWord
         });
         targetWord = null;
         targetVector = null;
         playerSubmissions = {};
     }


    // --- Connection Event Listener (Unchanged from previous version) ---
    io.on('connection', (socket) => {
        // ... (Keep the exact same function body as in the previous step for 'connection') ...
        const connectedSocketId = socket.id;
        console.log(`(Socket Handler) User connected: ${connectedSocketId}`);
        // --- Player Joining Logic ---
        let assignedRole = 'Spectator';
        let players = state.getAllPlayerSockets(); // Get current players
        let playerCount = Object.values(players).filter(p => p.role !== 'Spectator').length;
        if (playerCount < MAX_PLAYERS && !state.getPlayer1()) {
             assignedRole = 'Player 1';
             state.setPlayer1(connectedSocketId);
             state.addPlayerSocket(connectedSocketId, assignedRole);
        } else if (playerCount < MAX_PLAYERS && !state.getPlayer2()) {
             assignedRole = 'Player 2';
             state.setPlayer2(connectedSocketId);
             state.addPlayerSocket(connectedSocketId, assignedRole);
        } else {
             state.addPlayerSocket(connectedSocketId, assignedRole); // Add as spectator
        }
        console.log(`(Socket Handler) Assigned ${connectedSocketId} as ${assignedRole}.`);
        socket.emit('assign_role', assignedRole); // Inform the client of their role
        // Check if game can start now
        players = state.getAllPlayerSockets(); // Update player list
        playerCount = Object.values(players).filter(p => p.role !== 'Spectator').length;
        if (playerCount === MAX_PLAYERS && !state.isGameActive()) {
            startGame(); // Enough players, start the game
        } else if (playerCount < MAX_PLAYERS && assignedRole !== 'Spectator') {
            socket.emit('waiting_for_player'); // Waiting for more players
        } else if (assignedRole === 'Spectator') {
            if (state.isGameActive()) {
                 socket.emit('spectator_info', { status: 'Game in progress.', targetWord: targetWord, submissions: playerSubmissions });
            } else {
                 socket.emit('spectator_info', { status: 'Waiting for players...' });
            }
        }

        // --- Disconnect Event Listener (Unchanged from previous version) ---
        socket.on('disconnect', () => {
            // ... (Keep the exact same function body as in the previous step for 'disconnect') ...
            console.log(`(Socket Handler) User disconnected: ${connectedSocketId}`);
            const playerInfo = state.getPlayerSocketInfo(connectedSocketId);
            const wasActiveGame = state.isGameActive();
            // Clean up state
            if (playerInfo) {
                 if (playerInfo.role === 'Player 1') state.setPlayer1(null);
                 if (playerInfo.role === 'Player 2') state.setPlayer2(null);
                 state.removePlayerSocket(connectedSocketId);
                 if (playerInfo.role !== 'Spectator' && wasActiveGame) {
                      console.log(`(Socket Handler) Active player ${playerInfo.role} disconnected. Ending game.`);
                      io.emit('player_left', `${playerInfo.role} disconnected. Game over.`);
                      endGame(); // End the game and notify remaining players
                 }
            }
        });

        // --- Player Submit Expression Event Listener (Unchanged from previous version) ---
        socket.on('submit_expression', async (expression) => {
             // ... (Keep the exact same function body as in the previous step for 'submit_expression') ...
             const playerId = socket.id;
             const playerInfo = state.getPlayerSocketInfo(playerId);
             console.log(`(Socket Handler) Received 'submit_expression' from ${playerInfo?.role || playerId}: "${expression}"`);
             // 1. Validations
             if (!state.isGameActive()) return socket.emit('error_message', 'Game is not active.');
             if (!playerInfo || playerInfo.role === 'Spectator') return socket.emit('error_message', 'Spectators cannot submit.');
             if (playerSubmissions[playerId]) return socket.emit('error_message', 'You have already submitted for this round.');
             if (!expression || typeof expression !== 'string' || expression.trim().length === 0) return socket.emit('error_message', 'Invalid expression submitted.');
             if (!targetVector) return socket.emit('error_message', 'Cannot submit: Target word not set correctly.');
             // 2. Call Python service to calculate vector
             let calculatedVector;
             try {
                 const calcResponse = await axios.post(`${pythonServiceUrl}/calculate-vector`, { expression });
                 if (calcResponse.data && calcResponse.data.vector) {
                     calculatedVector = calcResponse.data.vector;
                     console.log(`(Socket Handler) Calculated vector for ${playerInfo.role} (len: ${calculatedVector.length})`);
                 } else { throw new Error(calcResponse.data?.error || "Invalid response from /calculate-vector"); }
             } catch (error) {
                 console.error(`(Socket Handler) Error calculating vector for ${playerInfo.role}:`, error.response?.data || error.message);
                 return socket.emit('error_message', `Server error calculating your expression: ${error.response?.data?.error || error.message}`);
             }
             // 3. Call Python service to compare vector to target
             let similarityScore;
             try {
                 const compareResponse = await axios.post(`${pythonServiceUrl}/compare-to-target`, { target_word: targetWord, calculated_vector: calculatedVector });
                 if (compareResponse.data && typeof compareResponse.data.similarity === 'number') {
                     similarityScore = compareResponse.data.similarity;
                     console.log(`(Socket Handler) Comparison score for ${playerInfo.role}: ${similarityScore.toFixed(4)}`);
                 } else { throw new Error(compareResponse.data?.error || "Invalid response from /compare-to-target"); }
             } catch (error) {
                 console.error(`(Socket Handler) Error comparing vector for ${playerInfo.role}:`, error.response?.data || error.message);
                 return socket.emit('error_message', `Server error comparing your result: ${error.response?.data?.error || error.message}`);
             }
             // 4. Store submission
             playerSubmissions[playerId] = { expression: expression, score: similarityScore };
             console.log(`(Socket Handler) Stored submission for ${playerInfo.role}`);
             // 5. Notify clients of the submission
             io.emit('player_submitted', { role: playerInfo.role, expression: expression });
             // 6. Check if all players have submitted
             const currentPlayers = Object.values(state.getAllPlayerSockets()).filter(p => p.role !== 'Spectator');
             if (Object.keys(playerSubmissions).length === currentPlayers.length) {
                 console.log("(Socket Handler) All players submitted. Ending round/game.");
                 endGame(); // Determine winner and emit game_over
             }
        }); // End 'submit_expression' handler


        // --- Force Reset Listener (Unchanged from previous version) ---
        socket.on('force_reset', () => {
             // ... (Keep the exact same function body as in the previous step for 'force_reset') ...
             console.warn(`(Socket Handler) Force reset requested by ${connectedSocketId}`);
             state.resetState(); // Reset low-level state
             targetWord = null; // Reset game-specific state here
             targetVector = null;
             playerSubmissions = {};
             io.emit('game_reset', { message: `Game manually reset by ${connectedSocketId}. Waiting for players...` });
        });

    }); // End io.on('connection')

    // --- Initial Setup Calls ---
    // Fetch the word list when the server starts
    fetchWordList().catch(err => {
         console.error("Initial word list fetch failed:", err.message);
         // Server will still run, but games won't start until list is available or retried.
    });

    console.log("(Socket Handler) Socket event handler setup complete for Target Word game.");

} // End setupSocketHandlers function

// --- Export the setup function ---
module.exports = setupSocketHandlers;