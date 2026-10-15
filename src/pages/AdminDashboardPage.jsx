import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, RefreshCw, Plus, CheckCircle2, XCircle, Users, ClipboardList } from "lucide-react";
import { Header, Footer } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/supabaseClient";

const ADMIN_EMAIL = String(import.meta.env.VITE_ADMIN_EMAIL || "arslanfayyaz1997@gmail.com").toLowerCase();
const TRACKS = ["All tracks", "UX/UI Designing Interns", "Front-End Development Interns", "Prompt Engineering Interns"];
const TRACK_ALIASES = {
  "UX/UI Designing Interns": ["ux/ui", "ui/ux", "design"],
  "Front-End Development Interns": ["front end", "frontend", "web development"],
  "Prompt Engineering Interns": ["prompt"]
};
const pretty = value => String(value ?? "—").replaceAll("_", " ").replace(/\\b\\w/g, c => c.toUpperCase());

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [track, setTrack] = useState("All tracks");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskInstructions, setTaskInstructions] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [{ data: certs, error: certError }, { data: submitted, error: subError }, { data: activeTasks, error: taskError }] = await Promise.all([
        supabase.from("certificates").select("*").order("student_name"),
        supabase.from("intern_task_submissions").select("*").order("created_at", { ascending: false }),
        supabase.from("intern_tasks").select("*").order("created_at", { ascending: false })
      ]);
      if (certError) throw certError;
      if (subError) throw subError;
      if (taskError) throw taskError;
      setRecords(certs || []); setSubmissions(submitted || []); setTasks(activeTasks || []);
    } catch (err) {
      setError(err?.message || "Unable to load admin data. Check the SQL setup and RLS policies.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) { navigate("/login", { replace: true }); return; }
      const current = data.session.user;
      setUser(current);
      if (current.email?.toLowerCase() !== ADMIN_EMAIL) {
        navigate("/portal", { replace: true });
        return;
      }
      loadData();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/login", { replace: true });
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const filteredRecords = useMemo(() => records.filter(row => {
    const haystack = [row.student_name, row.student_email, row.program, row.internship_program, row.certificate_id].join(" ").toLowerCase();
    const searchMatch = haystack.includes(search.toLowerCase());
    const program = String(row.program || row.internship_program || "").toLowerCase();
    const trackMatch = track === "All tracks" || (TRACK_ALIASES[track] || []).some(alias => program.includes(alias));
    return searchMatch && trackMatch;
  }), [records, search, track]);

  async function createTask(event) {
    event.preventDefault(); setNotice(""); setError("");
    try {
      const { error: insertError } = await supabase.from("intern_tasks").insert({ title: taskTitle.trim(), instructions: taskInstructions.trim(), is_active: true, created_by: user?.email });
      if (insertError) throw insertError;
      setTaskTitle(""); setTaskInstructions(""); setNotice("Task published to the intern portal."); await loadData();
    } catch (err) { setError(err?.message || "Could not publish task."); }
  }

  async function reviewSubmission(item, status) {
    setError(""); setNotice("");
    try {
      const { error: updateError } = await supabase.from("intern_task_submissions").update({
        status,
        completion_percent: status === "approved" ? 100 : 0,
        reviewed_by: user?.email,
        reviewed_at: new Date().toISOString()
      }).eq("id", item.id);
      if (updateError) throw updateError;
      setNotice(`Submission ${status}. Completion is ${status === "approved" ? "100%" : "0%"} for this task. Certificate issuance remains a separate manual step.`);
      await loadData();
    } catch (err) { setError(err?.message || "Could not update submission status."); }
  }

  async function signOut() { await supabase.auth.signOut(); navigate("/login", { replace: true }); }

  return <div className="min-h-screen bg-background text-foreground"><Header />
    <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Restricted access</p><h1 className="mt-2 text-3xl font-black text-brand-ink sm:text-4xl">Admin dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Intern records, tasks, and review queue. Signed in as {user?.email || "admin"}.</p></div><div className="flex gap-2"><Button variant="brandOutline" onClick={loadData} disabled={loading}><RefreshCw className="mr-2 size-4" />Refresh</Button><Button variant="brand" onClick={signOut}><LogOut className="mr-2 size-4" />Sign out</Button></div></div>
      {error && <p role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-lg border border-primary/20 bg-surface-mint p-4 text-sm text-brand-ink">{notice}</p>}
      <section className="mt-7 grid gap-4 sm:grid-cols-3"><article className="rounded-xl border border-border bg-card p-5"><Users className="size-5 text-primary" /><p className="mt-3 text-sm text-muted-foreground">Intern records</p><p className="text-3xl font-black">{records.length}</p></article><article className="rounded-xl border border-border bg-card p-5"><ClipboardList className="size-5 text-primary" /><p className="mt-3 text-sm text-muted-foreground">Task submissions</p><p className="text-3xl font-black">{submissions.length}</p></article><article className="rounded-xl border border-border bg-card p-5"><CheckCircle2 className="size-5 text-primary" /><p className="mt-3 text-sm text-muted-foreground">Approved submissions</p><p className="text-3xl font-black">{submissions.filter(s => s.status === "approved").length}</p></article></section>
      <section className="mt-7 rounded-xl border border-border bg-card p-5 sm:p-7"><h2 className="text-xl font-extrabold">Publish a task</h2><p className="mt-1 text-sm text-muted-foreground">Add the task instructions you announce in WhatsApp. It will appear in authorized interns’ dashboards.</p><form onSubmit={createTask} className="mt-4 grid gap-3"><input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required placeholder="Task title" className="h-10 rounded-md border border-input bg-background px-3 text-sm" /><textarea value={taskInstructions} onChange={e => setTaskInstructions(e.target.value)} required placeholder="Instructions, requirements, deadline…" className="min-h-24 rounded-md border border-input bg-background p-3 text-sm" /><Button type="submit" variant="brand" disabled={!taskTitle.trim() || !taskInstructions.trim()}><Plus className="mr-2 size-4" />Publish task</Button></form><div className="mt-5 grid gap-3 sm:grid-cols-2">{tasks.map(task => <article key={task.id} className="rounded-lg border border-border p-3"><p className="font-bold">{task.title}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{task.instructions}</p><p className="mt-2 text-xs text-muted-foreground">{task.is_active ? "Active" : "Archived"}</p></article>)}</div></section>
      <section className="mt-7 rounded-xl border border-border bg-card p-5 sm:p-7"><h2 className="text-xl font-extrabold">Intern records</h2><p className="mt-1 text-sm text-muted-foreground">Search by name, email, program, or ID. The table reflects records from the existing certificates table.</p><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_260px]"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search intern records…" className="h-10 rounded-md border border-input bg-background px-3 text-sm" /><select value={track} onChange={e => setTrack(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{TRACKS.map(t => <option key={t}>{t}</option>)}</select></div>
        {loading ? <p className="mt-5 text-sm text-muted-foreground">Loading records…</p> : <div className="mt-4 grid gap-3">{filteredRecords.map((row, index) => <details key={`${row.certificate_id || row.student_email || index}-${index}`} className="rounded-lg border border-border p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-brand-ink">{row.student_name || "Unnamed intern"}</p><p className="text-sm text-muted-foreground">{row.student_email || "No email"} · {row.program || row.internship_program || "Program not set"}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{row.certificate_id || "No ID"}</span></div></summary><div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(row).filter(([key, value]) => !/url|pdf|link|token|secret|password/i.test(key) && value !== null && value !== "").map(([key, value]) => <div key={key} className="min-w-0 rounded-md bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{pretty(key)}</p><p className="mt-1 break-words text-sm font-semibold">{typeof value === "object" ? JSON.stringify(value) : String(value)}</p></div>)}</div></details>)}</div>}
      </section>
      <section className="mt-7 rounded-xl border border-border bg-card p-5 sm:p-7"><h2 className="text-xl font-extrabold">Review task submissions</h2><p className="mt-1 text-sm text-muted-foreground">Only an admin approval changes a submission’s completion to 100%. This does not issue a certificate.</p><div className="mt-4 grid gap-4">{submissions.map(item => <article key={item.id} className="rounded-xl border border-border p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-brand-ink">{item.task_title || "Task submission"}</p><p className="mt-1 text-sm text-muted-foreground">{item.intern_name} · {item.intern_email}</p><p className="mt-1 text-sm">Program: {item.program || "—"} · Status: <strong>{pretty(item.status)}</strong> · Completion: {Number(item.completion_percent || 0)}%</p></div><div className="flex flex-wrap gap-2"><Button variant="brand" onClick={() => reviewSubmission(item, "approved")}><CheckCircle2 className="mr-1 size-4" />Approve</Button><Button variant="brandOutline" onClick={() => reviewSubmission(item, "rejected")}><XCircle className="mr-1 size-4" />Reject</Button></div></div>{item.description && <p className="mt-3 whitespace-pre-wrap text-sm">{item.description}</p>}<div className="mt-3 flex flex-wrap gap-3 text-sm">{item.github_url && <a className="text-primary underline" href={item.github_url} target="_blank" rel="noreferrer">GitHub</a>}{item.linkedin_url && <a className="text-primary underline" href={item.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a>}{item.other_links && <p className="whitespace-pre-wrap">{item.other_links}</p>}{Array.isArray(item.files) && item.files.map(file => <a key={file.url} className="text-primary underline" href={file.url} target="_blank" rel="noreferrer">{file.name || "Open submitted file"}</a>)}</div>{item.admin_feedback && <p className="mt-3 text-sm">Feedback: {item.admin_feedback}</p>}</article>)}{!submissions.length && <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">No task submissions yet.</p>}</div></section>
    </main><Footer /></div>;
}
