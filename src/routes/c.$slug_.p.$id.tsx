import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Globe, Linkedin, PartyPopper, Twitter } from "lucide-react";
import { getPublicCoordinator } from "@/lib/coordinator.functions";
import { getPublicPerson } from "@/lib/organizers.functions";
import { fmtDateRange } from "@/queries/events";

/** Public person page (spec 06): bio, credentials, socials, and this
 *  coordinator's upcoming public events they're assigned to. Flat sibling of
 *  `c.$slug.tsx` -- same reasoning as `c.$slug.speakers.tsx`. */
export const Route = createFileRoute("/c/$slug_/p/$id")({
  loader: async ({ params }) => {
    const coordinator = await getPublicCoordinator({ data: { slug: params.slug } });
    if (!coordinator) throw notFound();
    const result = await getPublicPerson({ data: { id: params.id } });
    // A person id that doesn't exist, or belongs to a different coordinator
    // than the slug in the URL, is the same "nothing here" case -- this
    // never confirms whether an id exists elsewhere.
    if (!result || result.person.coordinator_id !== coordinator.coordinator_id) throw notFound();
    return { coordinator, person: result.person, events: result.events };
  },
  head: ({ loaderData }) => {
    const person = loaderData?.person;
    const name = loaderData?.coordinator.company_name || "Event calendar";
    return {
      meta: [
        { title: person ? `${person.name} — ${name}` : name },
        ...(person?.bio ? [{ name: "description", content: person.bio.slice(0, 160) }] : []),
      ],
    };
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <PartyPopper className="h-10 w-10 text-fuchsia-400" />
      <h1 className="text-2xl font-black text-slate-900">No profile here</h1>
      <p className="max-w-md text-slate-500">
        This profile either does not exist or is not part of this calendar.
      </p>
      <Link to="/events" className="mt-2 font-semibold text-fuchsia-600 hover:underline">
        Browse all events
      </Link>
    </div>
  ),
  component: PersonPage,
});

function PersonPage() {
  const { coordinator, person, events } = Route.useLoaderData();
  const name = coordinator.company_name || coordinator.slug;
  const social = person.social_links ?? {};

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <Link
            to="/c/$slug"
            params={{ slug: coordinator.slug }}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            ← {name}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex flex-wrap items-center gap-4">
          {person.photo_url ? (
            <img
              src={person.photo_url}
              alt=""
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xl font-semibold text-slate-600">
              {person.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900">{person.name}</h1>
            {person.title && <p className="text-slate-600">{person.title}</p>}
            {person.credentials && (
              <p className="text-sm text-slate-500">{person.credentials}</p>
            )}
          </div>
        </div>

        {(social.linkedin || social.twitter || social.website) && (
          <div className="mt-4 flex gap-3">
            {social.linkedin && (
              <a
                href={social.linkedin}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-sky-700"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-5 w-5" />
              </a>
            )}
            {social.twitter && (
              <a
                href={social.twitter}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-sky-500"
                aria-label="Twitter"
              >
                <Twitter className="h-5 w-5" />
              </a>
            )}
            {social.website && (
              <a
                href={social.website}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-slate-800"
                aria-label="Website"
              >
                <Globe className="h-5 w-5" />
              </a>
            )}
          </div>
        )}

        {person.bio && (
          <p className="mt-6 whitespace-pre-wrap leading-relaxed text-slate-700">{person.bio}</p>
        )}

        {events.length > 0 && (
          <div className="mt-10 border-t border-slate-200 pt-6">
            <h2 className="text-lg font-bold text-slate-900">Upcoming events</h2>
            <div className="mt-3 space-y-2">
              {events.map((e) => (
                <Link
                  key={e.id}
                  to="/events/$id"
                  params={{ id: e.id }}
                  className="block rounded-xl border border-slate-200 p-4 transition hover:border-fuchsia-300 hover:shadow-sm"
                >
                  <p className="font-semibold text-slate-900">{e.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {fmtDateRange(e)}
                    {e.role === "both" ? " · Organizer & Speaker" : e.role === "speaker" ? " · Speaker" : " · Organizer"}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
