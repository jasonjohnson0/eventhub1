import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { inviteStaff, listStaff, revokeStaff } from "@/lib/workspace.functions";
import { bootstrapFirstAdmin } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { listMyEvents } from "@/lib/events.functions";
import { exportRsvpList, updateEventCapacity, getCapacityStatus } from "@/lib/attendee.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react";
import {
  getUserNotificationPrefs,
  updateNotificationPrefs,
} from "@/lib/communications.functions";
import { createOrGetIcalToken, rotateIcalToken } from "@/lib/distribution.functions";
import { Copy, RefreshCw, Calendar as CalendarIcon, Compass } from "lucide-react";
import { CoordinatorAnalyticsCard } from "@/components/coordinator-analytics-card";
import { VenueManager } from "@/components/venue-manager";
import { OrganizerManager } from "@/components/organizer-manager";
import { CustomFieldManager } from "@/components/custom-field-manager";
import { EmailLogTable } from "@/components/email-log-table";
import { Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  getCoordinatorProfile,
  saveCoordinatorProfile,
  deleteMyCalendar,
  checkSlugAvailable,
  updateCalendarSlug,
} from "@/lib/onboarding.functions";
import { AnnualPlanCard } from "@/components/annual-plan-card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, Globe } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings — EventHub" }] }),
});

type StaffRow = {
  id: string;
  invited_email: string;
  role: string;
  invited_at: string;
  accepted_at: string | null;
  staff_user_id: string | null;
};

type EventRow = Awaited<ReturnType<typeof listMyEvents>>[number] & {
  max_capacity?: number | null;
  has_waitlist?: boolean;
};

