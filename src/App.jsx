import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

/* ---------- Helper for uploading attachments ---------- */

async function uploadJobAttachment(file, jobId, userId) {
  if (!file) {
    return { error: new Error("No file provided") };
  }

  const cleanName = file.name.replace(/\s+/g, "_");
  const path = `${userId}/${jobId}/${Date.now()}-${cleanName}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from("job-attachments")   // 👈 make sure this matches your bucket name
    .upload(path, file);

  if (error) {
    console.error("Storage upload error:", error);
    return { error };
  }

  // Save metadata row in job_attachments table
  const { error: insertError } = await supabase.from("job_attachments").insert({
    job_id: jobId,
    user_id: userId,
    file_path: data.path,
    file_name: file.name,
    file_type: file.type || null,
  });

  if (insertError) {
    console.error("DB insert error (job_attachments):", insertError);
    return { error: insertError };
  }

  return { path: data.path };
}


/* ---------- Auth UI ---------- */

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("sign_in"); // "sign_in" | "sign_up"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      if (mode === "sign_up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        // After sign up, Supabase auto logs in (for email+password)
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      onAuth(); // parent will re-fetch session
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-xl font-semibold mb-1 text-slate-900">
          Job Applications Tracker
        </h1>
        <p className="text-xs text-slate-500 mb-4">
          Sign in to manage your job applications securely.
        </p>

        <div className="flex mb-4 text-xs font-medium border border-slate-200 rounded-lg overflow-hidden">
          <button
            type="button"
            className={
              "flex-1 py-2 " +
              (mode === "sign_in"
                ? "bg-sky-600 text-white"
                : "bg-white text-slate-700")
            }
            onClick={() => setMode("sign_in")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={
              "flex-1 py-2 " +
              (mode === "sign_up"
                ? "bg-sky-600 text-white"
                : "bg-white text-slate-700")
            }
            onClick={() => setMode("sign_up")}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-600 mt-1">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          >
            {loading
              ? "Please wait…"
              : mode === "sign_in"
              ? "Sign in"
              : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ---------- Job Tracker UI (with attachments) ---------- */

function JobTracker({ user }) {
  const getToday = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === "year").value;
    const month = parts.find((p) => p.type === "month").value;
    const day = parts.find((p) => p.type === "day").value;

    return `${year}-${month}-${day}`;
  };

  const [jobs, setJobs] = useState([]);
  const [attachments, setAttachments] = useState([]); // all attachments for this user
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    company: "",
    position: "",
    source_url: "",
    date_found: getToday(),
    description: "",
    applied: false,
    applied_date: "",
    status: "not_applied",
  });
  const [editingId, setEditingId] = useState(null);

  const fetchJobs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching jobs:", error);
    } else {
      setJobs(data || []);
    }
    setLoading(false);
  };

  const fetchAttachments = async () => {
    const { data, error } = await supabase
      .from("job_attachments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching attachments:", error);
    } else {
      setAttachments(data || []);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchAttachments();
  }, []);

  const resetForm = () => {
    setForm({
      company: "",
      position: "",
      source_url: "",
      date_found: getToday(),
      description: "",
      applied: false,
      applied_date: "",
      status: "not_applied",
    });
    setEditingId(null);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setForm((prev) => {
      // Special logic for the "applied" checkbox
      if (name === "applied") {
        const applied = checked;
        return {
          ...prev,
          applied,
          applied_date:
            applied && !prev.applied_date ? getToday() : prev.applied_date,
        };
      }

      return {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.company || !form.position || !form.date_found) {
      alert("Company, position and date found are required.");
      return;
    }

    let payload = { ...form };
    if (!payload.applied) {
      payload.applied_date = null;
      payload.status = "not_applied";
    }

    if (editingId) {
      const { error } = await supabase
        .from("jobs")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        console.error("Error updating job:", error);
      } else {
        resetForm();
        fetchJobs();
      }
    } else {
      // attach user_id so RLS passes
      payload.user_id = user.id;

      const { error } = await supabase.from("jobs").insert(payload);
      if (error) {
        console.error("Error inserting job:", error);
      } else {
        resetForm();
        fetchJobs();
      }
    }
  };

  const handleEdit = (job) => {
    setEditingId(job.id);
    setForm({
      company: job.company ?? "",
      position: job.position ?? "",
      source_url: job.source_url ?? "",
      date_found: job.date_found ?? "",
      description: job.description ?? "",
      applied: job.applied ?? false,
      applied_date: job.applied_date ?? "",
      status: job.status ?? "not_applied",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this job?")) return;
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) {
      console.error("Error deleting job:", error);
    } else {
      setJobs((prev) => prev.filter((j) => j.id !== id));
      // attachments are on delete cascade in DB, but we could also refresh:
      await fetchAttachments();
    }
  };

  const statusBadgeClass = (status) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-800";
      case "interview":
        return "bg-sky-100 text-sky-800";
      case "offer":
        return "bg-emerald-100 text-emerald-800";
      case "rejected":
        return "bg-rose-100 text-rose-800";
      case "not_applied":
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const getPublicUrl = (filePath) => {
    const { data } = supabase.storage
      .from("job-attachments")
      .getPublicUrl(filePath);
    return data.publicUrl;
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Job Applications Tracker
            </h1>
            <p className="text-sm text-slate-500">
              Signed in as <span className="font-medium">{user.email}</span>
            </p>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.reload();
            }}
            className="text-xs text-slate-500 hover:text-slate-800 underline"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Form card */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit job" : "Add new job"}
              </h2>
              <p className="text-xs text-slate-500">
                Save roles you come across so you don’t forget to apply.
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Cancel editing
              </button>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* Left column */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Company <span className="text-rose-500">*</span>
                </label>
                <input
                  name="company"
                  value={form.company}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="ASB, BNZ, Rocket Lab…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Position <span className="text-rose-500">*</span>
                </label>
                <input
                  name="position"
                  value={form.position}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Systems Engineer, Integration Dev…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Source URL
                </label>
                <input
                  name="source_url"
                  value={form.source_url}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Link to the ad"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Date found <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  name="date_found"
                  value={form.date_found}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Full ad / notes
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={6}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Paste the job ad or your notes here…"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="applied"
                  type="checkbox"
                  name="applied"
                  checked={form.applied}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <label
                  htmlFor="applied"
                  className="text-sm font-medium text-slate-700"
                >
                  Applied?
                </label>
              </div>

              {form.applied && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Applied date
                    </label>
                    <input
                      type="date"
                      name="applied_date"
                      value={form.applied_date || ""}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Status
                    </label>
                    <select
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    >
                      <option value="not_applied">Not applied</option>
                      <option value="pending">Pending</option>
                      <option value="interview">Interview</option>
                      <option value="offer">Offer</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="md:col-span-2 flex justify-end pt-2">
              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
              >
                {editingId ? "Update job" : "Add job"}
              </button>
            </div>
          </form>
        </section>

        {/* Jobs list */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Jobs</h2>
            <p className="text-xs text-slate-500">Total: {jobs.length}</p>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-slate-500">
              No jobs yet. Add your first one above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Company
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Position
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Date found
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Applied
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Status
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-700">
                      Actions / Attachments
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {jobs.map((job) => {
                    const jobAttachments = attachments.filter(
                      (att) => att.job_id === job.id
                    );

                    return (
                      <tr key={job.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium">{job.company}</div>
                          {job.source_url && (
                            <a
                              href={job.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-sky-600 hover:underline"
                            >
                              View ad
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div>{job.position}</div>
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap">
                          {job.date_found}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {job.applied ? "Yes" : "No"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                              statusBadgeClass(job.status)
                            }
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="space-y-2">
                            <div className="space-x-2">
                              <button
                                onClick={() => handleEdit(job)}
                                className="text-xs text-sky-700 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(job.id)}
                                className="text-xs text-rose-600 hover:underline"
                              >
                                Delete
                              </button>
                            </div>

                            {/* File upload */}
                            <div className="mt-1">
                              <label className="block text-[11px] text-slate-500 mb-1">
                                Attach file (PDF, DOCX, etc.)
                              </label>
                              <input
                                type="file"
                                className="block w-full text-[11px] text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:bg-slate-100 file:text-slate-700"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;

                                  const { error } = await uploadJobAttachment(
                                    file,
                                    job.id,
                                    user.id
                                  );

                                  if (error) {
                                    console.error(error);
                                    alert("Failed to upload attachment");
                                  } else {
                                    await fetchAttachments();
                                  }

                                  e.target.value = "";
                                }}
                              />
                            </div>

                            {/* Attachments list */}
                            {jobAttachments.length > 0 && (
                              <div className="mt-1 space-y-1">
                                {jobAttachments.map((att) => (
                                  <div
                                    key={att.id}
                                    className="flex items-center justify-between gap-2"
                                  >
                                    <a
                                      href={getPublicUrl(att.file_path)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] text-sky-700 hover:underline truncate max-w-[150px]"
                                      title={att.file_name}
                                    >
                                      {att.file_name}
                                    </a>
                                    <button
                                      className="text-[10px] text-rose-500 hover:underline"
                                      onClick={async () => {
                                        // Delete from storage
                                        const { error: storageError } =
                                          await supabase.storage
                                            .from("job-attachments")
                                            .remove([att.file_path]);

                                        if (storageError) {
                                          console.error(storageError);
                                          alert("Failed to delete file");
                                          return;
                                        }

                                        // Delete DB record
                                        const { error: dbError } =
                                          await supabase
                                            .from("job_attachments")
                                            .delete()
                                            .eq("id", att.id);

                                        if (dbError) {
                                          console.error(dbError);
                                          alert(
                                            "Failed to delete attachment record"
                                          );
                                          return;
                                        }

                                        await fetchAttachments();
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/* ---------- Root component: manage session ---------- */

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session ?? null);
      setChecking(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Checking session…
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onAuth={() => {}} />;
  }

  return <JobTracker user={session.user} />;
}
