// admin.js

// ❗️❗️❗️ REPLACE WITH YOUR SUPABASE CREDENTIALS ❗️❗️❗️
const supabaseUrl = 'https://ussbvpdmhlllzimnxdaj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzc2J2cGRtaGxsbHppbW54ZGFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2OTMxMTUsImV4cCI6MjA3MjI2OTExNX0.0bEpqQ9gPqHL37CTgXkb2vo3yibGGDs-_WkhUNORLHo';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// ---- STATE ----
let currentRound = 1;

// ---- DOM ELEMENTS ----
const addPlayerForm = document.getElementById('add-player-form');
const playerNameInput = document.getElementById('player-name');
const playerChecklist = document.getElementById('player-checklist');
const currentRoundDisplay = document.getElementById('current-round-display');
const generatePairsBtn = document.getElementById('generate-pairs-btn');
const unplayedMatchesContainer = document.getElementById('unplayed-matches');
const finalizeRoundBtn = document.getElementById('finalize-round-btn');
const statusMessage = document.getElementById('status-message');
const showResetModalBtn = document.getElementById('show-reset-modal-btn');
const resetModal = document.getElementById('reset-modal');
const cancelResetBtn = document.getElementById('cancel-reset-btn');
const confirmResetBtn = document.getElementById('confirm-reset-btn');

