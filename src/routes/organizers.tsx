import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check, Calendar, Ticket, Megaphone, Users } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/organizers")({
  head: () => ({
    meta: [
      { title: "For Organizers — Run Your Own Calendar on EventHub" },
      {
        name: "description",
        content:
          "Run a branded, white-label event calendar for your community — RSVPs, ticketing, sponsorships and event submissions, built in.",
      },
    ],
  }),
  component: OrganizersPage,
});

const BENEFITS = [
  {
    icon: Calendar,
    title: "Your own branded calendar",
    body: "A public calendar with your name on it, not ours — the events, the look, and the community are yours.",
  },
  {
    icon: Users,
    title: "Community submissions",
    body: "Let your community propose events; you review and approve what goes live.",
  },
  {
    icon: Ticket,
    title: "Paid ticketing",
    body: "Sell tickets with Stripe checkout, automatic refunds on cancellation, and check-in tools at the door.",
  },
  {
    icon: Megaphone,
    title: "Sponsorships",
    body: "Sell sponsor slots on your event pages to cover your costs or turn a profit.",
  },
];

function OrganizersPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex-1">
        <section className="bg-gradient-to-b from-fuchsia-50 to-background px-6 py-20 text-center">
          <h1 className="mx-auto max-w-2xl text-4xl font-black tracking-tight text-slate-900">
            Run the calendar for your community
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Chambers of commerce, cities, venues, and hobby groups use EventHub to run their own
            branded event calendar — without building one from scratch.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/onboarding">Start your calendar</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/tour">See how it works</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-16">
          <div className="grid gap-8 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex gap-4">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-600">
                  <b.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{b.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{b.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-2xl px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900">What it costs</h2>
          <p className="mt-3 flex items-center gap-2 text-slate-600">
            <Check className="h-4 w-4 flex-none text-fuchsia-600" /> Running a calendar is free —
            you only pay your own Stripe processing cost on tickets you actually sell.
          </p>
          <p className="mt-4 text-sm text-slate-500">
            See the full fee breakdown on the{" "}
            <Link to="/tour" className="underline hover:text-slate-700">
              product tour
            </Link>
            .
          </p>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
