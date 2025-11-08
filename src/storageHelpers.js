import { supabase } from "./supabaseClient";

export async function uploadJobAttachment(file, jobId, userId) {
  if (!file) return { error: new Error("No file provided") };

  // create a path like: userId/jobId/timestamp-filename.pdf
  const cleanName = file.name.replace(/\s+/g, "_");
  const path = `${userId}/${jobId}/${Date.now()}-${cleanName}`;

  const { data, error } = await supabase.storage
    .from("job-attachments")
    .upload(path, file);

  if (error) return { error };

  // Save metadata in job_attachments table
  const { error: insertError } = await supabase
    .from("job_attachments")
    .insert({
      job_id: jobId,
      user_id: userId,
      file_path: data.path,
      file_name: file.name,
      file_type: file.type || null,
    });

  if (insertError) {
    return { error: insertError };
  }

  return { path: data.path };
}
