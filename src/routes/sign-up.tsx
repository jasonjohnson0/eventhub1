import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

// /sign-up 404'd -- same dead-link problem as /login and /signin (see
// src/routes/login.tsx), just for the signup half of the flow. Redirects
// straight to the signup tab instead of making people click through from
// sign-in.
const searchSchema = z.object({ next: z.string().optional(), redirect: z.string().optional() });

export const Route = createFileRoute("/sign-up")({
  validateSearch: (s) => searchSchema.parse(s),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/auth", search: { next: search.next ?? search.redirect, mode: "signup" } });
  },
});
