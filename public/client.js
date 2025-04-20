// public/client.js (Refactored for Multiplayer Target Word Game with Socket.IO)

// --- Establish Socket.IO Connection ---
const socket = io();
console.log("(Client) Socket.IO initialized for Target Word game.");

// --- DOM Element References (Update these IDs in index.html) ---
const statusMessageEl = document.getElementById('status-message'); // General status
const playerRoleEl = document.getElementById('player-role');     // Display Player 1/2/Spectator
const errorDisplayEl = document.getElementById('error-display');   // Display errors
const targetWordDisplayEl = document.getElementById('target-word-display'); // Display the target word
const expressionInputEl = document.getElementById('expression-input'); // Input for word arithmetic
const submitExpressionButtonEl = document.getElementById('submit-expression-button'); // Button to submit
const submissionsAreaEl = document.getElementById('submissions-area'); // Area to show player submissions (e.g., P1 submitted '...')
const finalResultsEl = document.getElementById('final-results');   // Area to display final scores/winner
const resetButtonEl = document.getElementById('reset-button'); // Keep debug reset button

// --- Client State ---
let myRole = null;
let myPlayerId = null; // Store socket ID
let gameActive = false;

// --- Utility Functions ---

function updateStatus(message) {
    if (statusMessageEl) statusMessageEl.textContent = message;
    console.log(`(Client) Status: ${message}`);
}

function clearError() {
    if (errorDisplayEl) {
        errorDisplayEl.textContent = '';
        errorDisplayEl.style.display = 'none';
    }
}

function showError(message) {
    console.error(`(Client) Error: ${message}`);
    if (errorDisplayEl) {
        errorDisplayEl.textContent = message;
        errorDisplayEl.style.display = 'block';
    }
}

// Clears dynamic game areas
function clearGameAreas() {
    if (targetWordDisplayEl) targetWordDisplayEl.textContent = '---';
    if (submissionsAreaEl) submissionsAreaEl.innerHTML = ''; // Clear previous submissions
    if (finalResultsEl) finalResultsEl.innerHTML = '';    // Clear previous results
    if (expressionInputEl) expressionInputEl.value = '';   // Clear input field
}

// Enable or disable the expression input and submit button
function setInputActive(isActive) {
    if (expressionInputEl && submitExpressionButtonEl) {
        expressionInputEl.disabled = !isActive;
        submitExpressionButtonEl.disabled = !isActive;
        if (isActive) {
            console.log("(Client) Enabling input.");
            expressionInputEl.focus();
        } else {
            console.log("(Client) Disabling input.");
            expressionInputEl.value = ''; // Clear input when disabled
        }
    } else {
        console.warn("(Client) Input elements not found for setInputActive.");
    }
}

// Displays current player submissions (simple version)
function displaySubmissions(submissions) {
     if (!submissionsAreaEl) return;
     submissionsAreaEl.innerHTML = '<h4>Submissions:</h4>';
     if (Object.keys(submissions).length === 0) {
          submissionsAreaEl.innerHTML += '<p>Waiting for players...</p>';
          return;
     }
     // Iterate through stored player info if needed, or just use what's in submissions
     // This example assumes submissions object keys are socket IDs
     // You might need a mapping from ID to Role from game start/update events
     for (const playerId in submissions) {
          const sub = submissions[playerId];
          // Try to get role if possible (might need to store player list locally)
          // const playerRole = getPlayerRoleById(playerId); // Hypothetical function
          submissionsAreaEl.innerHTML += `<p>Player (${playerId.substring(0,4)}): "${sub.expression}"</p>`;
     }
}

// Displays final results and winner
function displayFinalResults(data) {
     if (!finalResultsEl) return;
     finalResultsEl.innerHTML = `<h3>Game Over!</h3>`;
     finalResultsEl.innerHTML += `<p>Target Word: ${data.targetWord || 'N/A'}</p>`;
     finalResultsEl.innerHTML += `<p><strong>${data.reason || 'Results:'}</strong></p>`;
     if (data.results && data.results.length > 0) {
          const ul = document.createElement('ul');
          data.results.forEach(res => {
               const li = document.createElement('li');
               li.textContent = `${res.role}: "${res.expression}" (Score: ${res.score})`;
               ul.appendChild(li);
          });
          finalResultsEl.appendChild(ul);
     } else {
          finalResultsEl.innerHTML += '<p>(No results available)</p>';
     }
}


// --- Socket Event Listeners (Receiving from Server) ---

socket.on('connect', () => {
    myPlayerId = socket.id;
    updateStatus("Connected to server!");
    clearError();
    clearGameAreas();
    setInputActive(false);
    console.log(`(Client) Connected with socket ID: ${myPlayerId}`);
});

socket.on('disconnect', (reason) => {
    updateStatus(`Disconnected: ${reason}. Please refresh.`);
    if (playerRoleEl) playerRoleEl.textContent = '---';
    myRole = null;
    myPlayerId = null;
    gameActive = false;
    setInputActive(false);
    showError('Connection lost. Please refresh the page to reconnect.');
});

