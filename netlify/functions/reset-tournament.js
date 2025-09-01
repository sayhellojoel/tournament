const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event, context) {
  // Ensure this is a POST request to prevent accidental resets via URL
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  try {
    // The order of deletion is important to respect foreign key constraints.
    // We delete data from tables that depend on others first.

    // 1. Delete all game history
    console.log('Deleting from games...');
    const { error: gamesError } = await supabase.from('games').delete().neq('id', -1); // .neq is a way to target all rows
    if (gamesError) throw gamesError;

    // 2. Delete all partnership history
    console.log('Deleting from partnerships...');
    const { error: partnershipsError } = await supabase.from('partnerships').delete().neq('player1_id', -1);
    if (partnershipsError) throw partnershipsError;

    // 3. Now that no games or partnerships reference players, we can delete them.
    console.log('Deleting from players...');
    const { error: playersError } = await supabase.from('players').delete().neq('id', -1);
    if (playersError) throw playersError;
    
    // 4. Reset the tournament state back to round 1
    console.log('Resetting tournament state...');
    const { error: stateError } = await supabase
        .from('tournament_state')
        .update({ current_round: 1 })
        .eq('id', 1); // Assuming the state is always in the row with id=1
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