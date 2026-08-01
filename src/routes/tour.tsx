import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PartyPopper, Check, X, ArrowRight } from "lucide-react";
import thumbnail from "@/assets/gumroad-thumbnail.jpg";
import shot01 from "@/assets/tour/01-hero.jpg";
import shot02 from "@/assets/tour/02-grid.jpg";
import shot03 from "@/assets/tour/03-category.jpg";
import shot04 from "@/assets/tour/04-search.jpg";
import shot05 from "@/assets/tour/05-datefilter.jpg";
import shot06 from "@/assets/tour/06-detail.jpg";
import shot07 from "@/assets/tour/07-detail-rsvp.jpg";
import shot08 from "@/assets/tour/08-detail-more.jpg";
import shot09 from "@/assets/tour/09-submit.jpg";
import shot10 from "@/assets/tour/10-submit-form.jpg";
import shot11 from "@/assets/tour/11-signin.jpg";
import shot12 from "@/assets/tour/12-signup.jpg";
import shot13 from "@/assets/tour/13-mobile-detail.jpg";
import shot14 from "@/assets/tour/14-mobile-submit.jpg";
import shot15 from "@/assets/tour/15-subscribe.jpg";
import shot16 from "@/assets/tour/16-mobile.jpg";

export const Route = createFileRoute("/tour")({
  head: () => ({
    meta: [
      { title: "Product Tour — EventHub Community Calendar Platform" },
      {
        name: "description",
        content:
          "See EventHub in action: a white-label community event calendar with paid tickets, sponsorships and zero platform fees. Keep 100% of your revenue.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "EventHub — Keep 100% of your event revenue" },
      {
        property: "og:description",
        content:
          "A multi-tenant community calendar with ticketing, sponsorships, submissions and check-in. No Eventbrite fees.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TourPage,
});

const SHOTS: { src: string; title: string; blurb: string; group: string; tall?: boolean }[] = [
  { src: shot01, group: "Discovery", title: "Public calendar hero", blurb: "Confetti, category pills and instant search — no login wall." },
  { src: shot02, group: "Discovery", title: "Event grid", blurb: "Colorful cards with date, venue and going count." },
  { src: shot03, group: "Discovery", title: "Full listing", blurb: "Every approved event in the region on one scrollable page." },
  { src: shot04, group: "Discovery", title: "Keyword search", blurb: "Type-ahead filtering across titles, venues and descriptions." },
  { src: shot05, group: "Discovery", title: "Date filters", blurb: "This week / this month scoping in a single tap." },
  { src: shot06, group: "Event page", title: "Event detail", blurb: "Cover art, time, venue, hybrid join link and share row." },
  { src: shot07, group: "Event page", title: "RSVP & capacity", blurb: "Save your spot, capacity limits and automatic waitlists." },
  { src: shot08, group: "Event page", title: "Sponsor slots", blurb: "Sellable ad positions with live pricing on every event." },
  { src: shot09, group: "Submissions", title: "Community submission", blurb: "Anyone can propose an event — no account required." },
  { src: shot10, group: "Submissions", title: "Submission form", blurb: "Date, venue, category and image, straight into the review queue." },
  { src: shot11, group: "Accounts", title: "Sign in", blurb: "Google, Apple or email for coordinators, staff and admins." },
  { src: shot12, group: "Accounts", title: "Create account", blurb: "Self-serve signup that lands in the coordinator workspace." },
  { src: shot13, group: "Mobile", title: "Event page on mobile", blurb: "Fully responsive detail pages for on-the-go attendees.", tall: true },
  { src: shot14, group: "Mobile", title: "Submit from a phone", blurb: "The submission flow works from any device.", tall: true },
  { src: shot15, group: "Marketing", title: "Newsletter opt-in", blurb: "Double opt-in subscriber capture built into the calendar." },
  { src: shot16, group: "Mobile", title: "Mobile discovery", blurb: "The full calendar, thumb-friendly.", tall: true },
];

const GROUPS = ["Discovery", "Event page", "Submissions", "Accounts", "Mobile", "Marketing"] as const;

const FEATURES = [
  ["🎟️", "Paid ticketing", "Your own Stripe keys. Money lands in your account, not ours."],
  ["💸", "Sponsorship revenue", "Sell ad slots and event sponsorships directly on your calendar."],
  ["🏢", "Multi-tenant", "One deployment, unlimited coordinators, each with their own slug and branding."],
  ["📮", "Email delivery", "SendGrid, Postmark or Mailgun — invites, reminders and announcements."],
  ["📍", "Venues & maps", "Saved venues, geocoding and a radius search across your region."],
  ["📱", "QR check-in", "Scan tickets at the door from any phone. Waitlists auto-promote."],
];

function TourPage() {
  const [stats, setStats] = useState<{ events: number; categories: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("events").select("category").eq("status", "approved").limit(500);
      if (cancelled) return;
      const rows = data ?? [];
      setStats({ events: rows.length, categories: new Set(rows.map((r) => r.category)).size });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-6 py-5">
        <Link to="/events" className="flex items-center gap-2 text-lg font-black text-slate-900">
          <PartyPopper className="h-6 w-6 text-fuchsia-500" />
          EventHub
        </Link>
        <Button asChild size="sm" className="rounded-full">
          <Link to="/events">Browse the live calendar</Link>
        </Button>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-8 md:grid-cols-2">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-fuchsia-100 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-fuchsia-700">
            Now on Gumroad
          </div>
          <h1 className="mt-5 text-5xl font-black leading-tight tracking-tight text-slate-900">
            Keep{" "}
            <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 bg-clip-text text-transparent">
              100% of your
            </span>{" "}
            event revenue.
          </h1>
          <p className="mt-5 max-w-md text-lg text-slate-600">
            EventHub is a white-label community event calendar you own outright. Sell tickets and sponsorships with
            your own Stripe account — no per-ticket cut, no Eventbrite fees, no platform tax.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/events">
                See it live <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/setup">Start your calendar</Link>
            </Button>
          </div>
        </div>
        <img
          src={thumbnail}
          alt="EventHub — keep 100% revenue, no Eventbrite fees"
          width={600}
          height={600}
          className="mx-auto w-full max-w-sm rounded-3xl shadow-2xl"
        />
      </section>

      {/* Fee comparison */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-black text-slate-900">The math on a $25 ticket</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-8">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-500">
                <X className="h-5 w-5" /> Big ticketing platforms
              </h3>
              <p className="mt-4 text-4xl font-black text-slate-400">
                $21.62 <span className="text-base font-semibold">to you</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li>~3.7% + $1.79 service fee per ticket</li>
                <li>Their branding on your event</li>
                <li>Your attendee list lives on their servers</li>
              </ul>
            </div>
            <div className="rounded-3xl border-2 border-fuchsia-300 bg-white p-8 shadow-lg">
              <h3 className="flex items-center gap-2 text-lg font-bold text-fuchsia-600">
                <Check className="h-5 w-5" /> EventHub
              </h3>
              <p className="mt-4 text-4xl font-black text-slate-900">
                $24.28 <span className="text-base font-semibold">to you</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>Only your own Stripe processing cost</li>
                <li>Your brand, your domain, your calendar</li>
                <li>You own the database and the attendee list</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Screenshot tour */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-black text-slate-900">Take the tour</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
          All 16 screenshots below are captured from this live deployment — not mockups.
        </p>
        {GROUPS.map((g) => {
          const items = SHOTS.filter((s) => s.group === g);
          return (
            <div key={g} className="mt-14">
              <h3 className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-600">{g}</h3>
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => (
                  <figure
                    key={s.title}
                    className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-xl"
                  >
                    <div className={`overflow-hidden bg-slate-50 ${s.tall ? "flex justify-center" : ""}`}>
                      <img
                        src={s.src}
                        alt={s.title}
                        loading="lazy"
                        className={`transition-transform duration-500 group-hover:scale-[1.03] ${s.tall ? "h-64 w-auto object-cover object-top" : "w-full"}`}
                      />
                    </div>
                    <figcaption className="border-t border-slate-100 p-4">
                      <h4 className="text-sm font-bold text-slate-900">{s.title}</h4>
                      <p className="mt-1 text-xs text-slate-500">{s.blurb}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* Features */}
      <section className="bg-gradient-to-b from-white to-amber-50/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-black text-slate-900">Everything included</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([icon, title, blurb]) => (
              <div key={title} className="rounded-3xl border border-slate-200 bg-white p-6">
                <div className="text-3xl">{icon}</div>
                <h3 className="mt-3 font-bold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm text-slate-500">{blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case study */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="overflow-hidden rounded-3xl bg-slate-900 p-10 text-white">
          <div className="text-xs font-bold uppercase tracking-widest text-fuchsia-300">Built with EventHub</div>
          <h2 className="mt-3 text-3xl font-black">Jacksonville, Florida community calendar</h2>
          <p className="mt-3 max-w-2xl text-white/70">
            A single coordinator workspace running real, upcoming events from Riverside Arts Market, the Florida
            Theatre, VyStar Veterans Memorial Arena, 121 Financial Ballpark, local tech meetups and civic groups —
            with a public submission queue open to the whole community.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <Stat value={stats ? String(stats.events) : "—"} label="Approved events live" />
            <Stat value={stats ? String(stats.categories) : "—"} label="Categories represented" />
            <Stat value="$0" label="Paid in platform fees" />
          </div>
          <Button asChild size="lg" className="mt-8 rounded-full bg-white text-slate-900 hover:bg-white/90">
            <Link to="/events">Explore the Jacksonville calendar</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-10 text-center text-xs text-slate-400">
        Made with ❤️ by EventHub ·{" "}
        <Link to="/events" className="underline">
          Live calendar
        </Link>{" "}
        ·{" "}
        <Link to="/submit-event" className="underline">
          Submit an event
        </Link>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-5">
      <div className="text-4xl font-black">{value}</div>
      <div className="mt-1 text-sm text-white/60">{label}</div>
    </div>
  );
}
