import { useState } from "react";
import { ArrowRight, MailCheck, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/supabaseClient";
import authVisual from "@/assets/experience-team-three-waist-up.png";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSent(false);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/portal` }
      });
      if (authError) throw authError;
      setSent(true);
    } catch (err) {
      setError(err?.message || "Could not send the verification email. Check Supabase Auth settings.");
    } finally {
      setBusy(false);
    }
  }

  return <AuthShell image={authVisual} imageAlt="Internlytic interns working together">
    <div className="flex items-center gap-3">
      <span className="grid size-11 place-items-center rounded-md bg-surface-mint text-primary"><ShieldCheck className="size-5" /></span>
      <div>
        <h1 className="text-2xl font-extrabold text-brand-ink sm:text-3xl">Intern portal sign in</h1>
        <p className="text-sm text-muted-foreground">Use the Gmail address registered with Internlytic.</p>
      </div>
    </div>
    <form className="mt-7 grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="login-email">Internship email address</Label>
        <Input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gmail.com" autoComplete="email" required />
      </div>
      {error && <p role="alert" className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{error}</p>}
      {sent && <div role="status" className="flex gap-3 border border-primary/20 bg-surface-mint p-4 text-sm text-brand-ink"><MailCheck className="mt-0.5 size-5 shrink-0 text-primary" /><p><strong>Verification link sent.</strong><br />Open the email on this device and tap the link. Access is granted only if your email matches an authorized Internlytic intern record.</p></div>}
      <Button type="submit" variant="brand" size="xl" className="w-full" disabled={busy}>{busy ? "Sending verification link…" : "Send secure sign-in link"} <ArrowRight /></Button>
    </form>
    <p className="mt-6 text-sm leading-6 text-muted-foreground">No public registration is available. If you have submitted the application form but your record is not yet authorized, please wait for the Internlytic team.</p>
    <Button type="button" variant="brandOutline" className="mt-3 w-full" onClick={() => navigate("/apply")}>Apply through the official form</Button>
  </AuthShell>;
}
