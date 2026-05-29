import { EventType } from "@prisma/client";
import Link from "next/link";

import { OrchestratorActions } from "@/components/projects/orchestrator-actions";
import { db } from "@/server/db";
import { getOwnedProjectOr404 } from "@/server/projects/get-owned-project-or-404";
import { toTicketExecutionDTO } from "@/server/tickets/execution-context";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function statusClassName(status: string): string {
  const classes: Record<string, string> = {
    BACKLOG: "bg-zinc-100 text-zinc-700",
    TODO: "bg-blue-50 text-blue-700",
    IN_PROGRESS: "bg-amber-50 text-amber-700",
    IN_REVIEW: "bg-purple-50 text-purple-700",
    BLOCKED: "bg-red-50 text-red-700",
    DONE: "bg-emerald-50 text-emerald-700",
  };
  return classes[status] ?? "bg-zinc-100 text-zinc-700";
}

function priorityClassName(priority: string): string {
  const classes: Record<string, string> = {
    LOW: "bg-zinc-100 text-zinc-700",
    MEDIUM: "bg-sky-50 text-sky-700",
    HIGH: "bg-orange-50 text-orange-700",
    CRITICAL: "bg-red-50 text-red-700",
  };
  return classes[priority] ?? "bg-zinc-100 text-zinc-700";
}

function stringifyDiffValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Empty";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function DashboardDiffView({ payload }: { payload: unknown }) {
  if (!isRecord(payload)) {
    return null;
  }

  const updatedTickets = getArray(payload.updatedTickets);
  const closedTickets = getArray(payload.closedTickets);
  const rejectedChanges = getArray(payload.rejectedChanges);
  const rationale = typeof payload.rationale === "string" ? payload.rationale : null;

  return (
    <section
      data-testid="replan-diff"
      className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Latest diff</p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Why the plan changed</h2>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600">
          {updatedTickets.length} updated, {closedTickets.length} closed
        </span>
      </div>

      {rationale ? (
        <p
          data-testid="replan-rationale"
          className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-700"
        >
          {rationale}
        </p>
      ) : null}

      <div className="mt-6 space-y-4">
        {[...updatedTickets, ...closedTickets].map((ticket, index) => {
          if (!isRecord(ticket)) {
            return null;
          }
          const title = typeof ticket.title === "string" ? ticket.title : "Untitled ticket";
          const diffs = getArray(ticket.diffs);

          return (
            <article key={`${title}-${index}`} className="rounded-2xl border border-zinc-200 p-4">
              <h3 className="font-semibold text-zinc-950">{title}</h3>
              <div className="mt-3 space-y-3">
                {diffs.map((diff, diffIndex) => {
                  if (!isRecord(diff)) {
                    return null;
                  }

                  return (
                    <div key={diffIndex} className="rounded-2xl bg-zinc-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {String(diff.field ?? "field")}
                      </p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs text-zinc-500">Before</p>
                          <p className="mt-1 break-words text-sm text-zinc-700">
                            {stringifyDiffValue(diff.before)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500">After</p>
                          <p className="mt-1 break-words text-sm font-medium text-zinc-950">
                            {stringifyDiffValue(diff.after)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      {rejectedChanges.length > 0 ? (
        <div className="mt-6 rounded-2xl bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Rejected changes</p>
          <ul className="mt-3 space-y-2 text-sm text-amber-800">
            {rejectedChanges.map((change, index) => {
              if (!isRecord(change)) {
                return null;
              }
              return <li key={index}>{String(change.reason ?? "Rejected by Apply Engine")}</li>;
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const project = await getOwnedProjectOr404(projectId);
  const [tickets, events, latestReplanEvent] = await Promise.all([
    db.ticket.findMany({
      where: {
        projectId: project.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        currentVersion: true,
      },
    }),
    db.event.findMany({
      where: {
        projectId: project.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 6,
    }),
    db.event.findFirst({
      where: {
        projectId: project.id,
        type: EventType.REPLAN_APPLIED,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  const ticketDTOs = tickets.map((ticket) => toTicketExecutionDTO(ticket));
  const ticketCountsByStatus = ticketDTOs.reduce<Record<string, number>>((counts, ticket) => {
    counts[ticket.status] = (counts[ticket.status] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link href="/projects" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            Back to projects
          </Link>
        </div>

        <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                Project Dashboard
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950">
                {project.name}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
                {project.description ?? "No project description yet."}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-2xl font-semibold text-zinc-950">{ticketDTOs.length}</p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Tickets</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-2xl font-semibold text-zinc-950">{events.length}</p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Events</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-2xl font-semibold text-zinc-950">
                  {ticketCountsByStatus.DONE ?? 0}
                </p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Done</p>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-8 space-y-8">
          <OrchestratorActions projectId={project.id} hasTickets={ticketDTOs.length > 0} />

          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                  Delivery plan
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Tickets</h2>
              </div>
              <p className="text-sm text-zinc-500">
                Click a ticket to edit, inspect harness, or run agents.
              </p>
            </div>

            {ticketDTOs.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 p-8 text-center">
                <h3 className="text-lg font-semibold text-zinc-950">No tickets yet</h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Use Generate Plan to create the first backlog for this project.
                </p>
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Ticket</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Priority</th>
                      <th className="px-4 py-3">Version</th>
                      <th className="px-4 py-3">Harness</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {ticketDTOs.map((ticket) => (
                      <tr
                        key={ticket.id}
                        data-testid="ticket-row"
                        className="transition hover:bg-zinc-50"
                      >
                        <td className="px-4 py-4">
                          <Link
                            href={`/projects/${project.id}/tickets/${ticket.id}`}
                            className="font-semibold text-zinc-950 hover:underline"
                          >
                            {ticket.title}
                          </Link>
                          <p className="mt-1 line-clamp-2 text-zinc-600">
                            {ticket.description ?? "No description"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${statusClassName(ticket.status)}`}
                          >
                            {ticket.status}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${priorityClassName(ticket.priority)}`}
                          >
                            {ticket.priority}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-zinc-600">
                          {ticket.currentVersionNumber ?? "None"}
                        </td>
                        <td className="px-4 py-4 text-zinc-600">
                          {ticket.harness ? "Ready" : "Missing"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {latestReplanEvent ? <DashboardDiffView payload={latestReplanEvent.payload} /> : null}

          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Timeline</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Recent project events</h2>
            </div>
            <div className="mt-6 space-y-3">
              {events.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                  No events yet.
                </p>
              ) : (
                events.map((event) => (
                  <article key={event.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-semibold text-zinc-950">{event.type}</p>
                      <p className="text-sm text-zinc-500">{formatDate(event.createdAt)}</p>
                    </div>
                    <p className="mt-2 break-words text-sm text-zinc-600">
                      {JSON.stringify(event.payload)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
