import { Loader2 } from "lucide-react";

export function NavigationPending() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-40 items-center justify-center gap-2 bg-background p-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
      Loading…
    </div>
  );
}