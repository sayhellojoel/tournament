// netlify/functions/generate-pairings.js

const { createClient } = require('@supabase/supabase-js');

// Helper function for random shuffling (Fisher-Yates algorithm)
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
    // 1. Fetch all existing partnerships
    const { data: existingPartnerships, error: partnershipError } = await supabase
      .from('partnerships')
      .select('player1_id, player2_id');

    if (partnershipError) throw partnershipError;

    // Create a Set for quick lookups. Store pairs sorted to avoid duplicates (e.g., '1-2' is same as '2-1')
    const partnershipSet = new Set(
      existingPartnerships.map(p => [p.player1_id, p.player2_id].sort((a, b) => a - b).join('-'))
    );

    // 2. Randomize players and try to form new pairs
    const shuffledPlayers = shuffleArray([...activePlayerIds]);
    const pairs = [];
    const usedPlayerIds = new Set();

    for (const playerA of shuffledPlayers) {
      if (usedPlayerIds.has(playerA)) continue;

      let foundPartner = false;
      for (const playerB of shuffledPlayers) {
        if (playerA === playerB || usedPlayerIds.has(playerB)) continue;

        const partnershipKey = [playerA, playerB].sort((a, b) => a - b).join('-');
        if (!partnershipSet.has(partnershipKey)) {
          pairs.push({ p1: playerA, p2: playerB });
          usedPlayerIds.add(playerA);
          usedPlayerIds.add(playerB);
          foundPartner = true;
          break; 
        }
      }
    }
    
    // 3. Group pairs into matches
    const matchesToInsert = [];
    for (let i = 0; i < pairs.length; i += 2) {
      if (pairs[i+1]) { // Make sure there's a second pair to form a match
         matchesToInsert.push({
            round_number: roundNumber,
            team1_player1_id: pairs[i].p1,
            team1_player2_id: pairs[i].p2,
            team2_player1_id: pairs[i+1].p1,
            team2_player2_id: pairs[i+1].p2,
            is_playoff_game: false,
         });
      }
    }

    if (matchesToInsert.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Could not generate any new valid matches. All possible pairings may have been used.' }) };
    }

    // 4. Insert new games into the 'games' table
    const { data: newGames, error: gamesError } = await supabase
      .from('games')
      .insert(matchesToInsert)
      .select();

    if (gamesError) throw gamesError;

    // 5. Update the 'partnerships' table with the new pairs
    const newPartnershipsToInsert = pairs.map(p => ({
        player1_id: p.p1,
        player2_id: p.p2
    }));

    const { error: newPartnershipsError } = await supabase
        .from('partnerships')
        .insert(newPartnershipsToInsert);

    if (newPartnershipsError) throw newPartnershipsError;

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `${newGames.length} matches created successfully.` }),
    };

  } catch (error) {
    console.error('Error generating pairings:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};