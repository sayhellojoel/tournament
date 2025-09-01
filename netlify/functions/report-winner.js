// netlify/functions/report-winner.js

const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // CHANGE: winningTeam can now be null to handle "undo"
  const { gameId, winningTeam } = JSON.parse(event.body);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  try {
    // This function now ONLY updates the winning_team field.
    // All player stat calculations are moved to the finalize-round function.
    const { error } = await supabase
      .from('games')
      .update({ winning_team: winningTeam })
      .eq('id', gameId);
      
    if (error) throw error;
    
    const message = winningTeam === null ? 'Winner cleared (Undo successful).' : 'Winner reported successfully.';

    return {
      statusCode: 200,
      body: JSON.stringify({ message: message }),
    };
  } catch (error) {
    console.error('Error reporting winner:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};