import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, PlusCircle, Users, Megaphone, Sparkles, Compass } from "lucide-react";
import { BillingStatusCard } from "@/components/billing-status-card";
import { SponsorPerformance } from "@/components/sponsor-performance";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — EventHub" }] }),
});

function Dashboard() {
  const { user, isAdmin, coordinatorState } = Route.useRouteContext();
  const name = user.email ? `, ${user.email.split("@")[0]}` : "";

  return (
    <div className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back{name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {coordinatorState === "complete"
              ? "Manage your calendar, staff, and sponsorship from one place."
              : coordinatorState === "pending"
                ? "Your calendar isn't live yet -- pick up where you left off."
                : "Browse what's happening, or start your own event calendar."}
          </p>
        </div>

        {coordinatorState === "complete" && (
          <>
            {/* Above the quick links: what a calendar costs and what its sponsors
                are getting are the two things a coordinator is actually running a
                business on. */}
            <BillingStatusCard />
            <SponsorPerformance />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <QuickCard
                title="Your calendar"
                desc="Month, week, and day views with drag-drop rescheduling."
                icon={<CalendarIcon className="h-5 w-5" />}
                action={<Link to="/calendar">Open calendar</Link>}
              />
              <QuickCard
                title="Create an event"
                desc="Publish an event visible on the public calendar in seconds."
                icon={<PlusCircle className="h-5 w-5" />}
                action={<Link to="/calendar">Go to calendar</Link>}
              />
              <QuickCard
                title="Workspace staff"
                desc="Invite staff by email to manage your events with you."
                icon={<Users className="h-5 w-5" />}
                action={<Link to="/settings">Manage staff</Link>}
              />
              {isAdmin && (
                <QuickCard
                  title="Admin overview"
                  desc="Moderation, users, audit log, and sponsorship revenue."
                  icon={<Megaphone className="h-5 w-5" />}
                  action={<Link to="/admin">Open admin</Link>}
                />
              )}
            </div>
          </>
        )}

        {coordinatorState === "pending" && (
          <>
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Finish setting up your calendar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  You've started, but your calendar isn't public yet -- it needs an address
                  before it can go live. Pick up right where you left off.
                </p>
                <Button asChild>
                  <Link to="/onboarding">Continue setup</Link>
                </Button>
              </CardContent>
            </Card>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <QuickCard
                title="Browse events"
                desc="See what's already on the public calendar while you finish setup."
                icon={<Compass className="h-5 w-5" />}
                action={<Link to="/events">Browse events</Link>}
              />
              {isAdmin && (
                <QuickCard
                  title="Admin overview"
                  desc="Moderation, users, audit log, and sponsorship revenue."
                  icon={<Megaphone className="h-5 w-5" />}
                  action={<Link to="/admin">Open admin</Link>}
                />
              )}
            </div>
          </>
        )}

        {coordinatorState === "none" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <QuickCard
              title="Browse events"
              desc="Find things happening near you and RSVP in a couple of clicks."
              icon={<Compass className="h-5 w-5" />}
              action={<Link to="/events">Browse events</Link>}
            />
            <QuickCard
              title="Run your own calendar"
              desc="Publish events, sell sponsorships, and embed your calendar anywhere."
              icon={<Sparkles className="h-5 w-5" />}
              action={<Link to="/onboarding">Set up a calendar</Link>}
            />
            {isAdmin && (
              <QuickCard
                title="Admin overview"
                desc="Moderation, users, audit log, and sponsorship revenue."
                icon={<Megaphone className="h-5 w-5" />}
                action={<Link to="/admin">Open admin</Link>}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickCard({
  title,
  desc,
  icon,
  action,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{desc}</p>
        <Button asChild size="sm" variant="secondary">
          {action}
        </Button>
      </CardContent>
    </Card>
  );
}
