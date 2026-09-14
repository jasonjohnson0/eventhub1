import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Mic, PartyPopper } from "lucide-react";
import { getPublicCoordinator } from "@/lib/coordinator.functions";
import { listPublicPeople } from "@/lib/organizers.functions";

/** Public speaker directory for one coordinator (spec 06). A flat sibling of
 *  `c.$slug.tsx`, not nested under it -- same pattern `events.$id.manage.tsx`
 *  already uses alongside `events.$id.tsx`, so the bare `/c/$slug` calendar
 *  URL is untouched. */
export const Route = createFileRoute("/c/$slug_/speakers")({
  loader: async ({ params }) => {
    const coordinator = await getPublicCoordinator({ data: { slug: params.slug } });
    if (!coordinator) throw notFound();
    const people = await listPublicPeople({
      data: { coordinator_id: coordinator.coordinator_id, kind: "speaker" },
    });
    return { coordinator, people };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.coordinator.company_name || "Event calendar";
    return {
      meta: [
        { title: `Speakers — ${name}` },
        { name: "description", content: `Speakers appearing at ${name} events.` },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <PartyPopper className="h-10 w-10 text-fuchsia-400" />
      <h1 className="text-2xl font-black text-slate-900">No calendar here</h1>
      <p className="max-w-md text-slate-500">
        This calendar either does not exist or has not finished being set up.
      </p>
      <Link to="/events" className="mt-2 font-semibold text-fuchsia-600 hover:underline">
        Browse all events
      </Link>
    </div>
  ),
  component: SpeakersDirectory,
});

function SpeakersDirectory() {
  const { coordinator, people } = Route.useLoaderData();
  const name = coordinator.company_name || coordinator.slug;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Link
            to="/c/$slug"
            params={{ slug: coordinator.slug }}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            ← {name}
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-black text-slate-900">
            <Mic className="h-6 w-6 text-fuchsia-500" /> Speakers
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {people.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
            No speakers listed yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <Link
                key={p.id}
                to="/c/$slug/p/$id"
                params={{ slug: coordinator.slug, id: p.id }}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-fuchsia-300 hover:shadow-sm"
              >
                {p.photo_url ? (
                  <img
                    src={p.photo_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">{p.name}</div>
                  {p.title && <div className="truncate text-sm text-slate-500">{p.title}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
