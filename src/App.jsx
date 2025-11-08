import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import {
  Link2,
  Calendar,
  FileText,
  ChevronDown,
  ChevronUp,
  LayoutList,
  LayoutGrid,
  Plus,
  X,
} from "lucide-react";

/* ---------- Helper for uploading attachments ---------- */

async function uploadJobAttachment(file, jobId, userId) {
  if (!file) {
    return { error: new Error("No file provided") };
  }

  const cleanName = file.name.replace(/\s+/g, "_");
  const path = `${userId}/${jobId}/${Date.now()}-${cleanName}`;

  // Upload to Supabase Storage (this uploads the file)
  const { data, error } = await supabase.storage
    .from("job-attachments") // 👈 make sure bucket name matches
    .upload(path, file);

  if (error) {
    console.error("Storage upload error:", error);
    return { error };
  }

  // Save metadata row in job_attachments table and return the created row
  const { data: attachmentRow, error: insertError } = await supabase
    .from("job_attachments")
    .insert({
      job_id: jobId,
      user_id: userId,
      file_path: data.path,
      file_name: file.name,
      file_type: file.type || null,
    })
    .select("*")
    .single();

  if (insertError) {
    console.error("DB insert error (job_attachments):", insertError);
    return { error: insertError };
  }

  return { path: data.path, attachment: attachmentRow };
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
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      onAuth();
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

/* ---------- Job Tracker UI (with caching, search, filter, sort, pagination, responsive list) ---------- */

function JobTracker({ user }) {
  // Cache config
  const CACHE_JOBS_KEY = "jobsCache";
  const CACHE_ATTACH_KEY = "attachmentsCache";
  const CACHE_LAST_FETCH_KEY = "jobsAndAttachmentsLastFetch";
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  const getToday = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    return `${year}-${month}-${day}`;
  };

  const [jobs, setJobs] = useState([]);
  const [attachments, setAttachments] = useState([]); // all attachment metadata
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

  // Modal open/close
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Filters + search
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [appliedFilter, setAppliedFilter] = useState("all");

  // Sorting
  const [sortKey, setSortKey] = useState("applied"); // company, position, date_found, applied, status
  const [sortDirection, setSortDirection] = useState("desc"); // asc | desc

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // 10, 20, 50

  // Mobile card expansion
  const [expandedJobId, setExpandedJobId] = useState(null);

  // Desktop view mode: table or cards
  const [desktopViewMode, setDesktopViewMode] = useState("table");

  const fetchJobs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching jobs:", error);
    } else {
      const list = data || [];
      setJobs(list);
      localStorage.setItem(CACHE_JOBS_KEY, JSON.stringify(list));
      localStorage.setItem(CACHE_LAST_FETCH_KEY, String(Date.now()));
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
      const list = data || [];
      setAttachments(list);
      localStorage.setItem(CACHE_ATTACH_KEY, JSON.stringify(list));
      localStorage.setItem(CACHE_LAST_FETCH_KEY, String(Date.now()));
    }
  };

  useEffect(() => {
    // 1) Load cached data first for instant UI
    const cachedJobs = localStorage.getItem(CACHE_JOBS_KEY);
    const cachedAttachments = localStorage.getItem(CACHE_ATTACH_KEY);

    if (cachedJobs) {
      try {
        setJobs(JSON.parse(cachedJobs));
      } catch (e) {
        console.error("Error parsing cached jobs:", e);
      }
    }

    if (cachedAttachments) {
      try {
        setAttachments(JSON.parse(cachedAttachments));
      } catch (e) {
        console.error("Error parsing cached attachments:", e);
      }
    }

    // 2) Decide whether to re-fetch from Supabase based on TTL
    const lastFetch = Number(localStorage.getItem(CACHE_LAST_FETCH_KEY) || 0);
    const age = Date.now() - lastFetch;

    if (!cachedJobs && !cachedAttachments) {
      // No cache at all → initial fetch
      (async () => {
        await fetchJobs();
        await fetchAttachments();
      })();
    } else if (age > CACHE_TTL_MS) {
      // Cache is stale → revalidate in background (UI still shows cached data)
      (async () => {
        await fetchJobs();
        await fetchAttachments();
      })();
      setLoading(false);
    } else {
      // Cache is fresh enough → no Supabase calls
      setLoading(false);
    }
  }, []);

  // Reset page when filters/search or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, appliedFilter, pageSize]);

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
        await fetchJobs(); // also refresh cache
        setIsFormOpen(false);
      }
    } else {
      payload.user_id = user.id;

      const { error } = await supabase.from("jobs").insert(payload);
      if (error) {
        console.error("Error inserting job:", error);
      } else {
        resetForm();
        await fetchJobs(); // refresh jobs + cache
        setIsFormOpen(false);
      }
    }
  };

  const openForNewJob = () => {
    resetForm();
    setIsFormOpen(true);
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
    setIsFormOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this job?")) return;
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) {
      console.error("Error deleting job:", error);
    } else {
      setJobs((prev) => {
        const updated = prev.filter((j) => j.id !== id);
        localStorage.setItem(CACHE_JOBS_KEY, JSON.stringify(updated));
        return updated;
      });
      // Remove any attachments for that job from local cache as well
      setAttachments((prev) => {
        const updated = prev.filter((att) => att.job_id !== id);
        localStorage.setItem(CACHE_ATTACH_KEY, JSON.stringify(updated));
        return updated;
      });
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
    // This does NOT download the file; it just returns a URL string
    const { data } = supabase.storage
      .from("job-attachments")
      .getPublicUrl(filePath);
    return data.publicUrl;
  };

  // ---------- Filtering, sorting, pagination ----------

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredJobs = jobs.filter((job) => {
    // text search across a few fields
    const matchesSearch =
      !normalizedSearch ||
      (job.company ?? "").toLowerCase().includes(normalizedSearch) ||
      (job.position ?? "").toLowerCase().includes(normalizedSearch) ||
      (job.description ?? "").toLowerCase().includes(normalizedSearch) ||
      (job.source_url ?? "").toLowerCase().includes(normalizedSearch);

    // status filter
    const jobStatus = job.status ?? "not_applied";
    const matchesStatus =
      statusFilter === "all" || jobStatus === statusFilter;

    // applied filter
    let matchesApplied = true;
    if (appliedFilter === "applied") {
      matchesApplied = !!job.applied;
    } else if (appliedFilter === "not_applied_only") {
      matchesApplied = !job.applied;
    }

    return matchesSearch && matchesStatus && matchesApplied;
  });

  const getSortValue = (job) => {
    switch (sortKey) {
      case "company":
        return (job.company ?? "").toLowerCase();
      case "position":
        return (job.position ?? "").toLowerCase();
      case "status":
        return (job.status ?? "not_applied").toLowerCase();
      case "applied":
        return job.applied ? 1 : 0;
      case "date_found":
      default:
        // ISO date string – safe to compare as string
        return job.date_found ?? "";
    }
  };

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    const v1 = getSortValue(a);
    const v2 = getSortValue(b);

    if (v1 === v2) return 0;

    let result;
    if (typeof v1 === "number" && typeof v2 === "number") {
      result = v1 - v2;
    } else {
      result = String(v1).localeCompare(String(v2));
    }

    return sortDirection === "asc" ? result : -result;
  });

  const totalItems = sortedJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const startIndex = (safePage - 1) * pageSize;
  const visibleJobs = sortedJobs.slice(startIndex, startIndex + pageSize);

  const startDisplay = totalItems === 0 ? 0 : startIndex + 1;
  const endDisplay = startIndex + visibleJobs.length;

  const handleSort = (key) => {
    // Go back to first page when sort changes
    setCurrentPage(1);

    if (sortKey === key) {
      // Same column – toggle direction
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      // New column – start with ascending
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const renderSortIndicator = (key) => {
    if (sortKey !== key) return null;
    return (
      <span className="ml-1 text-[10px]">
        {sortDirection === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  // Reusable card renderer (used on mobile and desktop “cards” mode)
  const renderJobCard = (job, jobAttachments) => {
    const isExpanded = expandedJobId === job.id;

    return (
      <article
        key={job.id}
        className="rounded-xl border border-slate-200 bg-white shadow-sm p-3 flex flex-col gap-2"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 shadow-sm">
              {(job.company || "?").charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1">
              <div className="flex items-start gap-2">
                <h3 className="flex-1 text-sm font-semibold text-slate-900">
                  {job.position}
                </h3>
                {job.source_url && (
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:border-slate-300 transition-colors"
                    title="Open job ad"
                  >
                    <Link2 className="w-3 h-3" />
                  </a>
                )}
              </div>
              <p className="text-xs text-slate-500">{job.company}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  <Calendar className="w-3 h-3" />
                  {job.date_found}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                  {job.applied ? "Applied" : "Not applied"}
                </span>
              </div>
            </div>
          </div>
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
              statusBadgeClass(job.status)
            }
          >
            {job.status ?? "not_applied"}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setExpandedJobId((prev) => (prev === job.id ? null : job.id))
            }
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
          >
            {isExpanded ? (
              <>
                Hide details
                <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                View details
                <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleEdit(job)}
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => handleDelete(job.id)}
              className="inline-flex items-center rounded-full border border-rose-100 bg-white px-3 py-1 text-[11px] font-medium text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3 border-t border-slate-100 pt-2 space-y-2">
            {job.description && (
              <p className="text-[11px] text-slate-600 whitespace-pre-line">
                {job.description}
              </p>
            )}

            {/* File upload */}
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                Attach file (PDF, DOCX, etc.)
              </label>
              <input
                type="file"
                className="block w-full text-[11px] text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:bg-slate-100 file:text-slate-700"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  const { error, attachment } = await uploadJobAttachment(
                    file,
                    job.id,
                    user.id
                  );

                  if (error) {
                    console.error(error);
                    alert("Failed to upload attachment");
                  } else {
                    setAttachments((prev) => {
                      const updated = [attachment, ...prev];
                      localStorage.setItem(
                        CACHE_ATTACH_KEY,
                        JSON.stringify(updated)
                      );
                      return updated;
                    });
                  }

                  e.target.value = "";
                }}
              />
            </div>

            {/* Attachments list */}
            {jobAttachments.length > 0 && (
              <div className="space-y-1">
                {jobAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <a
                      href={getPublicUrl(att.file_path)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:underline truncate max-w-[160px]"
                      title={att.file_name}
                    >
                      <FileText className="w-3 h-3" />
                      <span className="truncate">{att.file_name}</span>
                    </a>
                    <button
                      className="text-[10px] text-rose-500 hover:underline"
                      onClick={async () => {
                        const { error: storageError } = await supabase.storage
                          .from("job-attachments")
                          .remove([att.file_path]);

                        if (storageError) {
                          console.error(storageError);
                          alert("Failed to delete file");
                          return;
                        }

                        const { error: dbError } = await supabase
                          .from("job_attachments")
                          .delete()
                          .eq("id", att.id);

                        if (dbError) {
                          console.error(dbError);
                          alert("Failed to delete attachment record");
                          return;
                        }

                        setAttachments((prev) => {
                          const updated = prev.filter((x) => x.id !== att.id);
                          localStorage.setItem(
                            CACHE_ATTACH_KEY,
                            JSON.stringify(updated)
                          );
                          return updated;
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="w-full px-6 lg:px-10 py-4 flex items-center justify-between">
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

      {/* Add / Edit Job Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {editingId ? "Edit job" : "Add new job"}
                </h2>
                <p className="text-xs text-slate-500">
                  Save roles you come across so you don’t forget to apply.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(false);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
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

              <div className="md:col-span-2 flex justify-end pt-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsFormOpen(false);
                  }}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
                >
                  {editingId ? "Update job" : "Add job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="w-full px-6 lg:px-10 py-6 space-y-6">
        {/* Jobs list */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {/* Header + filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">My Job Applications</h2>
              <p className="text-xs text-slate-500">
                Total: {jobs.length}
                {filteredJobs.length !== jobs.length && (
                  <span className="ml-2 text-[11px] text-slate-400">
                    Showing {filteredJobs.length} matching
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 sm:items-center sm:justify-end">
              {/* Add new job button */}
              <button
                type="button"
                onClick={openForNewJob}
                className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700"
              >
                <Plus className="w-3 h-3" />
                Add job
              </button>

              {/* Search */}
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search company, position, notes…"
                className="w-full sm:w-60 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              >
                <option value="all">All statuses</option>
                <option value="not_applied">Not applied</option>
                <option value="pending">Pending</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="rejected">Rejected</option>
              </select>

              {/* Applied filter */}
              <select
                value={appliedFilter}
                onChange={(e) => setAppliedFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              >
                <option value="all">All jobs</option>
                <option value="applied">Applied only</option>
                <option value="not_applied_only">Not applied only</option>
              </select>

              {/* Sort controls (helpful on mobile) */}
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              >
                <option value="date_found">Sort: Date</option>
                <option value="company">Sort: Company</option>
                <option value="position">Sort: Position</option>
                <option value="applied">Sort: Applied</option>
                <option value="status">Sort: Status</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
                }
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs shadow-sm hover:bg-slate-50"
                title="Toggle sort direction"
              >
                {sortDirection === "asc" ? "↑" : "↓"}
              </button>

              {/* Desktop view toggle */}
              <div className="hidden md:inline-flex items-center gap-1 border-l border-slate-200 pl-2 ml-1">
                <span className="text-[11px] text-slate-400 mr-1">View</span>
                <button
                  type="button"
                  onClick={() => setDesktopViewMode("table")}
                  className={
                    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] border " +
                    (desktopViewMode === "table"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50")
                  }
                >
                  <LayoutList className="w-3 h-3" />
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setDesktopViewMode("cards")}
                  className={
                    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] border " +
                    (desktopViewMode === "cards"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50")
                  }
                >
                  <LayoutGrid className="w-3 h-3" />
                  Cards
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-slate-500">
              No jobs yet. Use “Add job” to create your first one.
            </p>
          ) : filteredJobs.length === 0 ? (
            <p className="text-sm text-slate-500">
              No jobs match your filters.
            </p>
          ) : (
            <>
              {/* Desktop / tablet table */}
              {desktopViewMode === "table" && (
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                    <thead className="bg-slate-50">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSort("company")}
                            className="inline-flex items-center hover:text-slate-900"
                          >
                            Company
                            {renderSortIndicator("company")}
                          </button>
                        </th>
                        <th className="px-3 py-2 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSort("position")}
                            className="inline-flex items-center hover:text-slate-900"
                          >
                            Position
                            {renderSortIndicator("position")}
                          </button>
                        </th>
                        <th className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap w-[130px]">
                          <button
                            type="button"
                            onClick={() => handleSort("date_found")}
                            className="inline-flex items-center hover:text-slate-900"
                          >
                            Date found
                            {renderSortIndicator("date_found")}
                          </button>
                        </th>
                        <th className="px-3 py-2 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSort("applied")}
                            className="inline-flex items-center hover:text-slate-900"
                          >
                            Applied
                            {renderSortIndicator("applied")}
                          </button>
                        </th>
                        <th className="px-3 py-2 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSort("status")}
                            className="inline-flex items-center hover:text-slate-900"
                          >
                            Status
                            {renderSortIndicator("status")}
                          </button>
                        </th>
                        <th className="px-3 py-2 font-semibold text-slate-700">
                          Actions / Attachments
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {visibleJobs.map((job) => {
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
                                {job.status ?? "not_applied"}
                              </span>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(job)}
                                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(job.id)}
                                    className="inline-flex items-center rounded-full border border-rose-100 bg-white px-3 py-1 text-[11px] font-medium text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-colors"
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

                                      const { error, attachment } =
                                        await uploadJobAttachment(
                                          file,
                                          job.id,
                                          user.id
                                        );

                                      if (error) {
                                        console.error(error);
                                        alert("Failed to upload attachment");
                                      } else {
                                        // Merge new attachment into state + cache
                                        setAttachments((prev) => {
                                          const updated = [
                                            attachment,
                                            ...prev,
                                          ];
                                            localStorage.setItem(
                                              CACHE_ATTACH_KEY,
                                              JSON.stringify(updated)
                                            );
                                            return updated;
                                          });
                                      }

                                      e.target.value = "";
                                    }}
                                  />
                                </div>

                                {/* Attachments list - LINKS ONLY */}
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
                                          className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:underline truncate max-w-[150px]"
                                          title={att.file_name}
                                        >
                                          <FileText className="w-3 h-3" />
                                          <span className="truncate">
                                            {att.file_name}
                                          </span>
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

                                            // Update local attachments state + cache
                                            setAttachments((prev) => {
                                              const updated = prev.filter(
                                                (x) => x.id !== att.id
                                              );
                                              localStorage.setItem(
                                                CACHE_ATTACH_KEY,
                                                JSON.stringify(updated)
                                              );
                                              return updated;
                                            });
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

              {/* Desktop cards mode */}
              {desktopViewMode === "cards" && (
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {visibleJobs.map((job) =>
                    renderJobCard(
                      job,
                      attachments.filter((att) => att.job_id === job.id)
                    )
                  )}
                </div>
              )}

              {/* Mobile cards (always cards on small screens) */}
              <div className="md:hidden space-y-3">
                {visibleJobs.map((job) =>
                  renderJobCard(
                    job,
                    attachments.filter((att) => att.job_id === job.id)
                  )
                )}
              </div>

              {/* Pagination controls */}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500">
                <div className="flex items-center gap-3">
                  <span>
                    Showing {startDisplay}–{endDisplay} of {totalItems} jobs
                  </span>
                  <div className="inline-flex items-center gap-1">
                    <span className="text-[11px] text-slate-400">
                      Rows per page
                    </span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={safePage === 1}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-40 hover:bg-slate-50"
                  >
                    First
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((p) => Math.max(1, p - 1))
                    }
                    disabled={safePage === 1}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-40 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span className="px-2">
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={safePage === totalPages}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-40 hover:bg-slate-50"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safePage === totalPages}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-40 hover:bg-slate-50"
                  >
                    Last
                  </button>
                </div>
              </div>
            </>
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
