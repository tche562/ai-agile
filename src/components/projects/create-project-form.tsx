"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          ...(description.trim() ? { description } : {}),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Failed to create project.");
        return;
      }

      router.push(`/projects/${payload.id}`);
      router.refresh();
    } catch {
      setError("Failed to create project.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">New project</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Start an Agile workspace</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Create a project first, then generate its initial ticket plan from the dashboard.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Project name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
            placeholder="AI Agile MVP"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
            placeholder="What are we building, and what constraints should the AI planner know?"
          />
        </label>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting || !name.trim()}
        className="mt-6 w-full rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {isSubmitting ? "Creating..." : "Create project"}
      </button>
    </form>
  );
}
