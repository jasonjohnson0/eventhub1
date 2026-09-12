import { createFileRoute } from "@tanstack/react-router";
import { getPublicCoordinator } from "@/lib/coordinator.functions";
import { fetchEvents, addDays, startOfWeek, type CalendarEvent } from "@/queries/events";
import { supabase } from "@/integrations/supabase/client";
import { siteOrigin } from "@/lib/site-url";
import { findPresetByColor } from "@/lib/organizer-presets";

/**
 * A calendar as a self-contained HTML fragment, for embedding on a customer's
 * own website.
 *
 * Rendered here rather than in the browser so the markup lands in the HTML the
 * customer's server returns, which is what makes it indexable on their domain
 * and what keeps ad blockers from removing the sponsors. Every control is a
 * real link, so it works with JavaScript switched off and a crawler can walk
 * the whole calendar.
 */

type View = "month" | "week" | "list" | "agenda";
const VIEWS: View[] = ["month", "week", "list", "agenda"];

type Sponsor = {
  slot_id: string;
  event_id: string;
  event_title: string;
  business_name: string;
  logo_url: string | null;
  link_url: string | null;
  headline: string | null;
  body: string | null;
};

/** This string is interpolated into a page we do not control. Everything from
 *  the database goes through here, without exception. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The database constrains sponsor URLs to https, but event images and any
 *  future field are not covered by that, so attributes are re-checked here. */
