import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentRunForm } from "@/components/tickets/agent-run-form";
import { TicketEditForm } from "@/components/tickets/ticket-edit-form";
import { db } from "@/server/db";
import { getOwnedProjectOr404 } from "@/server/projects/get-owned-project-or-404";
import { toTicketExecutionDTO } from "@/server/tickets/execution-context";

type TicketPageProps = {
  params: Promise<{ projectId: string; ticketId: string }>;
};

type JsonRecord = Record<string, unknown>;

const HARNESS_FIELDS = [
  ["goal", "Goal"],
  ["inputs", "Inputs"],
  ["output_format", "Output format"],
  ["acceptance_checks", "Acceptance checks"],
  ["non_goals", "Non-goals"],
  ["risks", "Risks"],
  ["test_ideas", "Test ideas"],
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Empty";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function HarnessPanel({ harness }: { harness: unknown }) {
  if (!harness) {
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Harness</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Execution context</h2>
        <p className="mt-4 rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
          This ticket does not have a harness in its current version snapshot.
        </p>
      </section>
    );
  }

  if (!isRecord(harness)) {
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Harness</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Execution context</h2>
        <pre className="mt-4 overflow-auto rounded-2xl bg-zinc-950 p-4 text-xs text-white">
          {stringifyValue(harness)}
        </pre>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Harness</p>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Execution context</h2>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {HARNESS_FIELDS.map(([key, label]) => {
          const value = harness[key];
          const items = Array.isArray(value) ? value : null;

          return (
            <article key={key} className="rounded-2xl border border-zinc-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {label}
              </h3>
              {items ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700">
                  {items.length === 0 ? <li>Empty</li> : null}
                  {items.map((item, index) => (
                    <li key={index}>{stringifyValue(item)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-zinc-700">{stringifyValue(value)}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default async function TicketPage({ params }: TicketPageProps) {
  const { projectId, ticketId } = await params;
  const project = await getOwnedProjectOr404(projectId);
  const [ticket, events] = await Promise.all([
    db.ticket.findFirst({
      where: {
        id: ticketId,
        projectId: project.id,
      },
      include: {
        currentVersion: true,
        versions: {
          orderBy: {
            version: "desc",
          },
          take: 6,
        },
      },
    }),
    db.event.findMany({
      where: {
        projectId: project.id,
        ticketId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
    }),
  ]);

  if (!ticket) {
    notFound();
  }

  const ticketDTO = toTicketExecutionDTO(ticket);

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link
            href={`/projects/${project.id}`}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            Back to dashboard
          </Link>
        </div>

        <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                Ticket detail
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950">
                {ticketDTO.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
                {ticketDTO.description ?? "No description"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700">
                {ticketDTO.status}
              </span>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700">
                {ticketDTO.priority}
              </span>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700">
                v{ticketDTO.currentVersionNumber ?? "none"}
              </span>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-8">
            <TicketEditForm projectId={project.id} ticket={ticketDTO} />
            <HarnessPanel harness={ticketDTO.harness} />
          </div>

          <aside className="space-y-8">
            <AgentRunForm ticketId={ticketDTO.id} />

            <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                Version history
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Snapshots</h2>
              <div className="mt-6 space-y-3">
                {ticket.versions.map((version) => (
                  <article key={version.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-zinc-950">Version {version.version}</p>
                      <p className="text-sm text-zinc-500">{formatDate(version.createdAt)}</p>
                    </div>
                    <pre className="mt-3 max-h-40 overflow-auto rounded-2xl bg-zinc-50 p-3 text-xs text-zinc-700">
                      {JSON.stringify(version.snapshot, null, 2)}
                    </pre>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Timeline</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Ticket events</h2>
              <div className="mt-6 space-y-3">
                {events.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                    No ticket events yet.
                  </p>
                ) : (
                  events.map((event) => (
                    <article key={event.id} className="rounded-2xl border border-zinc-200 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-semibold text-zinc-950">{event.type}</p>
                        <p className="text-sm text-zinc-500">{formatDate(event.createdAt)}</p>
                      </div>
                      <pre className="mt-3 max-h-48 overflow-auto rounded-2xl bg-zinc-50 p-3 text-xs text-zinc-700">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </article>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
