// netlify/functions/finalize-round.js

const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { roundNumber } = JSON.parse(event.body);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  try {
    // 1. Get all games from the current round that have a winner declared
    const { data: finishedGames, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('round_number', roundNumber)
      .not('winning_team', 'is', null);

    if (gamesError) throw gamesError;

    if (finishedGames.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No finished games with winners to finalize for this round.' }) };
    }

    // 2. Aggregate all player score changes
    const playerUpdates = new Map(); // Use a map to store cumulative updates for each player

    for (const game of finishedGames) {
      const winners = game.winning_team === 1 ? [game.team1_player1_id, game.team1_player2_id] : [game.team2_player1_id, game.team2_player2_id];
      const losers = game.winning_team === 1 ? [game.team2_player1_id, game.team2_player2_id] : [game.team1_player1_id, game.team1_player2_id];

      for (const playerId of winners) {
        if (!playerUpdates.has(playerId)) playerUpdates.set(playerId, { wins: 0, losses: 0 });
        playerUpdates.get(playerId).wins += 1;
      }
      for (const playerId of losers) {
        if (!playerUpdates.has(playerId)) playerUpdates.set(playerId, { wins: 0, losses: 0 });
        playerUpdates.get(playerId).losses += 1;
      }
    }
    
    // 3. Fetch current stats for all affected players
    const allPlayerIds = Array.from(playerUpdates.keys());
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, games_played, wins')
      .in('id', allPlayerIds);
    if (playersError) throw playersError;

    // 4. Calculate new stats and prepare for upsert
    const playersToUpdate = players.map(p => {
      const update = playerUpdates.get(p.id);
      const newGamesPlayed = p.games_played + update.wins + update.losses;
      const newWins = p.wins + update.wins;

      return {
        id: p.id,
        games_played: newGamesPlayed,
        wins: newWins,
        losses: newGamesPlayed - newWins,
        win_percentage: newWins / newGamesPlayed
      };
    });

    // 5. Update player stats in the database
    const { error: updateError } = await supabase.from('players').upsert(playersToUpdate);
    if (updateError) throw updateError;
    
    // 6. Increment the current round number in the tournament_state table
    const { error: roundError } = await supabase
        .from('tournament_state')
        .update({ current_round: roundNumber + 1 })
        .eq('id', 1); // We assume there's only one row with id=1
    if (roundError) throw roundError;

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Round ${roundNumber} finalized! Stats updated for ${playersToUpdate.length} players. Now on Round ${roundNumber + 1}.` }),
    };
  } catch (error) {
    console.error('Error finalizing round:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};