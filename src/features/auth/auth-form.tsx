"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Command, LoaderCircle } from "lucide-react";

const formSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});
type FormValues = z.infer<typeof formSchema>;

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const submit = form.handleSubmit(async (values) => {
    setMessage("");
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const result =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword(values)
          : await supabase.auth.signUp(values);
      if (result.error) throw result.error;
      if (mode === "sign-up" && !result.data.session) {
        setMessage("Check your email to confirm your account, then sign in.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication could not be completed.");
    } finally {
      setBusy(false);
    }
  });

  const googleSignIn = async () => {
    setMessage("");
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign-in could not be started.");
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <Link href="/" className="brand-lockup auth-brand">
        <span className="brand-mark">
          <Command size={19} />
        </span>
        <span>
          orbit<span className="brand-light">commerce</span>
        </span>
      </Link>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-heading">
          <span className="eyebrow">
            <span className="eyebrow-dot" /> COMMERCE COPILOT
          </span>
          <h1 id="auth-title">{mode === "sign-in" ? "Welcome back" : "Create your workspace"}</h1>
          <p>
            {mode === "sign-in"
              ? "Sign in to your commerce workspace."
              : "Your account will start with a private Owner workspace."}
          </p>
        </div>
        <form onSubmit={submit} noValidate>
          <label className="auth-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <span className="auth-error">{form.formState.errors.email.message}</span>
          )}
          <label className="auth-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            aria-invalid={Boolean(form.formState.errors.password)}
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <span className="auth-error">{form.formState.errors.password.message}</span>
          )}
          {message && (
            <p className="auth-message" role="status">
              {message}
            </p>
          )}
          <Button className="auth-submit" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" size={15} /> : null}
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <div className="auth-divider">
          <span /> or continue with <span />
        </div>
        <Button className="auth-submit" variant="outline" onClick={googleSignIn} disabled={busy}>
          Continue with Google
        </Button>
        <p className="auth-toggle">
          {mode === "sign-in" ? "New to Orbit?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setMessage("");
            }}
          >
            {mode === "sign-in" ? "Create an account" : "Sign in"}
          </button>
        </p>
        <p className="auth-demo">
          Want to look around first? <Link href="/">Open the public Demo Store</Link>
        </p>
      </section>
      <p className="auth-privacy">Your workspace data is isolated from other stores and members.</p>
    </main>
  );
}
