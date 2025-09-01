// netlify/functions/generate-pairings.js

const { createClient } = require('@supabase/supabase-js');

const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { activePlayerIds, roundNumber } = JSON.parse(event.body);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  if (activePlayerIds.length < 4) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Not enough players to make a game (minimum 4).' }) };
  }

  try {
    // Clear any previous byes for this round to prevent duplicates on a re-run
    await supabase.from('byes').delete().eq('round_number', roundNumber);

    const { data: existingPartnerships, error: partnershipError } = await supabase
      .from('partnerships')
      .select('player1_id, player2_id');
    if (partnershipError) throw partnershipError;

    const partnershipSet = new Set(
      existingPartnerships.map(p => [p.player1_id, p.player2_id].sort((a, b) => a - b).join('-'))
    );

    let bestPairs = [];
    const MAX_ATTEMPTS = 20;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const shuffledPlayers = shuffleArray([...activePlayerIds]);
      const currentPairs = [];
      const usedPlayerIds = new Set();
      for (const playerA of shuffledPlayers) {
        if (usedPlayerIds.has(playerA)) continue;
        for (const playerB of shuffledPlayers) {
          if (playerA === playerB || usedPlayerIds.has(playerB)) continue;
          const partnershipKey = [playerA, playerB].sort((a, b) => a - b).join('-');
          if (!partnershipSet.has(partnershipKey)) {
            currentPairs.push({ p1: playerA, p2: playerB });
            usedPlayerIds.add(playerA);
            usedPlayerIds.add(playerB);
            break; 
          }
        }
      }
      if (currentPairs.length > bestPairs.length) bestPairs = [...currentPairs];
      if (bestPairs.length * 2 >= activePlayerIds.length - 1) break;
    }

    if (bestPairs.length < 2) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Failed to generate enough new pairs. Try adding more players or check existing partnerships.' }) };
    }
    
    const matchesToInsert = [];
    for (let i = 0; i < bestPairs.length; i += 2) {
      if (bestPairs[i+1]) {
         matchesToInsert.push({
            round_number: roundNumber,
            team1_player1_id: bestPairs[i].p1,
            team1_player2_id: bestPairs[i].p2,
            team2_player1_id: bestPairs[i+1].p1,
            team2_player2_id: bestPairs[i+1].p2,
            is_playoff_game: false,
         });
      }
    }
    
    if (matchesToInsert.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Could not form any 2v2 matches from the generated pairs.' }) };
    }
    
    await supabase.from('games').insert(matchesToInsert);
    const newPartnershipsToInsert = bestPairs.map(p => ({ player1_id: p.p1, player2_id: p.p2 }));
    await supabase.from('partnerships').insert(newPartnershipsToInsert);

    // --- NEW: Identify and save bye players ---
    const playersInGames = new Set(matchesToInsert.flatMap(m => [m.team1_player1_id, m.team1_player2_id, m.team2_player1_id, m.team2_player2_id]));
    const byePlayerIds = activePlayerIds.filter(id => !playersInGames.has(id));
    
    let byePlayerNames = [];
    if (byePlayerIds.length > 0) {
        const byesToInsert = byePlayerIds.map(id => ({ round_number: roundNumber, player_id: id }));
        await supabase.from('byes').insert(byesToInsert);

        const { data: byePlayers } = await supabase.from('players').select('name').in('id', byePlayerIds);
        if (byePlayers) byePlayerNames = byePlayers.map(p => p.name);
    }
    // --- END NEW ---

    return {
      statusCode: 200,
      body: JSON.stringify({ 
          message: `${matchesToInsert.length} matches created successfully.`,
          byePlayerNames: byePlayerNames // Send names back to admin UI
      }),
    };
  } catch (error) {
    console.error('Error generating pairings:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};