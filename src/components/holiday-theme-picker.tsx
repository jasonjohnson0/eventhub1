import { Palette, Shuffle } from "lucide-react";
import { selectChristmasVariant, useChristmasVariant, useHolidayTheme } from "@/hooks/use-holiday-theme";
import {
  CHRISTMAS_VARIANT_ORDER,
  CHRISTMAS_VARIANTS,
  HOLIDAY_GROUP_ORDER,
  HOLIDAY_GROUPS,
  HOLIDAY_ORDER,
  HOLIDAY_THEMES,
  type HolidayId,
} from "@/lib/holiday-themes";
import { upcomingHolidays } from "@/lib/holiday-dates";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** How many "coming up" shortcuts sit at the top of the menu. */
const UPCOMING_COUNT = 3;

/**
 * A personal display preference, not a setting -- anyone can change it, it
 * only affects their own browser, and it never touches how an organizer's
 * own calendar looks to other visitors (that's `organizer-presets.ts`,
 * applied via the coordinator's own `primary_color`, entirely separate).
 *
 * Fixed position so it's reachable from every page without threading it
 * through every route's own header. With a few dozen themes, they're grouped
 * into submenus (Christian / National / Monthly / Seasonal), with the next
 * few by date as shortcuts at the top.
 */
export function HolidayThemePicker() {
  const [theme, setTheme] = useHolidayTheme();
  const christmasVariant = useChristmasVariant();
  const active = theme ? HOLIDAY_THEMES[theme] : null;

  const current = <span className="ml-auto pl-2 text-xs text-muted-foreground">Current</span>;

  // Plain render helpers rather than nested components, so a re-render never
  // remounts (and closes) an open submenu.
  function christmasSub(key: string) {
    const t = HOLIDAY_THEMES.christmas;
    return (
      <DropdownMenuSub key={key}>
        <DropdownMenuSubTrigger className="gap-2">
          <span className="w-5 text-center">{t.menuEmoji}</span>
          {t.label}
          {theme === "christmas" && current}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-48">
            {CHRISTMAS_VARIANT_ORDER.map((vId) => {
              const v = CHRISTMAS_VARIANTS[vId];
              return (
                <DropdownMenuItem key={vId} onClick={() => selectChristmasVariant(vId)} className="gap-2">
                  <span className="w-5 text-center">{v.menuEmoji}</span>
                  {v.label}
                  {theme === "christmas" && christmasVariant === vId && current}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuItem onClick={() => selectChristmasVariant("alternate")} className="gap-2">
              <span className="w-5 text-center">
                <Shuffle className="h-3.5 w-3.5" />
              </span>
              Alternate
              {theme === "christmas" && christmasVariant === "alternate" && current}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    );
  }

  function item(id: HolidayId, key: string = id) {
    if (id === "christmas") return christmasSub(key);
    const t = HOLIDAY_THEMES[id];
    return (
      <DropdownMenuItem key={key} onClick={() => setTheme(id)} className="gap-2">
        <span className="w-5 text-center">{t.menuEmoji}</span>
        {t.label}
        {theme === id && current}
      </DropdownMenuItem>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Choose a holiday theme"
            className="flex h-11 w-11 items-center justify-center rounded-full border bg-background text-lg shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl"
          >
            {active ? active.menuEmoji : <Palette className="h-5 w-5 text-muted-foreground" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-64">
          <DropdownMenuLabel>Holiday theme</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setTheme(null)} className="gap-2">
            <span className="w-5 text-center">✨</span>
            Default
            {!theme && current}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Coming up</DropdownMenuLabel>
          {/* Only rendered while the menu is open (client-side), so "today"
              is the visitor's own and never a server/client mismatch. */}
          {upcomingHolidays(
            new Date(),
            HOLIDAY_ORDER.filter((id) => id !== "autumn"),
          )
            .slice(0, UPCOMING_COUNT)
            .map((u) => item(u.id, `up-${u.id}`))}
          <DropdownMenuSeparator />
          {HOLIDAY_GROUPS.map((g) => (
            <DropdownMenuSub key={g.id}>
              <DropdownMenuSubTrigger className="gap-2">
                {g.label}
                {active?.group === g.id && current}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="max-h-[70vh] w-72 overflow-y-auto">
                  {HOLIDAY_GROUP_ORDER[g.id].map((id) => item(id))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
