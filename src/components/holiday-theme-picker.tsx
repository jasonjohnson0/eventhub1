import { Palette, Shuffle } from "lucide-react";
import { selectChristmasVariant, useChristmasVariant, useHolidayTheme } from "@/hooks/use-holiday-theme";
import {
  CHRISTMAS_VARIANT_ORDER,
  CHRISTMAS_VARIANTS,
  HOLIDAY_ORDER,
  HOLIDAY_THEMES,
} from "@/lib/holiday-themes";
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

/**
 * A personal display preference, not a setting -- anyone can change it, it
 * only affects their own browser, and it never touches how an organizer's
 * own calendar looks to other visitors (that's `organizer-presets.ts`,
 * applied via the coordinator's own `primary_color`, entirely separate).
 *
 * Fixed position so it's reachable from every page without threading it
 * through every route's own header.
 */
export function HolidayThemePicker() {
  const [theme, setTheme] = useHolidayTheme();
  const christmasVariant = useChristmasVariant();
  const active = theme ? HOLIDAY_THEMES[theme] : null;

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
        <DropdownMenuContent align="end" side="top" className="w-56">
          <DropdownMenuLabel>Holiday theme</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setTheme(null)} className="gap-2">
            <span className="w-5 text-center">✨</span>
            Default
            {!theme && <span className="ml-auto text-xs text-muted-foreground">Current</span>}
          </DropdownMenuItem>
          {HOLIDAY_ORDER.map((id) => {
            const t = HOLIDAY_THEMES[id];
            if (id === "christmas") {
              return (
                <DropdownMenuSub key={id}>
                  <DropdownMenuSubTrigger className="gap-2">
                    <span className="w-5 text-center">{t.menuEmoji}</span>
                    {t.label}
                    {theme === "christmas" && (
                      <span className="ml-auto text-xs text-muted-foreground">Current</span>
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-48">
                      {CHRISTMAS_VARIANT_ORDER.map((vId) => {
                        const v = CHRISTMAS_VARIANTS[vId];
                        return (
                          <DropdownMenuItem
                            key={vId}
                            onClick={() => selectChristmasVariant(vId)}
                            className="gap-2"
                          >
                            <span className="w-5 text-center">{v.menuEmoji}</span>
                            {v.label}
                            {theme === "christmas" && christmasVariant === vId && (
                              <span className="ml-auto text-xs text-muted-foreground">Current</span>
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuItem
                        onClick={() => selectChristmasVariant("alternate")}
                        className="gap-2"
                      >
                        <span className="w-5 text-center">
                          <Shuffle className="h-3.5 w-3.5" />
                        </span>
                        Alternate
                        {theme === "christmas" && christmasVariant === "alternate" && (
                          <span className="ml-auto text-xs text-muted-foreground">Current</span>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              );
            }
            return (
              <DropdownMenuItem key={id} onClick={() => setTheme(id)} className="gap-2">
                <span className="w-5 text-center">{t.menuEmoji}</span>
                {t.label}
                {theme === id && <span className="ml-auto text-xs text-muted-foreground">Current</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
