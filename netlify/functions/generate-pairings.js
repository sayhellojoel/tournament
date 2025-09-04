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
    await supabase.from('byes').delete().eq('round_number', roundNumber);

    // --- NEW ALGORITHM START ---

    // 1. Fetch all historical byes to determine who is "due" to play.
    const { data: allByes, error: byesError } = await supabase.from('byes').select('player_id');
    if (byesError) throw byesError;

    const byeCounts = new Map();
    for (const bye of allByes) {
        byeCounts.set(bye.player_id, (byeCounts.get(bye.player_id) || 0) + 1);
    }

    // 2. Intelligently select players for byes based on the lowest count.
    const numByesNeeded = activePlayerIds.length % 4;
    let playersForGames = [...activePlayerIds];
    let byePlayerIds = [];

    if (numByesNeeded > 0) {
        // Create a list of active players with their bye counts
        let byeCandidates = activePlayerIds.map(id => ({
            id: id,
            byeCount: byeCounts.get(id) || 0
        }));
        
        // Sort candidates so those with the FEWEST byes are first.
        byeCandidates.sort((a, b) => a.byeCount - b.byeCount);
        
        // Assign the first N players from the sorted list to a bye.
        const playersGettingBye = byeCandidates.slice(0, numByesNeeded);
        byePlayerIds = playersGettingBye.map(p => p.id);
        
        // The remaining players are the ones who will be in games.
        const byePlayerIdSet = new Set(byePlayerIds);
        playersForGames = activePlayerIds.filter(id => !byePlayerIdSet.has(id));
    }
    
    // At this point, `playersForGames` is a list of IDs with a length divisible by 4.
    // `byePlayerIds` contains the IDs of players who will not play this round.

    // 3. Run the pairing logic ONLY on the pool of players who are playing.
    const { data: existingPartnerships, error: partnershipError } = await supabase.from('partnerships').select('player1_id, player2_id');
    if (partnershipError) throw partnershipError;

    const partnershipSet = new Set(
      existingPartnerships.map(p => [p.player1_id, p.player2_id].sort((a, b) => a - b).join('-'))
    );

    let bestPairs = [];
    const MAX_ATTEMPTS = 20;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const shuffledPlayers = shuffleArray([...playersForGames]);
      const currentPairs = [];
      const usedPlayerIds = new Set();
      for (const playerA_id of shuffledPlayers) {
        if (usedPlayerIds.has(playerA_id)) continue;
        for (const playerB_id of shuffledPlayers) {
          if (playerA_id === playerB_id || usedPlayerIds.has(playerB_id)) continue;
          const partnershipKey = [playerA_id, playerB_id].sort((a, b) => a - b).join('-');
          if (!partnershipSet.has(partnershipKey)) {
            currentPairs.push({ p1: playerA_id, p2: playerB_id });
            usedPlayerIds.add(playerA_id);
            usedPlayerIds.add(playerB_id);
            break; 
          }
        }
      }
      if (currentPairs.length > bestPairs.length) bestPairs = [...currentPairs];
      // If we've paired everyone in the game pool, we have a perfect solution.
      if (bestPairs.length * 2 === playersForGames.length) break;
    }
    // --- NEW ALGORITHM END ---

    if (playersForGames.length > 0 && bestPairs.length < playersForGames.length / 2) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Failed to generate enough new pairs for the players in games. All partner combinations may be used.' }) };
    }
    
    const matchesToInsert = [];
    for (let i = 0; i < bestPairs.length; i += 2) {
      if (bestPairs[i+1]) { // This check should always pass now, but it's safe to keep
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
    
    if (matchesToInsert.length > 0) {
      await supabase.from('games').insert(matchesToInsert);
      const newPartnershipsToInsert = bestPairs.map(p => ({ player1_id: p.p1, player2_id: p.p2 }));
      await supabase.from('partnerships').insert(newPartnershipsToInsert);
    }
    
    let byePlayerNames = [];
    if (byePlayerIds.length > 0) {
        const byesToInsert = byePlayerIds.map(id => ({ round_number: roundNumber, player_id: id }));
        await supabase.from('byes').insert(byesToInsert);
        const { data: byePlayers } = await supabase.from('players').select('name').in('id', byePlayerIds);
        if (byePlayers) byePlayerNames = byePlayers.map(p => p.name);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
          message: `${matchesToInsert.length} matches created successfully.`,
          byePlayerNames: byePlayerNames
      }),
    };
  } catch (error) {
    console.error('Error generating pairings:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};