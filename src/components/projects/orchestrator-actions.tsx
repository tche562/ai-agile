"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ActionResult = {
  createdTickets?: unknown[];
  updatedTickets?: unknown[];
  closedTickets?: unknown[];
  rejectedChanges?: unknown[];
  rationale?: string;
};

type OrchestratorActionsProps = {
  projectId: string;
  hasTickets: boolean;
};

function getCount(value: unknown[] | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

export function OrchestratorActions({ projectId, hasTickets }: OrchestratorActionsProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReplanning, setIsReplanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(kind: "generate" | "replan") {
    setError(null);
    setMessage(null);
    const setLoading = kind === "generate" ? setIsGenerating : setIsReplanning;
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/orchestrator/${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: kind === "replan" ? JSON.stringify({ recentEventLimit: 30 }) : undefined,
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? `${kind} failed.`);
        return;
      }

      const result = payload as ActionResult;
      const created = getCount(result.createdTickets);
      const updated = getCount(result.updatedTickets);
      const closed = getCount(result.closedTickets);
      const rejected = getCount(result.rejectedChanges);
      setMessage(
        `${kind === "generate" ? "Generate Plan" : "Replan"} applied: ${created} created, ${updated} updated, ${closed} closed, ${rejected} rejected.`,
      );
      router.refresh();
    } catch {
      setError(`${kind === "generate" ? "Generate Plan" : "Replan"} failed.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Orchestrator</p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Generate and replan</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Generate Plan starts an empty project. Replan consumes recent events and safely updates
            mutable backlog tickets through the Apply Engine.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => runAction("generate")}
            disabled={isGenerating || hasTickets}
            className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isGenerating ? "Generating..." : "Generate Plan"}
          </button>
          <button
            type="button"
            onClick={() => runAction("replan")}
            disabled={isReplanning || !hasTickets}
            className="rounded-2xl border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {isReplanning ? "Replanning..." : "Replan"}
          </button>
        </div>
      </div>

      {hasTickets ? null : (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Generate Plan is available because this project has no tickets yet.
        </p>
      )}
      {message ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
    </section>
  );
}
