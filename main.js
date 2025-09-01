// main.js

// ❗️❗️❗️ REPLACE WITH YOUR SUPABASE CREDENTIALS ❗️❗️❗️
const supabaseUrl = 'https://ussbvpdmhlllzimnxdaj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzc2J2cGRtaGxsbHppbW54ZGFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2OTMxMTUsImV4cCI6MjA3MjI2OTExNX0.0bEpqQ9gPqHL37CTgXkb2vo3yibGGDs-_WkhUNORLHo';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const standingsTable = document.getElementById('standings-table');
const currentMatchesContainer = document.getElementById('current-matches');

// ---- DATA FETCHING AND RENDERING FUNCTIONS ----

async function fetchAndDisplayAll() {
    await fetchAndDisplayStandings();
    await fetchAndDisplayCurrentMatches();
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
                <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Games Played</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Win %</th>
                </tr>
            </thead>
            <tbody>
    `;

    players.forEach((player, index) => {
        tableHtml += `
            <tr>
                <td>${index + 1}</td>
                <td>${player.name}</td>
                <td>${player.games_played}</td>
                <td>${player.wins}</td>
                <td>${player.losses}</td>
                <td>${(player.win_percentage * 100).toFixed(1)}%</td>
            </tr>
        `;
    });

    tableHtml += `</tbody></table>`;
    standingsTable.innerHTML = tableHtml;
}

async function fetchAndDisplayCurrentMatches() {
    const { data: matches, error } = await supabase
        .from('games')
        .select(`
            id,
            round_number,
            team1_player1:players!games_team1_player1_id_fkey(name),
            team1_player2:players!games_team1_player2_id_fkey(name),
            team2_player1:players!games_team2_player1_id_fkey(name),
            team2_player2:players!games_team2_player2_id_fkey(name)
        `)
        .is('winning_team', null) // Only fetch games without a winner
        .order('round_number');

    if (error) {
        console.error('Error fetching matches:', error);
        currentMatchesContainer.innerHTML = `<p class="status-message error">Could not load current matches.</p>`;
        return;
    }

    if (matches.length === 0) {
        currentMatchesContainer.innerHTML = `<p>No active matches right now. Waiting for admin to generate the next round!</p>`;
        return;
    }

    let matchesHtml = '';
    matches.forEach(match => {
        matchesHtml += `
            <div class="match-card">
                <h3>Round ${match.round_number}</h3>
                <span class="team">${match.team1_player1.name} & ${match.team1_player2.name}</span>
                <span class="vs">VS</span>
                <span class="team">${match.team2_player1.name} & ${match.team2_player2.name}</span>
            </div>
        `;
    });
    currentMatchesContainer.innerHTML = matchesHtml;
}


// ---- REAL-TIME SUBSCRIPTIONS ----

// Listen for any changes in the database and re-fetch everything
const channel = supabase.channel('public-updates');
channel
  .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
    console.log('Change received!', payload);
    fetchAndDisplayAll();
  })
  .subscribe();


// ---- INITIAL LOAD ----
document.addEventListener('DOMContentLoaded', () => {
    fetchAndDisplayAll();
});