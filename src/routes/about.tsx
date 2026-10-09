import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — EventHub" },
      {
        name: "description",
        content: "Who runs EventHub and how to get in touch.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-bold text-foreground">About EventHub</h1>
        <p className="mt-4 text-muted-foreground">
          EventHub is a white-label event calendar platform: a single piece of software that any
          community organizer — a chamber of commerce, a city, a hobby group, a venue — can stand
          up as their own branded event calendar, with RSVPs, paid tickets, sponsorships and
          community event submissions built in.
        </p>
        <p className="mt-4 text-muted-foreground">
          Each calendar you see running on EventHub (including this one) is operated
          independently by its own coordinator — a local organizer who owns the events, the
          branding and the community it serves. EventHub itself is the underlying platform those
          coordinators run on.
        </p>
        <h2 className="mt-10 text-xl font-semibold text-foreground">Contact</h2>
        <p className="mt-2 text-muted-foreground">
          Questions about this calendar, a specific event, or the platform itself:{" "}
          <a href="mailto:jasonjohnson0@gmail.com" className="font-medium text-primary underline">
            jasonjohnson0@gmail.com
          </a>
        </p>
        <p className="mt-8 text-sm text-muted-foreground">
          See also{" "}
          <Link to="/organizers" className="underline hover:text-foreground">
            running your own calendar
          </Link>
          ,{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          , and{" "}
          <Link to="/terms" className="underline hover:text-foreground">
            Terms of Service
          </Link>
          .
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
