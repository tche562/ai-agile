import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">
            AI Agile MVP
          </p>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-zinc-950 sm:text-7xl">
            Plan, replan, and inspect the diff.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
            Create a project, generate an initial ticket plan, run role agents, edit tickets, and
            understand exactly what the orchestrator changed.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/projects"
            className="rounded-2xl bg-zinc-950 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Open projects
          </Link>
          <Link
            href="/login"
            className="rounded-2xl border border-zinc-300 px-6 py-3 text-center text-sm font-semibold text-zinc-900 transition hover:bg-white"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            ["Generate", "Turn project context into a visible ticket backlog."],
            ["Execute", "Run Planner, Implementer, or QA agents against a ticket."],
            ["Explain", "Review rationale and field-level diffs after every replan."],
          ].map(([title, description]) => (
            <article key={title} className="rounded-3xl border border-zinc-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
