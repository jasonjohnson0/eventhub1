import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

// Same dead-link fix as /login -- /signin is the other common spelling and
// also 404'd. See src/routes/login.tsx for the reasoning.
const searchSchema = z.object({ next: z.string().optional(), redirect: z.string().optional() });

export const Route = createFileRoute("/signin")({
  validateSearch: (s) => searchSchema.parse(s),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/auth", search: { next: search.next ?? search.redirect } });
  },
});
