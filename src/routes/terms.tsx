import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — EventHub" },
      { name: "description", content: "The terms that govern using EventHub." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="prose prose-sm mx-auto w-full max-w-2xl flex-1 px-6 py-16 text-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-muted-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted-foreground [&_li]:mt-1">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated October 2026.</p>

        <h2>Using EventHub</h2>
        <p>
          By creating an account, submitting an event, RSVPing, or buying a ticket on EventHub or
          any coordinator calendar running on it, you agree to these terms.
        </p>

        <h2>Accounts</h2>
        <p>
          You're responsible for the accuracy of the information you provide and for keeping your
          account credentials secure. You must be old enough in your jurisdiction to enter into
          this agreement.
        </p>

        <h2>Submitting and running events</h2>
        <ul>
          <li>You're responsible for the accuracy of any event you submit or publish.</li>
          <li>
            Submitted events are reviewed by a coordinator before they appear publicly; we can
            remove or reject any event or account that violates these terms or the law.
          </li>
          <li>
            Don't submit spam, fraudulent listings, or content that infringes someone else's
            rights.
          </li>
          <li>
            If you run a coordinator calendar, you're responsible for your own event listings,
            ticket pricing, and communications with your attendees.
          </li>
        </ul>

        <h2>Payments and tickets</h2>
        <p>
          Ticket payments are processed by Stripe under Stripe's own terms. EventHub and the
          relevant coordinator are responsible for fulfilling the event described; refund policy
          is set by the coordinator unless an event is cancelled or removed, in which case
          confirmed tickets are automatically refunded.
        </p>

        <h2>No warranty</h2>
        <p>
          EventHub is provided "as is." We work to keep it reliable, but we don't guarantee
          uninterrupted availability or that every listed event is accurate — always confirm
          details directly with the organizer for anything time-sensitive.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these terms as the platform changes. Continued use after an update means
          you accept the revised terms.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms:{" "}
          <a href="mailto:jasonjohnson0@gmail.com" className="text-primary underline">
            jasonjohnson0@gmail.com
          </a>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
