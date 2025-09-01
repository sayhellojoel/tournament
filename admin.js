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
    setTimeout(() => { statusMessage.style.display = 'none'; }, 6000); // Increased time for longer messages
}

// --- NEW: Function to remember player selections ---
function applyPersistentChecks() {
    const lastActivePlayers = localStorage.getItem('lastActivePlayerIds');
    if (!lastActivePlayers) return; // Do nothing if it's the first time

    const activeSet = new Set(JSON.parse(lastActivePlayers));
    const allCheckboxes = playerChecklist.querySelectorAll('input[type="checkbox"]');
    
    allCheckboxes.forEach(checkbox => {
        const playerId = parseInt(checkbox.value);
        if (activeSet.has(playerId)) {
            checkbox.checked = true;
        } else {
            checkbox.checked = false;
        }
    });
}

// ---- DATA FETCHING AND RENDERING ----
async function fetchTournamentState() {
    const { data, error } = await supabase.from('tournament_state').select('current_round').eq('id', 1).single();
    if (error || !data) {
        console.error('Error fetching tournament state:', error);
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

    // NEW: Apply the saved check states after rendering
    applyPersistentChecks();
}

async function fetchAndDisplayUnplayedGames() {
    const { data: matches, error } = await supabase
        .from('games').select(`id, round_number, winning_team, t1p1:players!games_team1_player1_id_fkey(name), t1p2:players!games_team1_player2_id_fkey(name), t2p1:players!games_team2_player1_id_fkey(name), t2p2:players!games_team2_player2_id_fkey(name)`).eq('round_number', currentRound).order('id');
    if (error) { console.error('Error fetching matches:', error); return; }

    unplayedMatchesContainer.innerHTML = matches.length === 0 ? '<p>No matches generated for this round yet.</p>' : '';
    matches.forEach(match => {
        const card = document.createElement('div');
        card.className = 'match-card';
        const team1Name = `${match.t1p1.name} & ${match.t1p2.name}`;
        const team2Name = `${match.t2p1.name} & ${match.t2p2.name}`;
        let content = `<h3>Round ${match.round_number} (Game ID: ${match.id})</h3>`;
        
        if (!match.winning_team) {
            content += `<div class="team">${team1Name}</div><button class="win-btn" data-game-id="${match.id}" data-winning-team="1">Declare Winner</button><div class="vs">VS</div><div class="team">${team2Name}</div><button class="win-btn" data-game-id="${match.id}" data-winning-team="2">Declare Winner</button>`;
        } else {
            const winnerName = match.winning_team === 1 ? team1Name : team2Name;
            content += `<div class="team">${team1Name}</div><div class="vs">VS</div><div class="team">${team2Name}</div><div class="winner-declared">Winner: <strong>${winnerName}</strong></div><button class="undo-btn" data-game-id="${match.id}">Undo / Change Winner</button>`;
        }
        card.innerHTML = content;
        unplayedMatchesContainer.appendChild(card);
    });
}

// ---- EVENT LISTENERS ----
addPlayerForm.addEventListener('submit', async (e) => { /* ... (no changes) ... */ });

generatePairsBtn.addEventListener('click', async () => {
    const checkedBoxes = playerChecklist.querySelectorAll('input[type="checkbox"]:checked');
    const activePlayerIds = Array.from(checkedBoxes).map(box => parseInt(box.value));
    
    // NEW: Save the state of checked players for the next round
    localStorage.setItem('lastActivePlayerIds', JSON.stringify(activePlayerIds));

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
        
        // NEW: Display bye players in status message
        let statusText = result.message;
        if (result.byePlayerNames && result.byePlayerNames.length > 0) {
            statusText += ` Byes: ${result.byePlayerNames.join(', ')}`;
        }
        showStatus(statusText);
        fetchAndDisplayUnplayedGames();
    } catch (err) {
        showStatus(err.message, true);
    } finally {
        generatePairsBtn.disabled = false;
        generatePairsBtn.textContent = 'Generate Pairings';
    }
});

