import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function App() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    company: "",
    position: "",
    source_url: "",
    date_found: "",
    description: "",
    applied: false,
    applied_date: "",
    status: "not_applied",
  });
  const [editingId, setEditingId] = useState(null);

  // Load jobs from Supabase
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

  useEffect(() => {
    fetchJobs();
  }, []);

  // Form change handler
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Create / update job
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
        setEditingId(null);
        resetForm();
        fetchJobs();
      }
    } else {
      const { error } = await supabase.from("jobs").insert(payload);
      if (error) {
        console.error("Error inserting job:", error);
      } else {
        resetForm();
        fetchJobs();
      }
    }
  };

  const resetForm = () => {
    setForm({
      company: "",
      position: "",
      source_url: "",
      date_found: "",
      description: "",
      applied: false,
      applied_date: "",
      status: "not_applied",
    });
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Job Applications Tracker
          </h1>
          <p className="text-sm text-slate-500">
            Track roles you find and your application progress.
          </p>
        </div>
      </header>

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
                onClick={() => {
                  setEditingId(null);
                  resetForm();
                }}
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
            <p className="text-xs text-slate-500">
              Total: {jobs.length}
            </p>
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
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {jobs.map((job) => (
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
                      <td className="px-3 py-2 align-top space-x-2">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
