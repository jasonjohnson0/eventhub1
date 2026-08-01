import { Link, useRouterState } from "@tanstack/react-router";
import {
  Calendar as CalendarIcon,
  Home,
  LayoutDashboard,
  Megaphone,
  Shield,
  Users,
  ScrollText,
  Settings,
  Search,
  Map as MapIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { getCategoryCounts } from "@/lib/search.functions";
import { CATEGORIES, categoryLabel, categoryClasses } from "@/lib/categories";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const main = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Calendar", url: "/calendar", icon: CalendarIcon },
  { title: "Search", url: "/search", icon: Search },
  { title: "Map", url: "/map", icon: MapIcon },
  { title: "Submissions", url: "/submissions", icon: Inbox },
  { title: "Settings", url: "/settings", icon: Settings },
];

const admin = [
  { title: "Overview", url: "/admin", icon: LayoutDashboard, exact: true },
  { title: "Moderation", url: "/admin/moderation", icon: Shield },
  { title: "Sponsorship", url: "/admin/sponsorship", icon: Megaphone },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Audit Log", url: "/admin/audit", icon: ScrollText },
];

export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    getCategoryCounts().then(setCounts).catch(() => undefined);
  }, []);
  const isActive = (url: string, exact?: boolean) =>
    exact ? currentPath === url : currentPath === url || currentPath.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pt-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-fuchsia-500 to-violet-500" />
          {!collapsed && <span>EventHub</span>}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {!collapsed && (
          <div className="space-y-3 px-3 pb-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                navigate({ to: "/search", search: { q, category: "", startDate: "", endDate: "", near: "", radius: 0 } });
              }}
            >
              <Input
                placeholder="Search events…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-8 text-xs"
              />
            </form>
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Categories
              </div>
              <div className="flex flex-wrap gap-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() =>
                      navigate({
                        to: "/search",
                        search: { q: "", category: c, startDate: "", endDate: "", near: "", radius: 0 },
                      })
                    }
                    className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${categoryClasses(c)}`}
                  >
                    {categoryLabel(c)} {counts[c] ? `· ${counts[c]}` : ""}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {admin.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url, item.exact)}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-3">
        {!collapsed && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
          >
            Sign out
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}