unplayedMatchesContainer.addEventListener('click', async (e) => { /* ... (no changes) ... */ });

finalizeRoundBtn.addEventListener('click', async () => { /* ... (no changes) ... */ });

showResetModalBtn.addEventListener('click', () => { /* ... (no changes) ... */ });
cancelResetBtn.addEventListener('click', () => { /* ... (no changes) ... */ });

confirmResetBtn.addEventListener('click', async () => {
    // ... (no changes to the reset logic itself) ...
    // NEW: Clear the stored player selections on reset
    localStorage.removeItem('lastActivePlayerIds');
});

// ---- INITIAL LOAD ----
async function initializeAdminPanel() { /* ... (no changes) ... */ }

// I'm putting the unchanged, long functions here to save space in the diff
addPlayerForm.addEventListener('submit', async(e)=>{e.preventDefault();const newName=playerNameInput.value.trim();if(!newName)return;const{error}=await supabase.from('players').insert({name:newName});if(error){showStatus(`Error adding player: ${error.message}`,!0)}else{showStatus(`Player "${newName}" added successfully.`);playerNameInput.value='';fetchAndDisplayPlayers()}});
unplayedMatchesContainer.addEventListener('click', async(e)=>{const target=e.target;const gameId=target.dataset.gameId;if(!gameId)return;let winningTeam=null;let originalText=target.textContent;if(target.classList.contains('win-btn')){winningTeam=parseInt(target.dataset.winningTeam)}else if(target.classList.contains('undo-btn')){winningTeam=null}else{return}target.disabled=!0;target.textContent='Updating...';try{const response=await fetch('/.netlify/functions/report-winner',{method:'POST',body:JSON.stringify({gameId,winningTeam})});const result=await response.json();if(!response.ok)throw new Error(result.error);showStatus(result.message);await fetchAndDisplayUnplayedGames()}catch(err){showStatus(err.message,!0);target.disabled=!1;target.textContent=originalText}});
finalizeRoundBtn.addEventListener('click', async()=>{if(!confirm(`Are you sure you want to finalize Round ${currentRound}? This will update all stats and advance the tournament to the next round.`))return;finalizeRoundBtn.disabled=!0;finalizeRoundBtn.textContent='Finalizing...';showStatus(`Finalizing Round ${currentRound}...`);try{const response=await fetch('/.netlify/functions/finalize-round',{method:'POST',body:JSON.stringify({roundNumber:currentRound})});const result=await response.json();if(!response.ok)throw new Error(result.error);showStatus(result.message,!1);await initializeAdminPanel()}catch(err){showStatus(err.message,!0)}finally{finalizeRoundBtn.disabled=!1;finalizeRoundBtn.textContent='Finalize Round & Advance'}});
showResetModalBtn.addEventListener('click', ()=>{resetModal.style.display='flex'});
cancelResetBtn.addEventListener('click', ()=>{resetModal.style.display='none'});
confirmResetBtn.addEventListener('click', async()=>{confirmResetBtn.disabled=!0;confirmResetBtn.textContent='Resetting...';cancelResetBtn.disabled=!0;try{const response=await fetch('/.netlify/functions/reset-tournament',{method:'POST'});const result=await response.json();if(!response.ok){throw new Error(result.error||`Server responded with status ${response.status}`)}showStatus(result.message,!1);resetModal.style.display='none';localStorage.removeItem('lastActivePlayerIds');await initializeAdminPanel()}catch(err){showStatus(`Error: ${err.message}`,!0)}finally{confirmResetBtn.disabled=!1;confirmResetBtn.textContent='I confirm I want to wipe the database';cancelResetBtn.disabled=!1}});
async function initializeAdminPanel(){await fetchTournamentState();await fetchAndDisplayPlayers();await fetchAndDisplayUnplayedGames()}
document.addEventListener('DOMContentLoaded',initializeAdminPanel);