import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

// Same dead-link fix as /login and /signin -- /sign-in (hyphenated) is a
// third common spelling and 404'd too. See src/routes/login.tsx for the
// reasoning.
const searchSchema = z.object({ next: z.string().optional(), redirect: z.string().optional() });

export const Route = createFileRoute("/sign-in")({
  validateSearch: (s) => searchSchema.parse(s),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/auth", search: { next: search.next ?? search.redirect } });
  },
});
