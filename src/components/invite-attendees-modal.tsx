import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { sendEventInvitations } from "@/lib/communications.functions";

export function InviteAttendeesModal({
  eventId,
  onSent,
}: {
  eventId: string;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const list = emails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /.+@.+\..+/.test(s));
    if (list.length === 0) {
      toast.error("Enter at least one valid email");
      return;
    }
    setBusy(true);
    try {
      const res = await sendEventInvitations({
        data: { event_id: eventId, emails: list, custom_message: message || null },
      });
      toast.success(`Invitations queued: ${res.queued} pending send`);
      setEmails("");
      setMessage("");
      setOpen(false);
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Mail className="mr-1 h-4 w-4" /> Invite attendees
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite attendees</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="invite-emails">Emails (comma or newline separated)</Label>
            <Textarea
              id="invite-emails"
              rows={4}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="alex@example.com, jamie@example.com"
            />
          </div>
          <div>
            <Label htmlFor="invite-msg">Custom message (optional)</Label>
            <Textarea
              id="invite-msg"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hope you can join us!"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Invitations are queued now. Email delivery is wired in a later phase.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Queuing…" : "Queue invitations"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Keep unused import type check happy
void Input;