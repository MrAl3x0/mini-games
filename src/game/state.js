// src/game/state.js (Refactored for Target Word Game)

// --- Private State Variables ---
let _targetWord = null; // The word players are trying to match
let _targetVector = null; // The embedding vector for the target word
let _playerSubmissions = {}; // Stores each player's submission { socketId: { expression: '...', score: 0.0 }, ... }
let _player1 = null; // Holds socket ID for Player 1
let _player2 = null; // Holds socket ID for Player 2
let _currentPlayer = null; // Can potentially track whose turn it is if needed, or null
let _gameActive = false;
let _playerSockets = {}; // Maps socket ID -> { id: socketId, role: 'Player 1'/'Player 2'/'Spectator' }

// --- State Management Functions ---

function resetState() {
    console.log("(State) Resetting game state for Target Word game.");
    _targetWord = null; // Reset target word
    _targetVector = null; // Reset target vector
    _playerSubmissions = {}; // Clear previous submissions
    _player1 = null;
    _player2 = null;
    _currentPlayer = null; // Reset current player if using turns
    _gameActive = false;
    _playerSockets = {};
    // Default starting word is no longer needed here, target is chosen randomly
}

function getFullState() {
    // Return a copy of the state
    return {
        targetWord: _targetWord,
        targetVector: _targetVector ? [..._targetVector] : null, // Return copy of vector if exists
        playerSubmissions: JSON.parse(JSON.stringify(_playerSubmissions)), // Deep copy submissions
        player1: _player1,
        player2: _player2,
        currentPlayer: _currentPlayer,
        gameActive: _gameActive,
        playerSockets: { ..._playerSockets }, // Return copy of object
    };
}

// --- Getters ---
const getTargetWord = () => _targetWord;
const getTargetVector = () => _targetVector ? [..._targetVector] : null; // Return a copy
const getPlayerSubmissions = () => JSON.parse(JSON.stringify(_playerSubmissions)); // Return deep copy
const getPlayerSubmission = (id) => _playerSubmissions[id] ? JSON.parse(JSON.stringify(_playerSubmissions[id])) : null; // Return copy
const getPlayer1 = () => _player1;
const getPlayer2 = () => _player2;
const getCurrentPlayer = () => _currentPlayer;
const isGameActive = () => _gameActive;
const getPlayerSocketInfo = (id) => _playerSockets[id];
const getAllPlayerSockets = () => ({ ..._playerSockets });

// --- Setters / Mutators ---
function setTargetWord(word) {
    if (typeof word === 'string' || word === null) {
        _targetWord = word ? word.trim() : null;
        console.log(`(State) Target word set to: "${_targetWord}"`);
    } else {
        console.error("(State) Attempted to set invalid target word:", word);
    }
}

function setTargetVector(vector) {
    // Add basic validation if needed (e.g., is it an array of numbers?)
    if (Array.isArray(vector) || vector === null) {
        _targetVector = vector ? [...vector] : null; // Store a copy
        console.log(`(State) Target vector ${vector ? 'set (length: ' + vector.length + ')' : 'cleared'}.`);
    } else {
         console.error("(State) Attempted to set invalid target vector:", vector);
    }
}

function setPlayerSubmission(id, submission) {
    // submission should be like { expression: '...', score: 0.X }
    if (id && submission && typeof submission === 'object') {
         // Store a copy to prevent external modification
        _playerSubmissions[id] = JSON.parse(JSON.stringify(submission));
        console.log(`(State) Set submission for ${id}:`, _playerSubmissions[id]);
    } else {
        console.error("(State) Attempted to set invalid player submission:", { id, submission });
    }
}

function clearPlayerSubmissions() {
    _playerSubmissions = {};
    console.log("(State) Cleared all player submissions.");
}


function setPlayer1(id) {
    console.log(`(State) Setting Player 1 to: ${id}`);
    _player1 = id;
}

function setPlayer2(id) {
    console.log(`(State) Setting Player 2 to: ${id}`);
    _player2 = id;
}

function setCurrentPlayer(id) {
    console.log(`(State) Setting Current Player to: ${id}`);
    _currentPlayer = id;
}

function setGameActive(isActive) {
    if (typeof isActive === 'boolean') {
        _gameActive = isActive;
         console.log(`(State) Game active set to: ${isActive}`);
    } else {
        console.error("(State) Attempted to set invalid game active status:", isActive);
    }
}

function addPlayerSocket(id, role) {
     if (id && role) {
         _playerSockets[id] = { id: id, role: role };
         console.log(`(State) Added/Updated player socket: ${id} as ${role}`);
     } else {
          console.error("(State) Attempted to add invalid player socket:", { id, role });
     }
}

function removePlayerSocket(id) {
    if (_playerSockets[id]) {
        const role = _playerSockets[id].role;
        delete _playerSockets[id];
        console.log(`(State) Removed player socket: ${id} (was ${role})`);
        return true; // Indicate success
    }
    console.warn(`(State) Attempted to remove non-existent player socket: ${id}`);
    return false; // Indicate not found
}


// --- Exports ---
module.exports = {
    resetState,
    getFullState,
    // Target Word related
    getTargetWord,
    getTargetVector,
    setTargetWord,
    setTargetVector,
    // Submissions related
    getPlayerSubmissions,
    getPlayerSubmission,
    setPlayerSubmission,
    clearPlayerSubmissions,
    // Player / Game Status related
    getPlayer1,
    getPlayer2,
    getCurrentPlayer, // Use if implementing strict turns
    isGameActive,
    getPlayerSocketInfo,
    getAllPlayerSockets,
    setPlayer1,
    setPlayer2,
    setCurrentPlayer, // Use if implementing strict turns
    setGameActive,
    addPlayerSocket,
    removePlayerSocket,
};