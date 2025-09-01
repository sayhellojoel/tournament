// netlify/functions/report-winner.js

const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { gameId, winningTeam } = JSON.parse(event.body);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  try {
    // 1. Fetch the game to identify players
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (gameError) throw gameError;
    if (game.winning_team) {
      return { statusCode: 400, body: JSON.stringify({ error: 'This game already has a winner.' }) };
    }

    // 2. Mark the winner in the 'games' table
    const { error: updateGameError } = await supabase
      .from('games')
      .update({ winning_team: winningTeam })
      .eq('id', gameId);
      
    if (updateGameError) throw updateGameError;

    // 3. Identify winning and losing player IDs
    const winners = winningTeam === 1 ? [game.team1_player1_id, game.team1_player2_id] : [game.team2_player1_id, game.team2_player2_id];
    const losers = winningTeam === 1 ? [game.team2_player1_id, game.team2_player2_id] : [game.team1_player1_id, game.team1_player2_id];
    const allPlayerIds = [...winners, ...losers];

    // 4. Fetch current stats for all players in the game
    const { data: players, error: playersError } = await supabase
        .from('players')
        .select('id, games_played, wins')
        .in('id', allPlayerIds);

    if (playersError) throw playersError;

    // 5. Calculate and prepare the updated stats
    const playersToUpdate = players.map(p => {
        const isWinner = winners.includes(p.id);
        const newWins = isWinner ? p.wins + 1 : p.wins;
        const newGamesPlayed = p.games_played + 1;
        
        return {
            id: p.id,
            games_played: newGamesPlayed,
            wins: newWins,
            losses: newGamesPlayed - newWins,
            win_percentage: newWins / newGamesPlayed
        };
    });

    // 6. Update all player stats in one go
    const { error: updatePlayersError } = await supabase
        .from('players')
        .upsert(playersToUpdate);

    if(updatePlayersError) throw updatePlayersError;

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Winner reported and stats updated.' }),
    };
  } catch (error) {
    console.error('Error reporting winner:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};