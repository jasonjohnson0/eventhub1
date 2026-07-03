import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, PlusCircle, Users, Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — EventHub" }] }),
});

function Dashboard() {
  const { user, isAdmin } = Route.useRouteContext();
  return (
    <div className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back{user.email ? `, ${user.email.split("@")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your calendar, staff, and sponsorship from one place.
          </p>
        </div>

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