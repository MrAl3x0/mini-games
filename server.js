// server.js - Main application entry point

// --- Imports ---
require('dotenv').config(); // Load .env variables ASAP
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const axios = require('axios'); // *** ADDED: HTTP client for Python service ***
const setupSocketHandlers = require('./src/socket/handler'); // Import the function that sets up socket listeners

// --- Configuration & Environment Check ---
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Used by Python service, not directly here now

// *** ADDED: URL for the Python backend service ***
// Ensure this matches where your Python service is running
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001';

// Check if the OpenAI key is set (the Python service needs it)
if (!OPENAI_API_KEY) {
    // Keep this check as a reminder, though Node doesn't use it directly anymore
    console.warn("WARNING: OPENAI_API_KEY environment variable is not set.");
    console.warn("         The Python service will need it to generate embeddings for new words.");
    // No longer exiting Node app if key is missing, Python service handles it.
    // process.exit(1);
}


// --- Express App Initialization ---
const app = express();

// --- HTTP Server Creation ---
const server = http.createServer(app);

// --- Socket.IO Initialization ---
const io = new Server(server, {
    cors: {
        origin: "*", // IMPORTANT: Restrict in production
        methods: ["GET", "POST"]
    }
});

// --- Express Middleware ---
// ** REMOVED: express.json() - Not needed if primary interaction is via WebSockets **
// app.use(express.json());

// Serve static files (index.html, style.css, client.js)
app.use(express.static(path.join(__dirname, 'public')));

// --- Core Application Logic Setup ---
// Pass the io instance AND the axios instance (or just the URL)
// to the handler setup function.
console.log(`Configuring socket handlers to use Python service at: ${PYTHON_SERVICE_URL}`);
setupSocketHandlers(io, PYTHON_SERVICE_URL, axios); // Pass axios instance

// --- API Routes ---

// ** REMOVED: Placeholder '/api/word-arithmetic' endpoint **

// Default Route (Optional - Good for testing server is up)
app.get('/ping', (req, res) => {
  res.send('pong');
});


// --- Start the Server ---
server.listen(PORT, () => {
    console.log(`------------------------------------`);
    // ** Updated server title **
    console.log(` Mini Games Server (Multiplayer Target Word)`);
    console.log(` Server listening on port ${PORT}`);
    console.log(` Access frontend via: http://localhost:${PORT}`);
    console.log(` Python service expected at: ${PYTHON_SERVICE_URL}`); // Log Python service URL
    console.log(`------------------------------------`);
});

// --- Basic Error Handling (Optional) ---
server.on('error', (error) => {
    console.error('Server Error:', error);
});