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

  // 1) Load jobs from Supabase
  const fetchJobs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching jobs:", error);
    } else {
      setJobs(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // 2) Handle form changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // 3) Create or update job
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
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
        fetchJobs();
      }
    } else {
      const { error } = await supabase.from("jobs").insert(payload);
      if (error) {
        console.error("Error inserting job:", error);
      } else {
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
        fetchJobs();
      }
    }
  };

  // 4) Edit existing
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
  };

  // 5) Delete job
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this job?")) return;
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) {
      console.error("Error deleting job:", error);
    } else {
      setJobs((prev) => prev.filter((j) => j.id !== id));
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem" }}>
      <h1>Job Applications Tracker</h1>
      <p>Track roles you find and your application progress.</p>

      {/* Form */}
      <section style={{ margin: "1.5rem 0", padding: "1rem", border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>{editingId ? "Edit job" : "Add new job"}</h2>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.5rem" }}>
          <div>
            <label>Company *</label><br/>
            <input
              name="company"
              value={form.company}
              onChange={handleChange}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label>Position *</label><br/>
            <input
              name="position"
              value={form.position}
              onChange={handleChange}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label>Source URL</label><br/>
            <input
              name="source_url"
              value={form.source_url}
              onChange={handleChange}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label>Date found *</label><br/>
            <input
              type="date"
              name="date_found"
              value={form.date_found}
              onChange={handleChange}
            />
          </div>

          <div>
            <label>Full ad / notes</label><br/>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label>
              <input
                type="checkbox"
                name="applied"
                checked={form.applied}
                onChange={handleChange}
              />{" "}
              Applied?
            </label>
          </div>

          {form.applied && (
            <>
              <div>
                <label>Applied date</label><br/>
                <input
                  type="date"
                  name="applied_date"
                  value={form.applied_date || ""}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label>Status</label><br/>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                >
                  <option value="not_applied">Not applied</option>
                  <option value="pending">Pending</option>
                  <option value="interview">Interview</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </>
          )}

          <button type="submit">
            {editingId ? "Update job" : "Add job"}
          </button>
        </form>
      </section>

      {/* List */}
      <section>
        <h2>Jobs</h2>
        {loading ? (
          <p>Loading...</p>
        ) : jobs.length === 0 ? (
          <p>No jobs yet. Add your first one above.</p>
        ) : (
          <table width="100%" border="1" cellPadding="6" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Company</th>
                <th>Position</th>
                <th>Date found</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.company}</td>
                  <td>{job.position}</td>
                  <td>{job.date_found}</td>
                  <td>{job.applied ? "Yes" : "No"}</td>
                  <td>{job.status}</td>
                  <td>
                    <button onClick={() => handleEdit(job)}>Edit</button>{" "}
                    <button onClick={() => handleDelete(job.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default App;
