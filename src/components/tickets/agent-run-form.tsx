"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ROLES = ["PLANNER", "IMPLEMENTER", "QA"] as const;

type AgentRunFormProps = {
  ticketId: string;
};

export function AgentRunForm({ ticketId }: AgentRunFormProps) {
  const router = useRouter();
  const [role, setRole] = useState<(typeof ROLES)[number]>("PLANNER");
  const [instruction, setInstruction] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/tickets/${ticketId}/agent-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role,
          ...(instruction.trim() ? { instruction } : {}),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Agent run failed.");
        return;
      }

      setMessage(`${role} worklog added to the timeline.`);
      setInstruction("");
      router.refresh();
    } catch {
      setError("Agent run failed.");
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
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Agent run</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Ask a role agent</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Runs Epic 6 agent execution and writes a structured worklog event back into the timeline.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
            className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Instruction</span>
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
            placeholder="Optional focus for this agent run."
          />
        </label>
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 rounded-2xl border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
      >
        {isSubmitting ? "Running..." : "Run agent"}
      </button>
    </form>
  );
}