// ---- HELPER FUNCTIONS ----
function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${isError ? 'error' : 'success'}`;
    statusMessage.style.display = 'block';
    setTimeout(() => { statusMessage.style.display = 'none'; }, 5000);
}

// ---- DATA FETCHING AND RENDERING ----
async function fetchTournamentState() {
    const { data, error } = await supabase
        .from('tournament_state')
        .select('current_round')
        .eq('id', 1)
        .single();
    
    if (error || !data) {
        console.error('Error fetching tournament state:', error);
        showStatus('Could not fetch tournament state. Please ensure a row exists in the tournament_state table.', true);
    } else {
        currentRound = data.current_round;
        currentRoundDisplay.textContent = currentRound;
    }
}

async function fetchAndDisplayPlayers() {
    const { data: players, error } = await supabase.from('players').select('id, name').order('name');
    if (error) { console.error('Error fetching players:', error); return; }
    
    playerChecklist.innerHTML = '';
    if (players.length === 0) {
        playerChecklist.innerHTML = '<p>No players added yet.</p>';
        return;
    }

    players.forEach(player => {
        const div = document.createElement('div');
        div.innerHTML = `<input type="checkbox" id="player-${player.id}" value="${player.id}" checked>
                         <label for="player-${player.id}">${player.name}</label>`;
        playerChecklist.appendChild(div);
    });
}

async function fetchAndDisplayUnplayedGames() {
    const { data: matches, error } = await supabase
        .from('games')
        .select(`
            id, round_number, winning_team,
            team1_player1:players!games_team1_player1_id_fkey(name),
            team1_player2:players!games_team1_player2_id_fkey(name),
            team2_player1:players!games_team2_player1_id_fkey(name),
            team2_player2:players!games_team2_player2_id_fkey(name)
        `)
        .eq('round_number', currentRound)
        .order('id');

    if (error) { console.error('Error fetching matches:', error); return; }

    if (matches.length === 0) {
        unplayedMatchesContainer.innerHTML = '<p>No matches generated for this round yet.</p>';
        return;
    }

    unplayedMatchesContainer.innerHTML = '';
    matches.forEach(match => {
        const card = document.createElement('div');
        card.className = 'match-card';
        
        let content = `<h3>Round ${match.round_number} (Game ID: ${match.id})</h3>`;
        const team1Name = `${match.team1_player1.name} & ${match.team1_player2.name}`;
        const team2Name = `${match.team2_player1.name} & ${match.team2_player2.name}`;
        
        if (!match.winning_team) {
            content += `
                <div class="team">${team1Name}</div>
                <button class="win-btn" data-game-id="${match.id}" data-winning-team="1">Declare Winner</button>
                <div class="vs">VS</div>
                <div class="team">${team2Name}</div>
                <button class="win-btn" data-game-id="${match.id}" data-winning-team="2">Declare Winner</button>
            `;
        } else {
            const winnerName = match.winning_team === 1 ? team1Name : team2Name;
            content += `
                <div class="team">${team1Name}</div>
                <div class="vs">VS</div>
                <div class="team">${team2Name}</div>
                <div class="winner-declared">Winner: <strong>${winnerName}</strong></div>
                <button class="undo-btn" data-game-id="${match.id}">Undo / Change Winner</button>
            `;
        }
        card.innerHTML = content;
        unplayedMatchesContainer.appendChild(card);
    });
}

// ---- EVENT LISTENERS ----
addPlayerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = playerNameInput.value.trim();
    if (!newName) return;
    const { error } = await supabase.from('players').insert({ name: newName });
    if (error) { showStatus(`Error adding player: ${error.message}`, true); } 
    else {
        showStatus(`Player "${newName}" added successfully.`);
        playerNameInput.value = '';
        fetchAndDisplayPlayers();
    }
});

generatePairsBtn.addEventListener('click', async () => {
    const checkedBoxes = playerChecklist.querySelectorAll('input[type="checkbox"]:checked');
    const activePlayerIds = Array.from(checkedBoxes).map(box => parseInt(box.value));
    
    generatePairsBtn.disabled = true;
    generatePairsBtn.textContent = 'Generating...';
    showStatus('Generating pairs...');
    try {
        const response = await fetch('/.netlify/functions/generate-pairings', {
            method: 'POST',
            body: JSON.stringify({ activePlayerIds, roundNumber: currentRound })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to generate pairs.');
        showStatus(result.message);
        fetchAndDisplayUnplayedGames();
    } catch (err) {
        showStatus(err.message, true);
    } finally {
        generatePairsBtn.disabled = false;
        generatePairsBtn.textContent = 'Generate Pairings';
    }
});

// MAJOR FIX: Added robust try/catch/finally to prevent buttons from getting stuck
unplayedMatchesContainer.addEventListener('click', async (e) => {
    const target = e.target;
    const gameId = target.dataset.gameId;
    if (!gameId) return;

    let winningTeam = null;
    let originalText = target.textContent;
    
    if (target.classList.contains('win-btn')) {
        winningTeam = parseInt(target.dataset.winningTeam);
    } else if (target.classList.contains('undo-btn')) {
        winningTeam = null; // Setting winner to null is the "undo" action
    } else {
        return;
    }
    
    target.disabled = true;
    target.textContent = 'Updating...';

    try {
        const response = await fetch('/.netlify/functions/report-winner', {
            method: 'POST',
            body: JSON.stringify({ gameId, winningTeam })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        
        showStatus(result.message);
        // CRITICAL: On success, re-fetch the games to show the updated state (either with a winner or back to the initial state)
        await fetchAndDisplayUnplayedGames();
    } catch (err) {
        showStatus(err.message, true);
        // If an error occurs, re-enable the button so the user can try again
        target.disabled = false;
        target.textContent = originalText;
    }
    // Note: No 'finally' block needed here because on success, the button is removed/redrawn by fetchAndDisplayUnplayedGames.
});

finalizeRoundBtn.addEventListener('click', async () => {
    if (!confirm(`Are you sure you want to finalize Round ${currentRound}? This will update all stats and advance the tournament to the next round.`)) {
        return;
    }
    
    finalizeRoundBtn.disabled = true;
    finalizeRoundBtn.textContent = 'Finalizing...';
    showStatus(`Finalizing Round ${currentRound}...`);
    try {
        const response = await fetch('/.netlify/functions/finalize-round', {
            method: 'POST',
            body: JSON.stringify({ roundNumber: currentRound })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        showStatus(result.message, false);
        await initializeAdminPanel();
    } catch (err) {
        showStatus(err.message, true);
    } finally {
        finalizeRoundBtn.disabled = false;
        finalizeRoundBtn.textContent = 'Finalize Round & Advance';
    }
});

showResetModalBtn.addEventListener('click', () => {
    resetModal.style.display = 'flex';
});

cancelResetBtn.addEventListener('click', () => {
    resetModal.style.display = 'none';
});

confirmResetBtn.addEventListener('click', async () => {
    confirmResetBtn.disabled = true;
    confirmResetBtn.textContent = 'Resetting...';
    cancelResetBtn.disabled = true;

    try {
        const response = await fetch('/.netlify/functions/reset-tournament', {
            method: 'POST'
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'An unknown error occurred.');
        }
        showStatus(result.message, false);
        resetModal.style.display = 'none';
        await initializeAdminPanel();
    } catch (err) {
        showStatus(err.message, true);
    } finally {
        confirmResetBtn.disabled = false;
        confirmResetBtn.textContent = 'I confirm I want to wipe the database';
        cancelResetBtn.disabled = false;
    }
});

// ---- INITIAL LOAD ----
async function initializeAdminPanel() {
    await fetchTournamentState();
    await fetchAndDisplayPlayers();
    await fetchAndDisplayUnplayedGames();
}

document.addEventListener('DOMContentLoaded', initializeAdminPanel);