function SettingsPage() {
  const { coordinatorState } = Route.useRouteContext();
  const navigate = useNavigate();
  const [calendarSlug, setCalendarSlug] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [slugEditOpen, setSlugEditOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newSlugState, setNewSlugState] = useState<
    "idle" | "checking" | "ok" | "taken" | "invalid" | "error"
  >("idle");
  const [savingSlug, setSavingSlug] = useState(false);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [caps, setCaps] = useState<Record<string, { max: number | null; has_waitlist: boolean; going: number; waitlist: number }>>({});
  const [prefs, setPrefs] = useState<{
    email_reminders: boolean;
    push_reminders: boolean;
    days_before: number[];
  }>({ email_reminders: true, push_reminders: false, days_before: [1, 7] });
  const [icalToken, setIcalToken] = useState<string | null>(null);
  const [icalBusy, setIcalBusy] = useState(false);
  const [showNearby, setShowNearby] = useState(true);
  const [nearbyBusy, setNearbyBusy] = useState(false);

  const icalUrl = icalToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/ical/${icalToken}.ics`
    : null;

  async function showIcalUrl() {
    setIcalBusy(true);
    try {
      const { token } = await createOrGetIcalToken();
      setIcalToken(token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setIcalBusy(false);
    }
  }

  async function rotateToken() {
    if (!confirm("Rotating invalidates existing calendar subscriptions. Continue?")) return;
    setIcalBusy(true);
    try {
      const { token } = await rotateIcalToken();
      setIcalToken(token);
      toast.success("Token rotated — update your calendar subscription");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setIcalBusy(false);
    }
  }

  async function copyIcalUrl() {
    if (!icalUrl) return;
    await navigator.clipboard.writeText(icalUrl);
    toast.success("Feed URL copied");
  }

  async function reload() {
    try {
      const rows = await listStaff();
      setStaff(rows as StaffRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load staff");
    }
  }

  async function loadEvents() {
    try {
      const evs = (await listMyEvents()) as EventRow[];
      setEvents(evs);
      const entries = await Promise.all(
        evs.map(async (e) => {
          const s = await getCapacityStatus({ data: { event_id: e.id } });
          return [
            e.id,
            { max: s.max, has_waitlist: s.has_waitlist, going: s.current, waitlist: s.waitlist_count },
          ] as const;
        }),
      );
      setCaps(Object.fromEntries(entries));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load events");
    }
  }

  useEffect(() => {
    void reload();
    void loadEvents();
    void (async () => {
      try {
        const p = await getUserNotificationPrefs();
        setPrefs({
          email_reminders: p.email_reminders,
          push_reminders: p.push_reminders,
          days_before: p.days_before,
        });
      } catch {
        /* keep defaults */
      }
    })();
    void (async () => {
      try {
        const p = await getCoordinatorProfile();
        setShowNearby(p.show_nearby_events);
        setCalendarSlug(p.slug);
      } catch {
        /* keep default */
      }
    })();
  }, []);

  function openDeleteCalendar() {
    setDeleteConfirmText("");
    setDeleteOpen(true);
  }

  async function confirmDeleteCalendar() {
    if (!calendarSlug) return;
    setDeleting(true);
    try {
      await deleteMyCalendar({ data: { confirm_slug: deleteConfirmText.trim() } });
      toast.success("Calendar deleted");
      setDeleteOpen(false);
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete calendar");
    } finally {
      setDeleting(false);
    }
  }

  function openSlugEdit() {
    setNewSlug("");
    setNewSlugState("idle");
    setSlugEditOpen(true);
  }

  // Live availability check as the new address is typed, same pattern (and
  // same is_slug_available RPC, via checkSlugAvailable) as onboarding's own
  // Address step -- it already excludes the caller's current slug, so typing
  // your own unchanged address doesn't falsely read as "taken".
  useEffect(() => {
    if (!slugEditOpen) return;
    if (!newSlug) return setNewSlugState("idle");
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(newSlug)) return setNewSlugState("invalid");
    if (newSlug === calendarSlug) return setNewSlugState("invalid");
    setNewSlugState("checking");
    const t = setTimeout(async () => {
      try {
        const { available } = await checkSlugAvailable({ data: { slug: newSlug } });
        setNewSlugState(available ? "ok" : "taken");
      } catch {
        setNewSlugState("error");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [newSlug, slugEditOpen, calendarSlug]);

  async function confirmSlugEdit() {
    if (newSlugState !== "ok") return;
    setSavingSlug(true);
    try {
      const { slug } = await updateCalendarSlug({ data: { new_slug: newSlug } });
      setCalendarSlug(slug);
      toast.success(`Calendar address changed to ${slug}.lovable.app`);
      setSlugEditOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the address");
    } finally {
      setSavingSlug(false);
    }
  }

  async function toggleShowNearby(v: boolean) {
    setNearbyBusy(true);
    setShowNearby(v);
    try {
      await saveCoordinatorProfile({ data: { show_nearby_events: v } });
      toast.success(v ? "Now showing nearby events" : "Nearby events hidden from your calendar");
    } catch (e) {
      setShowNearby(!v);
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setNearbyBusy(false);
    }
  }

  function toggleDay(d: number) {
    setPrefs((p) => ({
      ...p,
      days_before: p.days_before.includes(d)
        ? p.days_before.filter((x) => x !== d)
        : [...p.days_before, d].sort((a, b) => a - b),
    }));
  }

  async function savePrefs() {
    try {
      await updateNotificationPrefs({ data: prefs });
      toast.success("Notification preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function saveCapacity(eventId: string, maxStr: string, hasWaitlist: boolean) {
    const max = maxStr.trim() === "" ? null : Math.max(1, parseInt(maxStr, 10) || 0) || null;
    try {
      await updateEventCapacity({
        data: { event_id: eventId, max_capacity: max, has_waitlist: hasWaitlist },
      });
      toast.success("Capacity updated");
      await loadEvents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function downloadCsv(eventId: string) {
    try {
      const { filename, csv } = await exportRsvpList({ data: { event_id: eventId } });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await inviteStaff({ data: { email, role: "staff" } });
      await navigator.clipboard.writeText(`${window.location.origin}${res.invite_url}`).catch(() => {});
      toast.success("Invite link copied to clipboard");
      setEmail("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspace staff, billing, and admin bootstrapping.
          </p>
        </div>

        <AnnualPlanCard />
        <CoordinatorAnalyticsCard />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Compass className="h-4 w-4" /> Discovery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex items-start gap-3">
              <Switch checked={showNearby} onCheckedChange={toggleShowNearby} disabled={nearbyBusy} />
              <span>
                <span className="block text-sm font-medium">
                  Show other nearby community events on my calendar
                </span>
                <span className="block text-xs text-muted-foreground">
                  Helps visitors discover more happening nearby, and helps other
                  organizers' calendars show yours too.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>

        <VenueManager />
        <OrganizerManager />
        <CustomFieldManager />

        <Card>
          <CardHeader>
            <CardTitle>Invite workspace staff</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="staff-email">Staff email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@company.com"
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? "Sending…" : "Invite"}
              </Button>
            </form>

            <div className="mt-6 divide-y rounded-md border">
              {staff.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No staff invited yet.</p>
              )}
              {staff.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{s.invited_email}</div>
                    <div className="text-xs text-muted-foreground">
                      Invited {new Date(s.invited_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.accepted_at ? "default" : "secondary"}>
                      {s.accepted_at ? "Active" : "Pending"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await revokeStaff({ data: { id: s.id } });
                        await reload();
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin bootstrap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Promotes the current user to admin — works only if no admin exists yet.
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await bootstrapFirstAdmin();
                  toast.success("You are now the admin. Reloading…");
                  setTimeout(() => window.location.reload(), 800);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Bootstrap failed");
                }
              }}
            >
              Claim admin
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event capacity & RSVP export</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            )}
            <div className="divide-y rounded-md border">
              {events.map((e) => (
                <EventCapacityRow
                  key={e.id}
                  event={e}
                  status={caps[e.id]}
                  onSave={(m, w) => saveCapacity(e.id, m, w)}
                  onExport={() => downloadCsv(e.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={prefs.email_reminders}
                onCheckedChange={(v) =>
                  setPrefs((p) => ({ ...p, email_reminders: Boolean(v) }))
                }
              />
              Email reminders before events
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={prefs.push_reminders}
                onCheckedChange={(v) =>
                  setPrefs((p) => ({ ...p, push_reminders: Boolean(v) }))
                }
              />
              Push reminders (coming soon)
            </label>
            <div>
              <div className="mb-2 text-sm font-medium">Remind me before</div>
              <div className="flex flex-wrap gap-3 text-sm">
                {[1, 3, 7, 14].map((d) => (
                  <label key={d} className="flex items-center gap-1">
                    <Checkbox
                      checked={prefs.days_before.includes(d)}
                      onCheckedChange={() => toggleDay(d)}
                    />
                    {d} day{d === 1 ? "" : "s"}
                  </label>
                ))}
              </div>
            </div>
            <Button size="sm" onClick={savePrefs}>
              Save preferences
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> Email log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmailLogTable />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> iCal subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Subscribe to your coordinator calendar in Google Calendar, Apple Calendar, or
              Outlook. The URL is private — anyone with it can view your approved events.
            </p>
            {!icalUrl ? (
              <Button size="sm" onClick={showIcalUrl} disabled={icalBusy}>
                Subscribe to my calendar
              </Button>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={icalUrl} className="font-mono text-xs" />
                  <Button size="sm" variant="outline" onClick={copyIcalUrl}>
                    <Copy className="mr-1 h-4 w-4" /> Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={rotateToken} disabled={icalBusy}>
                    <RefreshCw className="mr-1 h-4 w-4" /> Rotate
                  </Button>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  <li><strong>Google Calendar</strong>: Other calendars → From URL → paste</li>
                  <li><strong>Apple Calendar</strong>: File → New Calendar Subscription → paste</li>
                  <li><strong>Outlook</strong>: Add calendar → Subscribe from web → paste</li>
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        {coordinatorState === "complete" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4" /> Calendar address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Your calendar is at{" "}
                  <span className="font-mono font-medium text-foreground">
                    {calendarSlug ? `${calendarSlug}.lovable.app` : "—"}
                  </span>
                  . Changing it frees the old address immediately for anyone else to claim, and
                  breaks any link, QR code or embed still pointing at it.
                </p>
                <Button variant="outline" onClick={openSlugEdit} className="shrink-0">
                  Change address
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {coordinatorState === "complete" && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" /> Danger zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Permanently delete this calendar — every event, venue, organizer, series,
                  billing record and pending submission. Your account and sign-in are not
                  affected; only the calendar itself goes away and its address is released.
                </p>
                <Button variant="destructive" onClick={openDeleteCalendar} className="shrink-0">
                  Delete my calendar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {calendarSlug ? `${calendarSlug}.lovable.app` : "this calendar"}?</DialogTitle>
            <DialogDescription>
              This permanently deletes every event, venue, organizer, series, billing record and
              pending submission on this calendar, and releases its address for anyone to claim.
              This cannot be undone. Your account and sign-in are not affected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono font-semibold">{calendarSlug}</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteCalendar}
              disabled={deleting || deleteConfirmText.trim() !== calendarSlug}
            >
              {deleting ? "Deleting…" : "Delete calendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={slugEditOpen} onOpenChange={(o) => !savingSlug && setSlugEditOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change calendar address</DialogTitle>
            <DialogDescription>
              {calendarSlug ? `${calendarSlug}.lovable.app` : "Your current address"} will stop
              working the moment you confirm — anyone with the old link, QR code or embed will
              need the new one. Everything else on the calendar stays exactly as it is.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-slug">New address</Label>
            <div className="flex items-center gap-2">
              <Input
                id="new-slug"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase().trim())}
                autoComplete="off"
                placeholder="my-community"
              />
              <span className="whitespace-nowrap text-sm text-muted-foreground">.lovable.app</span>
            </div>
            <div className="text-sm">
              {newSlugState === "checking" && <span className="text-muted-foreground">Checking…</span>}
              {newSlugState === "ok" && <span className="text-primary">✅ {newSlug} is available</span>}
              {newSlugState === "taken" && <span className="text-destructive">Already taken</span>}
              {newSlugState === "invalid" && (
                <span className="text-destructive">
                  {newSlug === calendarSlug
                    ? "That's already your current address"
                    : "3–40 characters, lowercase letters, numbers and hyphens"}
                </span>
              )}
              {newSlugState === "error" && (
                <span className="text-destructive">Could not check availability. Try again in a moment.</span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlugEditOpen(false)} disabled={savingSlug}>
              Cancel
            </Button>
            <Button onClick={confirmSlugEdit} disabled={savingSlug || newSlugState !== "ok"}>
              {savingSlug ? "Saving…" : "Change address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventCapacityRow({
  event,
  status,
  onSave,
  onExport,
}: {
  event: EventRow;
  status?: { max: number | null; has_waitlist: boolean; going: number; waitlist: number };
  onSave: (max: string, waitlist: boolean) => void | Promise<void>;
  onExport: () => void;
}) {
  const [maxStr, setMaxStr] = useState<string>(status?.max?.toString() ?? "");
  const [waitlist, setWaitlist] = useState<boolean>(status?.has_waitlist ?? false);
  useEffect(() => {
    setMaxStr(status?.max?.toString() ?? "");
    setWaitlist(status?.has_waitlist ?? false);
  }, [status?.max, status?.has_waitlist]);

  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{event.title}</div>
        <div className="text-xs text-muted-foreground">
          {new Date(event.start_time).toLocaleDateString()}{" "}
          {status && `· ${status.going} going${status.waitlist ? ` · ${status.waitlist} waitlisted` : ""}`}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={1}
          placeholder="No limit"
          value={maxStr}
          onChange={(e) => setMaxStr(e.target.value)}
          className="h-9 w-28"
        />
        <label className="flex items-center gap-1 text-xs">
          <Checkbox
            checked={waitlist}
            onCheckedChange={(v) => setWaitlist(Boolean(v))}
          />
          Waitlist
        </label>
        <Button size="sm" variant="outline" onClick={() => onSave(maxStr, waitlist)}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onExport}>
          <Download className="mr-1 h-4 w-4" /> CSV
        </Button>
      </div>
    </div>
  );
}