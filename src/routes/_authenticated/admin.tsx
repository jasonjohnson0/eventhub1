import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin")({
  // The parent layout already looked up the signed-in user's roles; reuse it
  // instead of a second server round-trip. Every admin server function still
  // re-checks the admin role on the server.
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
  head: () => ({ meta: [{ title: "Admin — EventHub" }] }),
});

const tabs: ReadonlyArray<{ title: string; to: string; exact?: boolean }> = [
  { title: "Overview", to: "/admin", exact: true },
  { title: "Setup", to: "/admin/setup" },
  { title: "Moderation", to: "/admin/moderation" },
  { title: "Sponsorship", to: "/admin/sponsorship" },
  { title: "Billing", to: "/admin/billing" },
  { title: "Users", to: "/admin/users" },
  { title: "Audit Log", to: "/admin/audit" },
];

function AdminLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Site-wide overview, moderation, users, and revenue.
          </p>
        </div>
        <div className="mb-6 flex flex-wrap gap-1 border-b">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`border-b-2 px-3 py-2 text-sm ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t.title}
              </Link>
            );
          })}
        </div>
        <Outlet />
      </div>
    </div>
  );
}