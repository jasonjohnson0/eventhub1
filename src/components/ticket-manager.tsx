import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Ticket, Trash2, QrCode } from "lucide-react";
import {
  createTicketTier,
  deleteTicketTier,
  listMyPurchases,
  listTicketTiers,
  purchaseTicket,
  createTicketCheckout,
  generateQrCode,
} from "@/lib/monetization.functions";

type Tier = Awaited<ReturnType<typeof listTicketTiers>>[number];
type Purchase = Awaited<ReturnType<typeof listMyPurchases>>[number];

function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

export function TicketManager({
  eventId,
  isCoordinator,
}: {
  eventId: string;
  isCoordinator: boolean;
}) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [qrPurchase, setQrPurchase] = useState<{ image_url: string; token: string; quantity: number; check_in_count: number } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([
        listTicketTiers({ data: { event_id: eventId } }),
        listMyPurchases({ data: { event_id: eventId } }),
      ]);
      setTiers(t);
      setPurchases(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createTicketTier({
        data: {
          event_id: eventId,
          name,
          price_cents: Math.round(Number(price) * 100),
          quantity_available: Number(qty),
        },
      });
      toast.success("Ticket tier created");
      setName("");
      setPrice("");
      setQty("");
      setShowForm(false);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function buy(tier: Tier) {
    try {
      // A tier is only ever definitely free with no active early-bird window
      // -- anything else (a nonzero price, or an early-bird tier that could
      // currently be $0) goes through real checkout; the server is the
      // actual authority on which price applies right now either way.
      if (tier.price_cents === 0 && !tier.early_bird) {
        const res = await purchaseTicket({ data: { ticket_id: tier.id, quantity: 1 } });
        if (res.checkout_url) {
          window.location.href = res.checkout_url;
          return;
        }
        toast.success("You're confirmed — see your ticket below");
        void refresh();
        return;
      }
      const res = await createTicketCheckout({ data: { ticket_id: tier.id, quantity: 1 } });
      window.location.href = res.checkout_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this ticket tier?")) return;
    try {
      await deleteTicketTier({ data: { ticket_id: id } });
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function showQr(p: Purchase) {
    try {
      const res = await generateQrCode({ data: { purchase_id: p.id } });
      setQrPurchase(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading) return null;
  if (!isCoordinator && tiers.length === 0 && purchases.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="h-4 w-4" /> Ticket options
        </CardTitle>
        {isCoordinator && (
          <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add tier"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && isCoordinator && (
          <form onSubmit={create} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_100px_100px_auto]">
            <div>
              <Label htmlFor="tk-name" className="text-xs">Name</Label>
              <Input id="tk-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard" />
            </div>
            <div>
              <Label htmlFor="tk-price" className="text-xs">Price ($)</Label>
              <Input id="tk-price" required type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tk-qty" className="text-xs">Qty</Label>
              <Input id="tk-qty" required type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit" size="sm">Add</Button>
            </div>
          </form>
        )}
        {tiers.length === 0 && <p className="text-sm text-muted-foreground">No paid tickets configured.</p>}
        {tiers.map((t) => {
          const remaining = t.quantity_available - t.quantity_sold;
          const soldOut = remaining <= 0;
          return (
            <div key={t.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {t.name}
                  {soldOut && <Badge variant="destructive">Sold out</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatPrice(t.price_cents)} · {remaining} of {t.quantity_available} left
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => buy(t)} disabled={soldOut}>
                  Buy · {formatPrice(t.price_cents)}
                </Button>
                {isCoordinator && (
                  <Button size="sm" variant="ghost" onClick={() => del(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {purchases.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-sm font-medium">Your tickets</div>
            {purchases.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  {p.quantity} × {formatPrice(p.amount_cents / p.quantity)} · {p.status}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {p.check_in_count}/{p.quantity} checked in
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={() => showQr(p)}>
                  <QrCode className="mr-1 h-4 w-4" /> QR
                </Button>
              </div>
            ))}
          </div>
        )}
        {qrPurchase && (
          <div className="rounded-md border p-3 text-center">
            <img src={qrPurchase.image_url} alt="Ticket QR code" className="mx-auto h-60 w-60" />
            <div className="mt-2 text-xs font-mono break-all text-muted-foreground">{qrPurchase.token}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {qrPurchase.check_in_count}/{qrPurchase.quantity} scanned
            </div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setQrPurchase(null)}>
              Close
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}