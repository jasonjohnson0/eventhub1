import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalIcon, MapPin, Loader2 } from "lucide-react";
import { searchEvents } from "@/lib/search.functions";
import { CATEGORIES, categoryLabel, categoryClasses } from "@/lib/categories";

type SearchParams = {
  q: string;
  category: string;
  startDate: string;
  endDate: string;
  near: string;
  radius: number;
};

function parseSearch(input: Record<string, unknown>): SearchParams {
  return {
    q: (input.q as string) ?? "",
    category: (input.category as string) ?? "",
    startDate: (input.startDate as string) ?? "",
    endDate: (input.endDate as string) ?? "",
    near: (input.near as string) ?? "",
    radius: Number(input.radius) || 0,
  };
}

export const Route = createFileRoute("/_authenticated/search")({
  component: SearchPage,
  validateSearch: parseSearch,
  head: () => ({ meta: [{ title: "Search — EventHub" }] }),
});

type Row = Awaited<ReturnType<typeof searchEvents>>[number];

function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(search.q);

  const cats = search.category ? search.category.split(",").filter(Boolean) : [];
  const near = search.near
    ? (search.near.split(",").map(Number) as [number, number])
    : null;

  useEffect(() => {
    setLoading(true);
    const payload = {
      query: search.q,
      categories: cats as never,
      startDate: search.startDate ? new Date(search.startDate).toISOString() : null,
      endDate: search.endDate ? new Date(search.endDate).toISOString() : null,
      latitude: near?.[0] ?? null,
      longitude: near?.[1] ?? null,
      radiusMiles: near ? search.radius || 25 : null,
    };
    searchEvents({ data: payload })
      .then((r) => setRows(r))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.q, search.category, search.startDate, search.endDate, search.near, search.radius]);

  function updateSearch(patch: Partial<SearchParams>) {
    navigate({ to: "/search", search: (prev: SearchParams) => ({ ...prev, ...patch }) });
  }

  function toggleCategory(cat: string) {
    const next = cats.includes(cat) ? cats.filter((c) => c !== cat) : [...cats, cat];
    updateSearch({ category: next.join(",") });
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      updateSearch({
        near: `${pos.coords.latitude},${pos.coords.longitude}`,
        radius: search.radius || 25,
      });
    });
  }

  const hasFilters = useMemo(
    () => Boolean(search.q || cats.length || search.startDate || search.endDate || near),
    [search, cats, near],
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-[280px_1fr]">
      <aside className="space-y-6">
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateSearch({ q });
            }}
          >
            <Input placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Category</h3>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const active = cats.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleCategory(c)}
                  className={`rounded-full border px-2.5 py-1 text-xs capitalize ${active ? categoryClasses(c) + " border-transparent" : "border-border text-muted-foreground hover:bg-muted"}`}
                >
                  {categoryLabel(c)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Date range</h3>
          <div className="space-y-2">
            <Input
              type="date"
              value={search.startDate}
              onChange={(e) => updateSearch({ startDate: e.target.value })}
            />
            <Input
              type="date"
              value={search.endDate}
              onChange={(e) => updateSearch({ endDate: e.target.value })}
            />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Distance</h3>
          <Button variant="outline" size="sm" className="w-full" onClick={useMyLocation}>
            <MapPin className="mr-1 h-3 w-3" /> Events near me
          </Button>
          {near && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>Radius</span>
                <span className="font-medium">{search.radius || 25} mi</span>
              </div>
              <Slider
                min={1}
                max={100}
                step={1}
                value={[search.radius || 25]}
                onValueChange={([v]) => updateSearch({ radius: v })}
              />
            </div>
          )}
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({ to: "/search", search: { q: "", category: "", startDate: "", endDate: "", near: "", radius: 0 } })
            }
          >
            Clear filters
          </Button>
        )}
      </aside>

      <main className="min-w-0 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Discover events</h1>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-sm text-muted-foreground">
          {rows.length} result{rows.length === 1 ? "" : "s"}
        </p>
        {rows.length === 0 && !loading && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No events found. Try broadening your search.
            </CardContent>
          </Card>
        )}
        <div className="space-y-2">
          {rows.map((ev) => (
            <Link
              key={ev.id}
              to="/events/$id"
              params={{ id: ev.id }}
              className="block rounded-lg border p-4 hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${categoryClasses(ev.category)}`}>
                      {categoryLabel(ev.category)}
                    </span>
                    <h3 className="truncate font-semibold">{ev.title}</h3>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalIcon className="h-3 w-3" />
                      {new Date(ev.start_time).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {ev.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {ev.location}
                      </span>
                    )}
                    {"distance_meters" in ev && ev.distance_meters != null && (
                      <span>{(ev.distance_meters / 1609.34).toFixed(1)} mi away</span>
                    )}
                  </div>
                  {ev.tags && ev.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ev.tags.slice(0, 5).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}