import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Camera, CheckCircle2 } from "lucide-react";
import { checkInViaQr, getEventAnalytics } from "@/lib/monetization.functions";

export const Route = createFileRoute("/_authenticated/events/$id/checkin-mobile")({
  component: MobileCheckin,
  head: () => ({ meta: [{ title: "Mobile Check-in — EventHub" }] }),
});

function MobileCheckin() {
  const { id } = Route.useParams();
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);
  const [counts, setCounts] = useState<{ checked_in: number; going: number } | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  async function refreshCounts() {
    try {
      const res = await getEventAnalytics({ data: { event_id: id } });
      setCounts({ checked_in: res.analytics.check_ins, going: res.analytics.rsvp_going });
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    void refreshCounts();
    return () => {
      scannerRef.current?.stop().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submitToken(token: string) {
    const trimmed = token.trim();
    if (!trimmed || seenRef.current.has(trimmed)) return;
    seenRef.current.add(trimmed);
    try {
      const res = await checkInViaQr({ data: { qr_token: trimmed } });
      toast.success(`Checked in ${res.ticket_name} (${res.check_in_count}/${res.quantity})`);
      void refreshCounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed");
      seenRef.current.delete(trimmed);
    }
  }

  async function startScanning() {
    setScanning(true);
    try {
      const mod = await import("html5-qrcode");
      const scanner = new mod.Html5Qrcode("qr-reader");
      scannerRef.current = { stop: () => scanner.stop().then(() => scanner.clear()) };
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => { void submitToken(decoded); },
        () => undefined,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Camera unavailable");
      setScanning(false);
    }
  }

  async function stopScanning() {
    await scannerRef.current?.stop().catch(() => undefined);
    scannerRef.current = null;
    setScanning(false);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Mobile check-in</h1>
        <Button asChild size="sm" variant="ghost">
          <Link to="/events/$id" params={{ id }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
      </div>
      {counts && (
        <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="font-semibold">{counts.checked_in}/{counts.going} checked in</span>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4" /> Scan QR code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div id="qr-reader" className="min-h-[240px] overflow-hidden rounded-md border bg-muted" />
          {!scanning ? (
            <Button className="w-full" onClick={startScanning}>Start camera</Button>
          ) : (
            <Button className="w-full" variant="outline" onClick={stopScanning}>Stop camera</Button>
          )}
          <p className="text-xs text-muted-foreground">Point camera at attendee's ticket QR.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Manual entry</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Paste ticket token" value={manual} onChange={(e) => setManual(e.target.value)} />
          <Button onClick={() => { void submitToken(manual); setManual(""); }}>Check in</Button>
        </CardContent>
      </Card>
    </div>
  );
}