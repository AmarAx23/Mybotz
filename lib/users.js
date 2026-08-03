const { getSupabase } = require('./supabase');

async function ensureUser(userId) {
  const supabase = getSupabase();
  const { data } = await supabase.from('users').select('user_id').eq('user_id', userId).maybeSingle();
  if (!data) {
    await supabase.from('users').insert({ user_id: userId, streak: 0 });
  }
}

async function getUserData(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('users').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function setUserFields(userId, fields) {
  const supabase = getSupabase();
  const { error } = await supabase.from('users').update(fields).eq('user_id', userId);
  if (error) throw error;
}

async function getAllUsers() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  return data || [];
}

module.exports = { ensureUser, getUserData, setUserFields, getAllUsers };
