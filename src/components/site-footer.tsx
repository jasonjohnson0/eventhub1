import { Link } from "@tanstack/react-router";

/** The one footer for every public/marketing page -- replaces the old
 *  double "Made with EventHub / Built with EventHub" credit in events.tsx
 *  with a single credit plus the links an audit flagged as missing
 *  (About/Contact/Privacy/Terms/Submit an event). */
export function SiteFooter() {
  return (
    <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link to="/about" className="underline hover:text-slate-600">
          About
        </Link>
        <a href="mailto:jasonjohnson0@gmail.com" className="underline hover:text-slate-600">
          Contact
        </a>
        <Link to="/organizers" className="underline hover:text-slate-600">
          For organizers
        </Link>
        <Link to="/submit-event" className="underline hover:text-slate-600">
          Submit an event
        </Link>
        <Link to="/privacy" className="underline hover:text-slate-600">
          Privacy
        </Link>
        <Link to="/terms" className="underline hover:text-slate-600">
          Terms
        </Link>
      </nav>
      <p className="mt-3">
        Made with ❤️ by{" "}
        <Link to="/tour" className="underline hover:text-slate-600">
          EventHub
        </Link>
      </p>
    </footer>
  );
}
