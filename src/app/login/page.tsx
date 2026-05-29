"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <section className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">AI Agile</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950">
          Sign in to continue
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Use GitHub authentication to access your project dashboards and orchestrator workflow.
        </p>
        <button
          onClick={() => signIn("github", { callbackUrl: "/projects" })}
          className="mt-8 w-full rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Sign in with GitHub
        </button>
      </section>
    </main>
  );
}
