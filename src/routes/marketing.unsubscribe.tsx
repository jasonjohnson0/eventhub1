import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { unsubscribeFromMarketing } from "@/lib/marketing.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/marketing/unsubscribe")({
  validateSearch: z.object({ email: z.string().email(), token: z.string().min(10) }),
  component: UnsubscribePage,
  head: () => ({ meta: [{ title: "Unsubscribe — EventHub" }] }),
});

function UnsubscribePage() {
  const { email, token } = Route.useSearch();
  const [state, setState] = useState<
    { status: "loading" } | { status: "ok" } | { status: "err"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    unsubscribeFromMarketing({ data: { email, token } })
      .then(() => setState({ status: "ok" }))
      .catch((e) => setState({ status: "err", message: e instanceof Error ? e.message : "Failed" }));
  }, [email, token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Unsubscribe</CardTitle>
          <CardDescription>
            {state.status === "loading" && "Processing…"}
            {state.status === "ok" && "You've been unsubscribed."}
            {state.status === "err" && "We couldn't process this request."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {state.status === "ok" && (
            <p>
              <strong>{email}</strong> will no longer receive EventHub marketing emails.
            </p>
          )}
          {state.status === "err" && <p className="text-red-600">{state.message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}