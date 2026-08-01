import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/coordinator/submissions")({
  beforeLoad: () => {
    throw redirect({ to: "/submissions" });
  },
});
