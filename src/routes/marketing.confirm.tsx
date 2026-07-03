import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { confirmMarketingSubscription } from "@/lib/marketing.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/marketing/confirm")({
  validateSearch: z.object({ token: z.string().min(10) }),
  component: ConfirmPage,
  head: () => ({ meta: [{ title: "Confirm your subscription — EventHub" }] }),
});

function ConfirmPage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<
    { status: "loading" } | { status: "ok"; email: string } | { status: "err"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    confirmMarketingSubscription({ data: { token } })
      .then((r) => setState({ status: "ok", email: r.email }))
      .catch((e) => setState({ status: "err", message: e instanceof Error ? e.message : "Failed" }));
  }, [token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Marketing subscription</CardTitle>
          <CardDescription>
            {state.status === "loading" && "Confirming your subscription…"}
            {state.status === "ok" && "You're in! 🎉"}
            {state.status === "err" && "We couldn't confirm this link."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {state.status === "ok" && (
            <p>
              Thanks for confirming. <strong>{state.email}</strong> will now receive EventHub
              updates.
            </p>
          )}
          {state.status === "err" && <p className="text-red-600">{state.message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}