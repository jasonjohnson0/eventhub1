import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

// /login 404'd -- the app's actual sign-in page is /auth. Old links,
// bookmarks and muscle memory from other apps still hit /login and /signin,
// so both redirect here rather than dead-ending. Any `next` (or `redirect`,
// the other common name for the same idea) query param is forwarded so a
// deep link still lands where it meant to after signing in.
const searchSchema = z.object({ next: z.string().optional(), redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  validateSearch: (s) => searchSchema.parse(s),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/auth", search: { next: search.next ?? search.redirect } });
  },
});
