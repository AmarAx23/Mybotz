const { getSupabase } = require('./supabase');

const BUCKET = 'progress-photos';

async function uploadProgressPhoto(userId, dateStr, buffer, contentType) {
  const supabase = getSupabase();
  const path = `${userId}/${dateStr}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: contentType || 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  await supabase.from('photos').upsert(
    { user_id: userId, log_date: dateStr, storage_path: path, public_url: publicUrl },
    { onConflict: 'user_id,log_date' }
  );

  return publicUrl;
}

async function getUserPhotos(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('photos')
    .select('log_date, public_url')
    .eq('user_id', userId)
    .order('log_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

module.exports = { uploadProgressPhoto, getUserPhotos };
