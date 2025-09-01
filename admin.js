// admin.js

// ❗️❗️❗️ REPLACE WITH YOUR SUPABASE CREDENTIALS ❗️❗️❗️
const supabaseUrl = 'https://ussbvpdmhlllzimnxdaj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzc2J2cGRtaGxsbHppbW54ZGFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2OTMxMTUsImV4cCI6MjA3MjI2OTExNX0.0bEpqQ9gPqHL37CTgXkb2vo3yibGGDs-_WkhUNORLHo';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);


// ---- DOM ELEMENTS ----
const addPlayerForm = document.getElementById('add-player-form');
const playerNameInput = document.getElementById('player-name');
const playerChecklist = document.getElementById('player-checklist');
const roundNumberInput = document.getElementById('round-number');
const generatePairsBtn = document.getElementById('generate-pairs-btn');
const unplayedMatchesContainer = document.getElementById('unplayed-matches');
const statusMessage = document.getElementById('status-message');


// ---- HELPER FUNCTIONS ----

function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${isError ? 'error' : 'success'}`;
    statusMessage.style.display = 'block';
    setTimeout(() => { statusMessage.style.display = 'none'; }, 5000);
}


// ---- DATA FETCHING AND RENDERING ----

async function fetchAndDisplayPlayers() {
    const { data: players, error } = await supabase.from('players').select('id, name').order('name');
    if (error) {
        console.error('Error fetching players:', error);
        return;
    }
    
    playerChecklist.innerHTML = '';
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
            id, round_number,
            team1_player1:players!games_team1_player1_id_fkey(name),
            team1_player2:players!games_team1_player2_id_fkey(name),
            team2_player1:players!games_team2_player1_id_fkey(name),
            team2_player2:players!games_team2_player2_id_fkey(name)
        `)
        .is('winning_team', null)
        .order('id');

    if (error) {
        console.error('Error fetching unplayed matches:', error);
        return;
    }

    if (matches.length === 0) {
        unplayedMatchesContainer.innerHTML = '<p>No unplayed matches.</p>';
        return;
    }

    unplayedMatchesContainer.innerHTML = '';
    matches.forEach(match => {
        const card = document.createElement('div');
        card.className = 'match-card';
        card.innerHTML = `
            <h3>Round ${match.round_number} (Game ID: ${match.id})</h3>
            <div class="team">${match.team1_player1.name} & ${match.team1_player2.name}</div>
            <button class="win-btn" data-game-id="${match.id}" data-winning-team="1">Declare Winner</button>
            <div class="vs">VS</div>
            <div class="team">${match.team2_player1.name} & ${match.team2_player2.name}</div>
            <button class="win-btn" data-game-id="${match.id}" data-winning-team="2">Declare Winner</button>
        `;
        unplayedMatchesContainer.appendChild(card);
    });
}

// ---- EVENT LISTENERS ----

// Add a new player
addPlayerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = playerNameInput.value.trim();
    if (!newName) return;
    
    const { error } = await supabase.from('players').insert({ name: newName });
    if (error) {
        showStatus(`Error adding player: ${error.message}`, true);
    } else {
        showStatus(`Player "${newName}" added successfully.`);
        playerNameInput.value = '';
        fetchAndDisplayPlayers();
    }
});

// Generate new pairings
generatePairsBtn.addEventListener('click', async () => {
    const checkedBoxes = playerChecklist.querySelectorAll('input[type="checkbox"]:checked');
    const activePlayerIds = Array.from(checkedBoxes).map(box => parseInt(box.value));
    const roundNumber = roundNumberInput.value;
    
    showStatus('Generating pairs...');
    try {
        const response = await fetch('/.netlify/functions/generate-pairings', {
            method: 'POST',
            body: JSON.stringify({ activePlayerIds, roundNumber })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to generate pairs.');
        }
        showStatus(result.message);
        roundNumberInput.value = parseInt(roundNumber) + 1; // Auto-increment round number
        fetchAndDisplayUnplayedGames();
    } catch (err) {
        showStatus(err.message, true);
    }
});

// Report a winner (uses event delegation)
unplayedMatchesContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('win-btn')) {
        const gameId = e.target.dataset.gameId;
        const winningTeam = parseInt(e.target.dataset.winningTeam);

        e.target.disabled = true;
        e.target.textContent = 'Reporting...';
        
        try {
            const response = await fetch('/.netlify/functions/report-winner', {
                method: 'POST',
                body: JSON.stringify({ gameId, winningTeam })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            showStatus('Winner reported successfully!');
            fetchAndDisplayUnplayedGames(); // Refresh the list
        } catch (err) {
            showStatus(err.message, true);
            e.target.disabled = false;
        }
    }
});


// ---- INITIAL LOAD ----
document.addEventListener('DOMContentLoaded', () => {
    fetchAndDisplayPlayers();
    fetchAndDisplayUnplayedGames();
});