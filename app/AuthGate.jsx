"use client";

import { useEffect, useState } from "react";

import supabase, { isConfigured } from "@/src/lib/supabaseClient";

export default function AuthGate({ children }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!isConfigured || !supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setIsLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function onSignIn(e) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    if (!isConfigured || !supabase) {
      setError("Supabase is not configured.");
      return;
    }

    try {
      setIsSigningIn(true);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) throw signInError;
    } catch (err) {
      setError(err?.message ? String(err.message) : "Login failed.");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function onSignOut() {
    if (!isConfigured || !supabase) return;
    await supabase.auth.signOut();
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 grid place-items-center">
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
          <form
            onSubmit={onSignIn}
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"
          >
            <h1 className="text-xl font-semibold">Login</h1>
            <p className="mt-1 text-sm text-zinc-400">Sign in to open the dashboard.</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700"
                  placeholder="Your password"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error ? (
              <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSigningIn}
              className="mt-4 h-11 w-full rounded-xl bg-zinc-50 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningIn ? "Signing in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed right-3 top-3 z-50">
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-800"
        >
          Logout
        </button>
      </div>
      {children}
    </>
  );
}