socket.on('assign_role', (role) => {
    myRole = role;
    if (playerRoleEl) playerRoleEl.textContent = myRole;
    console.log(`(Client) Assigned role: ${myRole}`);
    if (myRole === 'Spectator') {
        setInputActive(false);
    }
});

socket.on('spectator_info', (data) => {
    updateStatus(data.status || 'Joined as Spectator.');
    setInputActive(false);
    if (data.targetWord && targetWordDisplayEl) {
         targetWordDisplayEl.textContent = `Target: ${data.targetWord}`;
    }
    if (data.submissions) {
         displaySubmissions(data.submissions); // Show current submissions to spectator
    }
});

socket.on('waiting_for_player', () => {
    updateStatus("Waiting for another player to join...");
    setInputActive(false);
    clearGameAreas();
});

socket.on('game_start', (data) => {
    console.log("(Client) Game Start event received:", data);
    clearError();
    clearGameAreas(); // Clear previous round info
    gameActive = true;
    updateStatus(`Game started! Submit your expression.`);
    if (targetWordDisplayEl && data.targetWord) {
        targetWordDisplayEl.textContent = `Target Word: ${data.targetWord}`;
    } else {
        console.error("Game started but target word missing in data:", data);
        showError("Error: Target word not received from server.");
    }
    // Enable input only for players, not spectators
    setInputActive(myRole === 'Player 1' || myRole === 'Player 2');
});

socket.on('player_submitted', (data) => {
    // Received when *any* player submits
    console.log("(Client) Player Submitted event received:", data);
    updateStatus(`${data.role} has submitted their expression.`);
    // Optionally update the submissions display area immediately
    // displaySubmissions(updatedSubmissions); // Need the full submissions object from server ideally
    // If this player just submitted, disable their input
    if (myRole === data.role) {
        setInputActive(false);
        updateStatus(`Your expression "${data.expression}" submitted. Waiting for opponent...`);
    } else if (gameActive && (myRole === 'Player 1' || myRole === 'Player 2')){
        // Opponent submitted, ensure my input is still active if I haven't submitted
         // (Check if already submitted logic might be needed here or rely on server side)
        const mySubmissionExists = false; // TODO: Track if this client has submitted this round
        if (!mySubmissionExists) {
             setInputActive(true); // Keep input active if I haven't submitted
        }
    }
});


socket.on('game_over', (data) => {
    console.log("(Client) Game Over event received:", data);
    clearError();
    gameActive = false;
    setInputActive(false); // Disable input
    updateStatus(`Game Over!`); // Status message from displayFinalResults is better
    displayFinalResults(data); // Show scores and winner
});

socket.on('player_left', (message) => {
    console.log("(Client) Player Left event received:", message);
    updateStatus(message);
    gameActive = false;
    setInputActive(false);
    if (playerRoleEl) playerRoleEl.textContent = (myRole === 'Spectator') ? 'Spectator' : '---';
    // Optionally clear game areas or wait for reset
});

socket.on('game_reset', (data) => {
     console.log("(Client) Game Reset event received:", data);
     updateStatus(data.message || "Game has been reset. Waiting for players...");
     clearGameAreas();
     gameActive = false;
     setInputActive(false);
     if (playerRoleEl) playerRoleEl.textContent = '---'; // Role likely needs reassignment
     myRole = null;
     clearError();
});

socket.on('error_message', (message) => {
    showError(message);
    // Re-enable button only if the error implies a retry is possible
    // (e.g., invalid expression format, not 'not your turn')
    if (gameActive && (myRole === 'Player 1' || myRole === 'Player 2')) {
         // Check if player has already submitted successfully? Needs client-side state.
         // For simplicity, let's re-enable if an error occurs during an active game.
         setInputActive(true); // Re-enable input on error, allowing correction
    }
});


// --- DOM Event Listeners (User Actions) ---

function handleSubmitExpression() {
    if (!gameActive || (myRole !== 'Player 1' && myRole !== 'Player 2')) {
         showError("Cannot submit: Game not active or you are not a player.");
         return;
    }

    const expression = expressionInputEl.value.trim();
    if (expression) {
        console.log(`(Client) Emitting 'submit_expression': ${expression}`);
        socket.emit('submit_expression', expression);
        setInputActive(false); // Disable input after submitting, wait for server response/next round
        clearError();
        updateStatus("Submitting expression..."); // Give feedback
    } else {
        showError("Please enter a word arithmetic expression.");
    }
}

// Listen for clicks on the submit button
if (submitExpressionButtonEl) {
    submitExpressionButtonEl.addEventListener('click', handleSubmitExpression);
}

// Listen for Enter key press in the input field
if (expressionInputEl) {
    expressionInputEl.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' || event.keyCode === 13) {
            event.preventDefault();
            handleSubmitExpression();
        }
    });
}

// Listen for clicks on the debug reset button
if (resetButtonEl) {
    resetButtonEl.addEventListener('click', () => {
        if (confirm("Are you sure you want to request a game reset?")) {
            console.log("(Client) Emitting 'force_reset'");
            socket.emit('force_reset');
        }
    });
}


// --- Initial Setup ---
setInputActive(false); // Ensure input is disabled initially
updateStatus("Connecting to server...");
clearGameAreas();

console.log("(Client) Event listeners setup complete for Target Word game.");