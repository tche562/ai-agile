"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

type TicketEditFormProps = {
  projectId: string;
  ticket: {
    id: string;
    title: string;
    description: string | null;
    status: (typeof STATUSES)[number];
    priority: (typeof PRIORITIES)[number];
  };
};

export function TicketEditForm({ projectId, ticket }: TicketEditFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? "");
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fieldsChanged = useMemo(() => {
    const changed: string[] = [];
    if (title !== ticket.title) {
      changed.push("title");
    }
    if ((description || null) !== ticket.description) {
      changed.push("description");
    }
    if (status !== ticket.status) {
      changed.push("status");
    }
    if (priority !== ticket.priority) {
      changed.push("priority");
    }
    return changed;
  }, [description, priority, status, ticket, title]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (fieldsChanged.length === 0) {
      setMessage("No changes to save.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description: description.trim() ? description : null,
          status,
          priority,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Failed to update ticket.");
        return;
      }

      const eventResponse = await fetch(`/api/projects/${projectId}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "TICKET_UPDATED",
          ticketId: ticket.id,
          payload: {
            fieldsChanged,
            summary: `Manual edit updated ${fieldsChanged.join(", ")}.`,
          },
        }),
      });

      if (!eventResponse.ok) {
        setError("Ticket saved, but the timeline event could not be created.");
        router.refresh();
        return;
      }

      setMessage("Ticket saved. A new version and timeline event were created.");
      router.refresh();
    } catch {
      setError("Failed to update ticket.");
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
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Manual edit</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Update ticket</h2>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Priority</span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as typeof priority)}
              className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
            >
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
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
        disabled={isSubmitting || !title.trim()}
        className="mt-6 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {isSubmitting ? "Saving..." : "Save ticket"}
      </button>
    </form>
  );
}
