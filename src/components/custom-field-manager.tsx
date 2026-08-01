import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ListPlus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCustomField,
  deleteCustomField,
  listCustomFields,
  updateCustomField,
  type CustomField,
  type CustomFieldType,
} from "@/lib/custom-fields.functions";

const TYPES: CustomFieldType[] = ["text", "dropdown", "number", "date", "checkbox"];

export function CustomFieldManager() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setFields(await listCustomFields());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load fields");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    if (!name.trim()) return toast.error("Field name is required");
    setBusy(true);
    try {
      await createCustomField({
        data: {
          field_name: name.trim(),
          field_type: type,
          is_required: required,
          options:
            type === "dropdown"
              ? options.split(",").map((o) => o.trim()).filter(Boolean)
              : [],
          display_order: fields.length + 1,
        } as never,
      });
      setName("");
      setOptions("");
      setRequired(false);
      setType("text");
      toast.success("Field added");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add field");
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const a = fields[index];
    const b = fields[target];
    try {
      await updateCustomField({ data: { id: a.id, display_order: b.display_order } as never });
      await updateCustomField({ data: { id: b.id, display_order: a.display_order } as never });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reorder");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListPlus className="h-4 w-4" /> Custom event fields
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Field name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Difficulty level" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={required} onCheckedChange={(v) => setRequired(v === true)} />
              Required
            </label>
          </div>
          {type === "dropdown" && (
            <div className="space-y-1.5 sm:col-span-4">
              <Label>Options (comma separated)</Label>
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="Beginner, Intermediate, Advanced"
              />
            </div>
          )}
        </div>
        <Button onClick={add} disabled={busy}>
          Add field
        </Button>

        <div className="divide-y rounded-lg border">
          {fields.length === 0 && <p className="p-4 text-sm text-muted-foreground">No custom fields yet.</p>}
          {fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.field_name}</span>
                  <Badge variant="secondary">{f.field_type}</Badge>
                  {f.is_required ? <Badge>required</Badge> : null}
                </div>
                {f.options?.length ? (
                  <p className="truncate text-xs text-muted-foreground">{f.options.join(" · ")}</p>
                ) : null}
              </div>
              <Button size="sm" variant="ghost" onClick={() => move(i, -1)} aria-label="Move up">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => move(i, 1)} aria-label="Move down">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await deleteCustomField({ data: { id: f.id } });
                    toast.success("Field removed");
                    await load();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not delete");
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}