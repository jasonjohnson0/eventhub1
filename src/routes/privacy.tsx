import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — EventHub" },
      { name: "description", content: "How EventHub collects, stores and uses your data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="prose prose-sm mx-auto w-full max-w-2xl flex-1 px-6 py-16 text-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-muted-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted-foreground [&_li]:mt-1">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated October 2026.</p>

        <h2>What this covers</h2>
        <p>
          This policy covers EventHub, the platform, and every coordinator calendar running on it
          (including this one). Each coordinator owns the events and attendee interactions on
          their own calendar; EventHub operates the shared infrastructure underneath.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account data:</strong> email address and, if you sign up with Google or
            Apple, the name and email they share with us. Authentication is handled by Supabase
            Auth.
          </li>
          <li>
            <strong>Event activity:</strong> RSVPs, waitlist entries, and any event you submit
            for review (title, date, venue, description, and an optional image).
          </li>
          <li>
            <strong>Payments:</strong> if you buy a ticket, payment is processed directly by
            Stripe — we never see or store your card number. We keep a record of the purchase
            (amount, event, buyer name/email) to confirm your ticket and handle refunds.
          </li>
          <li>
            <strong>Newsletter:</strong> if you subscribe to a coordinator's email list, your
            email is stored with a double opt-in confirmation and an unsubscribe link in every
            message.
          </li>
          <li>
            <strong>Usage data:</strong> basic request logs (IP address, user agent) kept by our
            hosting provider (Vercel) and database provider (Supabase) for security and abuse
            prevention.
          </li>
        </ul>

        <h2>What we don't do</h2>
        <ul>
          <li>We don't sell your data to third parties.</li>
          <li>We don't share your email with other coordinators beyond the calendar you interacted with.</li>
          <li>We don't run third-party ad-tracking pixels on attendee-facing pages.</li>
        </ul>

        <h2>Who can see what</h2>
        <p>
          A coordinator can see the RSVPs, ticket purchases and submissions made to their own
          calendar. Platform administrators can access account and event data to operate, debug
          and moderate the platform. Event submissions and RSVPs are never shared across
          coordinators.
        </p>

        <h2>Your choices</h2>
        <p>
          You can unsubscribe from any newsletter at any time via the link in the email. You can
          ask us to delete your account and associated data by contacting us below — we'll remove
          what we can while keeping the minimum records required for completed payments (for tax
          and fraud-prevention purposes).
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy or your data:{" "}
          <a href="mailto:jasonjohnson0@gmail.com" className="text-primary underline">
            jasonjohnson0@gmail.com
          </a>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
