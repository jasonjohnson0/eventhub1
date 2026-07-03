import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { getMyRoles } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    try {
      const roles = await getMyRoles();
      if (!roles.includes("admin")) throw redirect({ to: "/dashboard" });
    } catch (e) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminLayout,
  head: () => ({ meta: [{ title: "Admin — EventHub" }] }),
});

const tabs: ReadonlyArray<{ title: string; to: string; exact?: boolean }> = [
  { title: "Overview", to: "/admin", exact: true },
  { title: "Moderation", to: "/admin/moderation" },
  { title: "Sponsorship", to: "/admin/sponsorship" },
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