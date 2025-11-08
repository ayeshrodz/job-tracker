import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { Calendar, FileText, Link2, ArrowLeft } from "lucide-react";

function getPublicUrl(filePath) {
  const { data } = supabase.storage.from("job-attachments").getPublicUrl(filePath);
  return data.publicUrl;
}

export default function JobDetails({ user }) {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      const { data: jobData, error: jobError } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .eq("user_id", user.id)
        .single();

      if (jobError) {
        console.error(jobError);
        setError("Job not found or you don't have access to it.");
        setLoading(false);
        return;
      }

      const { data: attachData, error: attachError } = await supabase
        .from("job_attachments")
        .select("*")
        .eq("job_id", jobId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (attachError) {
        console.error(attachError);
      }

      setJob(jobData);
      setAttachments(attachData || []);
      setLoading(false);
    };

    load();
  }, [jobId, user.id]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="w-full px-6 lg:px-10 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Job Applications Tracker</h1>
            <p className="text-sm text-slate-500">
              Signed in as <span className="font-medium">{user.email}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              Back to list
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-6 lg:px-10 py-6">
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-5xl mx-auto">
          {loading ? (
            <p className="text-sm text-slate-500">Loading job…</p>
          ) : error ? (
            <p className="text-sm text-rose-500">{error}</p>
          ) : !job ? (
            <p className="text-sm text-slate-500">Job not found.</p>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              {/* Left column: core details, stays in view on desktop */}
              <div className="lg:w-80 lg:flex-none lg:sticky lg:top-24 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 shadow-sm">
                    {(job.company || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 mb-1">{job.position}</h2>
                    <p className="text-sm text-slate-600">{job.company}</p>
                    {job.source_url && (
                      <a
                        href={job.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
                      >
                        <Link2 className="w-3 h-3" />
                        View job ad
                      </a>
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                    <Calendar className="w-3 h-3" />
                    Found on {job.date_found}
                  </div>
                  <div>
                    Applied: <span className="font-medium">{job.applied ? "Yes" : "No"}</span>
                    {job.applied_date && (
                      <span className="ml-2">({job.applied_date})</span>
                    )}
                  </div>
                  <div>
                    Status: <span className="font-medium">{job.status || "not_applied"}</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">Attachments</h3>
                  {attachments.length === 0 ? (
                    <p className="text-xs text-slate-500">No attachments uploaded for this job.</p>
                  ) : (
                    <ul className="space-y-1">
                      {attachments.map((att) => (
                        <li key={att.id}>
                          <a
                            href={getPublicUrl(att.file_path)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
                          >
                            <FileText className="w-3 h-3" />
                            {att.file_name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Right column: scrollable notes + attachments on desktop */}
              <div className="flex-1 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto lg:pr-1 space-y-4">
                {job.description && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 mb-1">Notes / full ad</h3>
                    <div className="text-sm text-slate-700 whitespace-pre-line bg-slate-50 border border-slate-100 rounded-lg p-3">
                      {job.description}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
