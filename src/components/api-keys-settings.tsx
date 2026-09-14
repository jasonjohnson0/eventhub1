import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Key, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRow,
} from "@/lib/api-keys.functions";

/** Spec 09: coordinator-managed REST API keys. The raw secret is shown
 *  exactly once, right after creation -- `listApiKeys` never returns it
 *  again, only the prefix, so this component's own local `justCreated`
 *  state is the only place the full secret ever exists client-side. */
export function ApiKeysSettings() {
  const [rows, setRows] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState<{ secret: string; prefix: string } | null>(null);

  const load = () => {
    void listApiKeys()
      .then(setRows)
      .catch(() => undefined);
  };
  useEffect(load, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const key = await createApiKey({ data: { name: name.trim() } });
      setJustCreated({ secret: key.secret, prefix: key.prefix });
      setName("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this API key? Any automation using it will start getting 401s immediately.")) return;
    try {
      await revokeApiKey({ data: { id } });
      toast.success("Key revoked");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        For your own automations (Zapier, Make, curl) -- <code>Authorization: Bearer &lt;key&gt;</code>{" "}
        against <code>/api/v1</code>. See{" "}
        <a href="/api/v1" target="_blank" rel="noreferrer" className="underline">
          /api/v1
        </a>{" "}
        for the resource list. 60 requests/minute per key.
      </p>

      {justCreated && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="font-medium">Copy this key now -- it won't be shown again.</div>
          <div className="mt-2 flex items-center gap-2">
            <code
              data-testid="api-key-secret"
              className="flex-1 overflow-x-auto rounded bg-white px-2 py-1 text-xs"
            >
              {justCreated.secret}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(justCreated.secret);
                toast.success("Copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setJustCreated(null)}>
            Done
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (e.g. Zapier)"
          className="max-w-xs"
        />
        <Button size="sm" onClick={create} disabled={busy || !name.trim()}>
          <Key className="mr-1 h-4 w-4" /> Create key
        </Button>
      </div>

      <div className="divide-y rounded-lg border text-sm">
        {rows.length === 0 && <p className="p-3 text-muted-foreground">No API keys yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.name}</span>
                {r.revoked_at && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                    Revoked
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {r.prefix}… ·{" "}
                {r.last_used_at ? `last used ${new Date(r.last_used_at).toLocaleString()}` : "never used"}
              </p>
            </div>
            {!r.revoked_at && (
              <Button size="sm" variant="ghost" onClick={() => revoke(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