function safeHttps(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function parseAnchor(on: string | null): Date {
  if (on && /^\d{4}-\d{2}-\d{2}$/.test(on)) {
    const d = new Date(`${on}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function anchor(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const fmtDay = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * Styles are inlined and every selector is scoped under .ehx, so the fragment
 * cannot restyle the page around it.
 *
 * Keeping the page from restyling *us* is the harder direction. A WordPress
 * theme that sets `div, a, p { color: red !important }` wins over ordinary
 * author styles no matter how specific they are, because !important outranks
 * specificity. Shadow DOM would settle it, but declarative shadow DOM is the
 * only server-side form and hiding the calendar inside one puts the
 * indexability this whole endpoint exists for at risk.
 *
 * So the fragment competes on the host's terms: a `all: revert !important`
 * reset scoped to .ehx and its descendants, then every declaration below also
 * marked important by `armour()`. Among !important declarations the more
 * specific selector wins, and `.ehx *` (0,1,0) outranks a bare `div` (0,0,1).
 *
 * A theme using `!important` with higher specificity than .ehx can still
 * interfere. That is inherent to a fragment rendered into markup we do not
 * control, and is the price of being indexable on the customer's domain.
 */
function armour(css: string): string {
  // Declarations end in ; or }. Selectors end in {, so they never match.
  return css.replace(/([^;{}]+:[^;{}]+?)(\s*[;}])/g, (_m, decl, end) =>
    decl.includes("!important") ? `${decl}${end}` : `${decl} !important${end}`,
  );
}

const STYLE = armour(`
.ehx,.ehx *,.ehx *::before,.ehx *::after{all:revert}
.ehx{--ehx-brand:#0f766e;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#18181b;font-size:15px;line-height:1.5;box-sizing:border-box}
.ehx *,.ehx *::before,.ehx *::after{box-sizing:border-box}
.ehx a{color:inherit;text-decoration:none}
.ehx-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:14px}
.ehx-views{display:flex;flex-wrap:wrap;gap:4px;background:#f4f4f5;padding:4px;border-radius:999px}
.ehx-views a{padding:5px 12px;border-radius:999px;font-size:13px;font-weight:600;color:#71717a}
.ehx-views a[aria-current="page"]{background:#fff;color:#18181b;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.ehx-nav{display:flex;align-items:center;gap:10px}
.ehx-nav a{border:1px solid #e4e4e7;border-radius:999px;padding:2px 10px;font-size:15px;line-height:1.6}
.ehx-period{font-weight:700}
.ehx-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid #e4e4e7;border-radius:12px;overflow:hidden}
.ehx-dow{background:#fafafa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#71717a;padding:8px 6px;text-align:center;border-bottom:1px solid #e4e4e7}
.ehx-cell{min-height:92px;padding:6px;border-right:1px solid #f4f4f5;border-bottom:1px solid #f4f4f5}
.ehx-cell:nth-child(7n){border-right:0}
.ehx-dim{background:#fcfcfc;color:#a1a1aa}
.ehx-daynum{font-size:12px;font-weight:600;color:#71717a}
.ehx-chip{display:block;max-width:100%;margin-top:4px;padding:3px 6px;border-radius:6px;background:#f4f4f5;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ehx-chip:hover{background:#e4e4e7}
.ehx-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.ehx-item{display:flex;gap:12px;border:1px solid #e4e4e7;border-radius:12px;padding:12px}
.ehx-when{min-width:96px;font-size:12px;font-weight:700;color:var(--ehx-brand);text-transform:uppercase}
.ehx-title{font-weight:650;margin:0 0 2px}
.ehx-meta{font-size:13px;color:#71717a;margin:0}
.ehx-empty{border:1px dashed #e4e4e7;border-radius:12px;padding:28px;text-align:center;color:#71717a}
.ehx-spons{margin-top:16px;border-top:1px solid #e4e4e7;padding-top:12px}
.ehx-spons-h{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#a1a1aa;margin:0 0 8px}
.ehx-ad{display:flex;gap:10px;align-items:center;border:1px solid #fde68a;background:#fffbeb;border-radius:10px;padding:10px;margin-bottom:8px}
.ehx-ad img{width:40px;height:40px;object-fit:contain;border-radius:8px;background:#fff}
.ehx-ad-name{font-size:12px;font-weight:700;color:#92400e}
.ehx-ad-head{font-weight:650}
.ehx-ad-body{font-size:13px;color:#52525b;margin:0}
.ehx-spons{position:relative}
.ehx-px{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:0}
.ehx-foot{margin-top:14px;text-align:center;font-size:11px;color:#a1a1aa}
@media(max-width:640px){.ehx-grid{grid-template-columns:minmax(0,1fr);border-radius:12px}.ehx-dow{display:none}.ehx-cell{min-height:0;border-right:0}.ehx-cell.ehx-dim{display:none}}
`);

function renderMonth(cursor: Date, events: CalendarEvent[], appUrl: string): string {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = anchor(new Date(e.start_time));
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .map((d) => `<div class="ehx-dow">${d}</div>`)
    .join("");

  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const inMonth = d.getMonth() === cursor.getMonth();
    const items = byDay.get(anchor(d)) ?? [];
    const chips = items
      .map(
        (e) =>
          `<a class="ehx-chip" href="${esc(appUrl)}/events/${esc(e.id)}" target="_blank" rel="noopener">${esc(e.title)}</a>`,
      )
      .join("");
    cells.push(
      `<div class="ehx-cell${inMonth ? "" : " ehx-dim"}"><div class="ehx-daynum">${d.getDate()}</div>${chips}</div>`,
    );
  }
  return `<div class="ehx-grid">${dows}${cells.join("")}</div>`;
}

function renderList(events: CalendarEvent[], appUrl: string): string {
  if (events.length === 0)
    return `<div class="ehx-empty">No events scheduled right now.</div>`;
  const items = events
    .map((e) => {
      const d = new Date(e.start_time);
      return `<li class="ehx-item">
        <div class="ehx-when">${esc(fmtDay(d))}<br>${esc(fmtTime(e.start_time))}</div>
        <div>
          <p class="ehx-title"><a href="${esc(appUrl)}/events/${esc(e.id)}" target="_blank" rel="noopener">${esc(e.title)}</a></p>
          ${e.location ? `<p class="ehx-meta">${esc(e.location)}</p>` : ""}
        </div>
      </li>`;
    })
    .join("");
  return `<ul class="ehx-list">${items}</ul>`;
}

/**
 * Sponsor ads, with their views and clicks counted.
 *
 * Both go through our own origin rather than being measured here, because this
 * fragment is served with s-maxage=300: counting at render time would count
 * once per cache fill and miss every visitor the CDN served in between. The
 * pixel and the click redirect are fetched per visitor, so they follow people
 * rather than caches.
 *
 * Neither needs JavaScript, so the fragment keeps working with scripts off and
 * the numbers survive whatever a customer's theme does to the page.
 */
function renderSponsors(sponsors: Sponsor[], appUrl: string): string {
  if (sponsors.length === 0) return "";
  const ads = sponsors
    .map((s) => {
      const logo = safeHttps(s.logo_url);
      const slot = encodeURIComponent(s.slot_id);
      // The destination is resolved from the slot at click time, so the URL
      // never carries it -- see api/ad.c.$slotId.ts. A link is only offered
      // when the advertiser actually supplied one.
      const link = safeHttps(s.link_url) ? `${appUrl}/api/ad/c/${slot}?s=embed` : null;
      // loading="lazy" is doing real work here: the browser fetches it when the
      // ad approaches the viewport, so a sponsor block nobody scrolled to does
      // not bill as a view. A smaller number an advertiser can verify against
      // their own analytics is worth more than a bigger one they cannot.
      const pixel = `<img class="ehx-px" src="${esc(appUrl)}/api/ad/i/${slot}?s=embed" alt="" width="1" height="1" loading="lazy" referrerpolicy="no-referrer" aria-hidden="true">`;
      const inner = `
        ${logo ? `<img src="${esc(logo)}" alt="${esc(s.business_name)} logo" loading="lazy" referrerpolicy="no-referrer">` : ""}
        <div>
          <div class="ehx-ad-name">${esc(s.business_name)}</div>
          ${s.headline ? `<div class="ehx-ad-head">${esc(s.headline)}</div>` : ""}
          ${s.body ? `<p class="ehx-ad-body">${esc(s.body)}</p>` : ""}
        </div>`;
      // rel="sponsored" discloses paid placement; without it these look like
      // editorial links on the customer's domain, which is their problem too.
      const card = link
        ? `<a class="ehx-ad" href="${esc(link)}" target="_blank" rel="noopener noreferrer sponsored">${inner}</a>`
        : `<div class="ehx-ad">${inner}</div>`;
      return `${card}${pixel}`;
    })
    .join("");
  return `<div class="ehx-spons"><p class="ehx-spons-h">Sponsors</p>${ads}</div>`;
}

function periodLabel(view: View, cursor: Date): string {
  if (view === "month") return cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  if (view === "week") {
    const s = startOfWeek(cursor);
    return `${fmtDay(s)} – ${fmtDay(addDays(s, 6))}`;
  }
  return "";
}

export const Route = createFileRoute("/api/embed/$slug")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const raw = url.searchParams.get("view");
        const view: View = (VIEWS as string[]).includes(raw ?? "") ? (raw as View) : "month";
        const cursor = parseAnchor(url.searchParams.get("on"));

        const coordinator = await getPublicCoordinator({ data: { slug: params.slug } });
        if (!coordinator) {
          return new Response(
            `<div class="ehx"><div class="ehx-empty">Calendar not found.</div></div>`,
            { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }

        const events = await fetchEvents({
          coordinator: coordinator.coordinator_id,
          limit: 400,
        });

        // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
        const { data: sponsorRows } = await (supabase as any).rpc(
          "get_public_coordinator_sponsors",
          { p_coordinator_id: coordinator.coordinator_id, p_limit: 4 },
        );
        const sponsors = (sponsorRows ?? []) as Sponsor[];

        const appUrl = siteOrigin() || url.origin.replace(/\/+$/, "");
        const self = `${appUrl}/api/embed/${encodeURIComponent(coordinator.slug)}`;
        const canonical = `${appUrl}/c/${encodeURIComponent(coordinator.slug)}`;

        // Scope what each view shows.
        let shown = events;
        if (view === "week") {
          const s = startOfWeek(cursor).getTime();
          const e = addDays(startOfWeek(cursor), 7).getTime();
          shown = events.filter((x) => {
            const t = +new Date(x.start_time);
            return t >= s && t < e;
          });
        } else if (view === "list" || view === "agenda") {
          const now = Date.now();
          shown = events.filter((x) => +new Date(x.end_time) >= now).slice(0, 25);
        }

        const link = (v: View, on?: string) => {
          const q = new URLSearchParams({ view: v });
          if (on) q.set("on", on);
          return `${self}?${q.toString()}`;
        };

        const tabs = VIEWS.map(
          (v) =>
            `<a href="${esc(link(v, url.searchParams.get("on") ?? undefined))}"${v === view ? ' aria-current="page"' : ""}>${v[0].toUpperCase()}${v.slice(1)}</a>`,
        ).join("");

        const label = periodLabel(view, cursor);
        const stepBack =
          view === "month"
            ? anchor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
            : anchor(addDays(cursor, -7));
        const stepFwd =
          view === "month"
            ? anchor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
            : anchor(addDays(cursor, 7));

        const nav = label
          ? `<div class="ehx-nav">
               <a href="${esc(link(view, stepBack))}" aria-label="Previous">&#8249;</a>
               <span class="ehx-period">${esc(label)}</span>
               <a href="${esc(link(view, stepFwd))}" aria-label="Next">&#8250;</a>
             </div>`
          : "";

        const bodyHtml =
          view === "month" ? renderMonth(cursor, events, appUrl) : renderList(shown, appUrl);

        const brand = /^#[0-9a-f]{3,8}$/i.test(coordinator.primary_color)
          ? coordinator.primary_color
          : "#0f766e";
        const preset = findPresetByColor(coordinator.primary_color);
        const badge = preset ? `${preset.emoji} ` : "";

        const html = `<style>${STYLE}</style>
<div class="ehx" style="--ehx-brand:${esc(brand)}">
  <div class="ehx-bar">
    <nav class="ehx-views" aria-label="Calendar views">${tabs}</nav>
    ${nav}
  </div>
  ${bodyHtml}
  ${renderSponsors(sponsors, appUrl)}
  <p class="ehx-foot"><a href="${esc(canonical)}" target="_blank" rel="noopener">${badge}${esc(coordinator.company_name || coordinator.slug)} calendar</a> &middot; powered by EventHub</p>
</div>`;

        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            // Short browser cache, longer shared cache, and a stale window so a
            // slow origin never blocks a customer's page render.
            "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
            // The fragment is meant to be fetched by other origins.
            "access-control-allow-origin": "*",
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});
