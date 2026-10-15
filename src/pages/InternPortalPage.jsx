import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, BriefcaseBusiness, FileText, LogOut, RefreshCw, UploadCloud, ExternalLink, Clock3, CheckCircle2 } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Header, Footer } from "@/components/layout";
import { Button } from "@/components/ui/button";

const ADMIN_EMAIL = String(import.meta.env.VITE_ADMIN_EMAIL || "arslanfayyaz1997@gmail.com").toLowerCase();

function niceDate(value) {
  if (!value) return "Not issued";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function prettyLabel(value) {
  return String(value || "Not provided").replaceAll("_", " ").replace(/\\b\\w/g, c => c.toUpperCase());
}
function docLink(record, type) {
  const keys = type === "offer"
    ? ["offer_letter_url", "offer_letter_pdf_url", "offer_letter_link"]
    : ["certificate_url", "certificate_pdf_url", "certificate_link"];
  return keys.map(key => record?.[key]).find(value => typeof value === "string" && /^https?:\\/\\//i.test(value)) || "";
}

export default function InternPortalPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [record, setRecord] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTask, setSelectedTask] = useState("");
  const [description, setDescription] = useState("");
  const [github, setGithub] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [otherLinks, setOtherLinks] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadPortal(user = session?.user) {
    if (!user?.email) return;
    setLoading(true); setError("");
    try {
      const email = user.email.toLowerCase();
      const { data: rows, error: recordError } = await supabase.from("certificates").select("*").ilike("student_email", email).limit(10);
      if (recordError) throw recordError;
      if (!rows?.length) {
        setRecord(null);
        setError("This email is not yet matched to an authorized intern record. Please contact Internlytic after your application has been reviewed.");
        return;
      }
      const matched = rows[0];
      setRecord(matched);
      const [{ data: taskRows, error: taskError }, { data: submissionRows, error: submissionError }] = await Promise.all([
        supabase.from("intern_tasks").select("*").eq("is_active", true).order("created_at", { ascending: false }),
        supabase.from("intern_task_submissions").select("*").eq("intern_email", email).order("created_at", { ascending: false })
      ]);
      if (taskError && taskError.code !== "42P01") throw taskError;
      if (submissionError && submissionError.code !== "42P01") throw submissionError;
      setTasks(taskRows || []); setSubmissions(submissionRows || []);
    } catch (err) {
      setError(err?.message || "Could not load your intern record. Check the portal database setup.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (!data.session) { navigate("/login", { replace: true }); return; }
      setSession(data.session);
      if (data.session.user.email?.toLowerCase() === ADMIN_EMAIL) {
        navigate("/admin", { replace: true });
        return;
      }
      loadPortal(data.session.user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      if (!nextSession) navigate("/login", { replace: true });
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  async function signOut() { await supabase.auth.signOut(); navigate("/login", { replace: true }); }

  async function submitTask(event) {
    event.preventDefault();
    setNotice(""); setError("");
    if (!record || !selectedTask) { setError("Please select a task before submitting."); return; }
    if (files.some(file => !/\\.(pdf|doc|docx)$/i.test(file.name))) { setError("Only PDF or Word files are allowed."); return; }
    if (files.some(file => file.size > 3 * 1024 * 1024)) { setError("Each file must be 3 MB or smaller for secure portal upload."); return; }
    setSending(true);
    try {
      let driveFiles = [];
      if (files.length) {
        for (const file of files) {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const response = await fetch("/api/task-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
            body: JSON.stringify({ internId: record.certificate_id, taskId: selectedTask, fileName: file.name, mimeType: file.type || "application/octet-stream", base64 })
          });
          if (!response.ok) throw new Error("A file could not be uploaded to Google Drive.");
          const result = await response.json();
          if (!result?.url) throw new Error("Google Drive did not return a file link.");
          driveFiles.push({ name: file.name, url: result.url });
        }
      }
      const task = tasks.find(item => String(item.id) === String(selectedTask));
      const { error: saveError } = await supabase.from("intern_task_submissions").insert({
        task_id: selectedTask,
        task_title: task?.title || "Internship task",
        intern_email: session.user.email.toLowerCase(),
        intern_name: record.student_name || session.user.email,
        certificate_id: record.certificate_id,
        program: record.program || record.internship_program || null,
        description: description.trim(),
        github_url: github.trim() || null,
        linkedin_url: linkedin.trim() || null,
        other_links: otherLinks.trim() || null,
        files: driveFiles,
        status: "submitted",
        completion_percent: 0
      });
      if (saveError) throw saveError;
      setDescription(""); setGithub(""); setLinkedin(""); setOtherLinks(""); setFiles([]);
      setNotice("Submission successful. Your work will be reviewed by the company. Please wait for the official certificate announcement.");
      await loadPortal(session.user);
    } catch (err) {
      setError(err?.message || "Could not submit this task. Please try again.");
    } finally { setSending(false); }
  }

  const offerIssued = ["issued", "sent", "completed", "approved"].includes(String(record?.offer_letter_status || "").toLowerCase());
  const certificateIssued = ["issued", "completed", "approved"].includes(String(record?.certificate_status || record?.status || "").toLowerCase());
  const offerUrl = docLink(record, "offer");
  const certificateUrl = docLink(record, "certificate");

  return <div className="min-h-screen bg-background text-foreground"><Header />
    <main className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Internlytic Technologies</p><h1 className="mt-2 text-3xl font-black text-brand-ink sm:text-4xl">Intern dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Your authorized internship record, tasks, and official documents.</p></div>
        <div className="flex gap-2"><Button variant="brandOutline" onClick={() => loadPortal(session?.user)} disabled={loading}><RefreshCw className="mr-2 size-4" />Refresh</Button><Button variant="brand" onClick={signOut}><LogOut className="mr-2 size-4" />Sign out</Button></div>
      </div>
      {loading && <p className="mt-8 rounded-xl border border-border bg-card p-5">Loading your authorized intern record…</p>}
      {error && <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
      {!loading && record && <>
        <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Intern", record.student_name || session?.user?.email, BriefcaseBusiness],
            ["Program", record.program || record.internship_program || "Not assigned", BadgeCheck],
            ["Offer letter", prettyLabel(record.offer_letter_status || "not issued"), FileText],
            ["Certificate", prettyLabel(record.certificate_status || record.status || "pending"), BadgeCheck]
          ].map(([label, value, Icon]) => <article key={label} className="rounded-xl border border-border bg-card p-5 shadow-sm"><Icon className="size-5 text-primary" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words font-bold text-brand-ink">{value}</p></article>)}
        </section>
        <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-7">
          <h2 className="text-xl font-extrabold text-brand-ink">Your internship record</h2>
          <p className="mt-1 text-sm text-muted-foreground">Details shown here are read from your authorized Supabase record.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(record).filter(([key, value]) => !/url|pdf|link|token|secret|password/i.test(key) && value !== null && value !== "").map(([key, value]) => <div key={key} className="min-w-0 rounded-lg bg-muted/40 p-3"><p className="text-xs font-semibold text-muted-foreground">{prettyLabel(key)}</p><p className="mt-1 break-words text-sm font-semibold">{typeof value === "object" ? JSON.stringify(value) : String(value)}</p></div>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild variant="brandOutline"><a href="/verify" target="_blank" rel="noreferrer"><ExternalLink className="mr-2 size-4" />Verify a document</a></Button>
            {offerIssued && offerUrl && <Button asChild variant="brand"><a href={offerUrl} target="_blank" rel="noreferrer"><FileText className="mr-2 size-4" />Preview / download offer letter</a></Button>}
            {certificateIssued && certificateUrl && <Button asChild variant="brand"><a href={certificateUrl} target="_blank" rel="noreferrer"><BadgeCheck className="mr-2 size-4" />Preview / download certificate</a></Button>}
          </div>
          {offerIssued && !offerUrl && <p className="mt-3 text-sm text-muted-foreground">Offer letter is marked issued, but its PDF link is not present in this record. Contact the admin for the official file.</p>}
          {certificateIssued && !certificateUrl && <p className="mt-3 text-sm text-muted-foreground">Certificate status is issued, but its PDF link is not present in this record. Contact the admin for the official file.</p>}
        </section>
        <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-7">
          <div className="flex items-center gap-3"><Clock3 className="size-5 text-primary" /><div><h2 className="text-xl font-extrabold text-brand-ink">Task submissions</h2><p className="text-sm text-muted-foreground">Submitting work does not issue a certificate. Admin approval controls completion.</p></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{submissions.map(item => <article key={item.id} className="rounded-lg border border-border p-4"><p className="font-bold">{item.task_title || "Task submission"}</p><p className="mt-1 text-sm text-muted-foreground">Status: {prettyLabel(item.status)}</p><p className="mt-1 text-sm text-muted-foreground">Completion: {Number(item.completion_percent || 0)}%</p>{item.admin_feedback && <p className="mt-2 text-sm">{item.admin_feedback}</p>}{Array.isArray(item.files) && item.files.map(file => <a key={file.url} href={file.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-primary underline">{file.name || "Submitted file"}</a>)}</article>)}</div>
          {tasks.length === 0 ? <p className="mt-5 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">No tasks have been published yet. Watch the official WhatsApp community for task announcements.</p> : <form onSubmit={submitTask} className="mt-6 grid gap-4 border-t border-border pt-6">
            <h3 className="text-lg font-bold">Submit a task</h3>
            <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="task">Task</label><select id="task" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedTask} onChange={e => setSelectedTask(e.target.value)} required><option value="">Choose an announced task</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></div>
            <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="task-description">Description / notes</label><textarea id="task-description" className="min-h-28 rounded-md border border-input bg-background p-3 text-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your work and anything the reviewer should know…" required /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="github">GitHub profile / repository</label><input id="github" type="url" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={github} onChange={e => setGithub(e.target.value)} placeholder="https://github.com/…" /></div><div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="linkedin">LinkedIn profile / post</label><input id="linkedin" type="url" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="https://linkedin.com/…" /></div></div>
            <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="other-links">Other links (optional)</label><textarea id="other-links" className="min-h-20 rounded-md border border-input bg-background p-3 text-sm" value={otherLinks} onChange={e => setOtherLinks(e.target.value)} placeholder="Live demo, Figma, Google Drive, etc." /></div>
            <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="task-files">Attach PDF / Word files (max 3 MB each)</label><input id="task-files" type="file" multiple accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => setFiles(Array.from(e.target.files || []))} className="block w-full text-sm" />{files.length > 0 && <p className="text-xs text-muted-foreground">{files.map(f => f.name).join(", ")}</p>}</div>
            <p className="rounded-lg bg-surface-mint p-3 text-sm text-brand-ink">Instructions: read the task announced by the team, submit your own work, include relevant links, and upload supporting PDF/Word files. The team will review your submission.</p>
            <Button type="submit" variant="brand" disabled={sending}>{sending ? "Submitting…" : <><UploadCloud className="mr-2 size-4" />Submit task</>}</Button>
          </form>}
          {notice && <p role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-surface-mint p-4 text-sm text-brand-ink"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />{notice}</p>}
        </section>
      </>}
    </main><Footer /></div>;
}
