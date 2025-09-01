// main.js

// ❗️❗️❗️ REPLACE WITH YOUR SUPABASE CREDENTIALS ❗️❗️❗️
const supabaseUrl = 'https://ussbvpdmhlllzimnxdaj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzc2J2cGRtaGxsbHppbW54ZGFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2OTMxMTUsImV4cCI6MjA3MjI2OTExNX0.0bEpqQ9gPqHL37CTgXkb2vo3yibGGDs-_WkhUNORLHo';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const standingsTable = document.getElementById('standings-table');
const currentMatchesContainer = document.getElementById('current-matches');
const byePlayersContainer = document.getElementById('bye-players-container');
const playoffOutlookSection = document.getElementById('playoff-outlook');
const playoffMatchesContainer = document.getElementById('playoff-matches');

let currentRound = 1;

// ---- DATA FETCHING AND RENDERING FUNCTIONS ----

async function fetchAndDisplayAll() {
    // Fetch the current round number first
    const { data, error } = await supabase.from('tournament_state').select('current_round').eq('id', 1).single();
    if (data) {
        currentRound = data.current_round;
    }

    // Now fetch everything else in parallel for speed
    await Promise.all([
        fetchAndDisplayStandings(),
        fetchAndDisplayCurrentMatches(),
        fetchAndDisplayByes()
    ]);
}

async function fetchAndDisplayStandings() {
    const { data: players, error } = await supabase
        .from('players')
        .select('*')
        .order('win_percentage', { ascending: false })
        .order('wins', { ascending: false });

    if (error) {
        console.error('Error fetching players:', error);
        standingsTable.innerHTML = `<p class="status-message error">Could not load standings.</p>`;
        return;
    }

    let tableHtml = `
        <table>
            <thead>
                <tr><th>Rank</th><th>Name</th><th>Games</th><th>Wins</th><th>Losses</th><th>Win %</th></tr>
            </thead>
            <tbody>`;
    players.forEach((player, index) => {
        tableHtml += `
            <tr>
                <td>${index + 1}</td>
                <td>${player.name}</td>
                <td>${player.games_played}</td>
                <td>${player.wins}</td>
                <td>${player.losses}</td>
                <td>${(player.win_percentage * 100).toFixed(1)}%</td>
            </tr>`;
    });
    tableHtml += `</tbody></table>`;
    standingsTable.innerHTML = tableHtml;

    // --- NEW: Playoff Outlook Logic ---
    if (currentRound > 4 && players.length >= 8) {
        playoffOutlookSection.style.display = 'block';
        const p = players; // shorthand
        playoffMatchesContainer.innerHTML = `
            <div class="match-card">
                <h3>Semifinal 1 (Projected)</h3>
                <span class="team">(1) ${p[0].name} & (4) ${p[3].name}</span>
                <span class="vs">VS</span>
                <span class="team">(5) ${p[4].name} & (8) ${p[7].name}</span>
            </div>
            <div class="match-card">
                <h3>Semifinal 2 (Projected)</h3>
                <span class="team">(2) ${p[1].name} & (3) ${p[2].name}</span>
                <span class="vs">VS</span>
                <span class="team">(6) ${p[5].name} & (7) ${p[6].name}</span>
            </div>
        `;
    } else {
        playoffOutlookSection.style.display = 'none';
    }
}

async function fetchAndDisplayCurrentMatches() {
    const { data: matches, error } = await supabase
        .from('games')
        .select(`id, round_number, t1p1:players!games_team1_player1_id_fkey(name), t1p2:players!games_team1_player2_id_fkey(name), t2p1:players!games_team2_player1_id_fkey(name), t2p2:players!games_team2_player2_id_fkey(name)`)
        .is('winning_team', null)
        .order('round_number');

    if (error) { console.error('Error fetching matches:', error); return; }

    if (matches.length === 0) {
        currentMatchesContainer.innerHTML = `<p>No active matches right now. Waiting for admin!</p>`;
        return;
    }
    let matchesHtml = '';
    matches.forEach(match => {
        matchesHtml += `
            <div class="match-card">
                <h3>Round ${match.round_number}</h3>
                <span class="team">${match.t1p1.name} & ${match.t1p2.name}</span>
                <span class="vs">VS</span>
                <span class="team">${match.t2p1.name} & ${match.t2p2.name}</span>
            </div>`;
    });
    currentMatchesContainer.innerHTML = matchesHtml;
}

// --- NEW: Function to fetch and display Byes ---
async function fetchAndDisplayByes() {
    const { data: byes, error } = await supabase
        .from('byes')
        .select(`player:players(name)`)
        .eq('round_number', currentRound);

    if (error) { console.error('Error fetching byes:', error); return; }
    
    if (byes && byes.length > 0) {
        const byeNames = byes.map(b => b.player.name).join(', ');
        byePlayersContainer.innerHTML = `<p style="text-align: center; margin-top: 20px;"><strong>Bye:</strong> ${byeNames}</p>`;
    } else {
        byePlayersContainer.innerHTML = '';
    }
}

// ---- REAL-TIME SUBSCRIPTIONS ----
const channel = supabase.channel('public-updates');
channel.on('postgres_changes', { event: '*', schema: 'public' }, payload => {
    console.log('Change received!', payload);
    fetchAndDisplayAll();
}).subscribe();

// ---- INITIAL LOAD ----
document.addEventListener('DOMContentLoaded', fetchAndDisplayAll);
