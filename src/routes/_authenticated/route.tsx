import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");

    // Nothing in the account model marks someone as "an attendee" -- signup
    // has no such flag -- so this is the closest real signal: has this person
    // ever started (or been invited into) running a calendar. It gates the
    // coordinator-only nav and dashboard content. Read-only lookups only;
    // getCoordinatorProfile() would create a row as a side effect and is not
    // safe to call just to check whether one exists.
    const [{ data: profile }, { data: staffRow }] = await Promise.all([
      supabase
        .from("coordinator_profiles")
        .select("setup_completed_at")
        .eq("coordinator_id", data.user.id)
        .maybeSingle(),
      supabase
        .from("workspace_staff")
        .select("id")
        .eq("staff_user_id", data.user.id)
        .not("accepted_at", "is", null)
        .limit(1)
        .maybeSingle(),
    ]);
    const coordinatorState: "none" | "pending" | "complete" = staffRow
      ? "complete"
      : profile
        ? profile.setup_completed_at
          ? "complete"
          : "pending"
        : "none";

    return { user: data.user, isAdmin, coordinatorState };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { isAdmin, coordinatorState } = Route.useRouteContext();
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar isAdmin={isAdmin} coordinatorState={coordinatorState} />
        <div className="flex flex-1 flex-col">
          <header className="flex h-12 items-center border-b bg-background/95 px-2 backdrop-blur">
            <SidebarTrigger />
          </header>
          <main className="flex-1 bg-muted/30">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}