// netlify/functions/reset-tournament.js

const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  try {
    // The order of deletion is critical. We delete from all "child" tables
    // that depend on players BEFORE deleting from the "players" table itself.

    // 1. Delete all game history
    console.log('Deleting from games...');
    const { error: gamesError } = await supabase.from('games').delete().neq('id', -1);
    if (gamesError) throw gamesError;

    // 2. Delete all partnership history
    console.log('Deleting from partnerships...');
    const { error: partnershipsError } = await supabase.from('partnerships').delete().neq('player1_id', -1);
    if (partnershipsError) throw partnershipsError;

    // 3. --- THIS IS THE FIX --- Delete all bye history
    console.log('Deleting from byes...');
    const { error: byesError } = await supabase.from('byes').delete().neq('id', -1);
    if (byesError) throw byesError;
    // --- END OF FIX ---

    // 4. Now that no other tables reference players, we can safely delete them.
    console.log('Deleting from players...');
    const { error: playersError } = await supabase.from('players').delete().neq('id', -1);
    if (playersError) throw playersError;
    
    // 5. Reset the tournament state back to round 1
    console.log('Resetting tournament state...');
    const { error: stateError } = await supabase
        .from('tournament_state')
        .update({ current_round: 1 })
        .eq('id', 1);
    if (stateError) throw stateError;

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Tournament database has been successfully reset.' }),
    };
  } catch (error) {
    console.error('CRITICAL: Error resetting database:', error);
    return { 
        statusCode: 500, 
        body: JSON.stringify({ error: `Failed to reset database: ${error.message}` }) 
    };
  }
};