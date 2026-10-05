import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, Link2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IMPORT_CATEGORIES,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  RECURRENCE_HORIZON_MONTHS,
  csvTemplate,
  guessMapping,
  parseCsv,
  rowsFromCsv,
  rowsFromIcs,
  type ColumnMapping,
  type ImportCategory,
  type ImportField,
  type ImportRow,
  type ImportStatus,
} from "@/lib/event-import";
import {
  fetchIcsFromUrl,
  findImportDuplicates,
  getImportContext,
  importEvents,
  type ImportResult,
} from "@/lib/event-import.functions";
import { categoryLabel } from "@/lib/categories";
import { fmtEventDate, fmtTime } from "@/lib/event-dates";

export const Route = createFileRoute("/_authenticated/coordinator/import")({
  head: () => ({
    meta: [
      { title: "Import events — EventHub" },
      { name: "description", content: "Add many events at once from a spreadsheet (CSV) or an iCal calendar." },
    ],
  }),
  component: ImportPage,
});

type Step = "source" | "map" | "preview" | "done";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const NONE = "__none";

function ImportPage() {
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof getImportContext>> | undefined>(undefined);
  const [step, setStep] = useState<Step>("source");
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dupes, setDupes] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string[]>([]);
  const [defaultStatus, setDefaultStatus] = useState<ImportStatus>("draft");
  const [bulkCategory, setBulkCategory] = useState<ImportCategory | "keep">("keep");
  const [bulkStatus, setBulkStatus] = useState<ImportStatus | "keep">("keep");
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    getImportContext().then(setCtx).catch(() => setCtx(null));
  }, []);
  const zone = ctx?.timezone ?? "America/Chicago";

  function reset() {
    setStep("source");
    setTable(null);
    setRows([]);
    setSelected(new Set());
    setDupes(new Set());
    setNotice([]);
    setResult(null);
    setBulkCategory("keep");
    setBulkStatus("keep");
  }

  async function toPreview(parsed: ImportRow[], notes: string[]) {
    if (parsed.length === 0) {
      toast.error("No events were found to import.");
      return;
    }
    setRows(parsed);
    setNotice(notes);
    setSelected(new Set(parsed.filter((r) => r.errors.length === 0).map((r) => r.key)));
    setStep("preview");
    const valid = parsed.filter((r) => r.start_time && r.title);
    try {
      const { duplicates } = await findImportDuplicates({
        data: { rows: valid.map((r) => ({ title: r.title.slice(0, 200), start_time: r.start_time! })) },
      });
      setDupes(new Set(valid.filter((_, i) => duplicates[i]).map((r) => r.key)));
    } catch {
      setDupes(new Set());
    }
  }

  async function readFile(file: File): Promise<string | null> {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is larger than 5 MB.");
      return null;
    }
    return file.text();
  }

  async function onCsv(file: File) {
    const text = await readFile(file);
    if (text === null) return;
    try {
      const t = parseCsv(text);
      if (t.length < 2) throw new Error("The file needs a header row and at least one event row.");
      setTable(t);
      setMapping(guessMapping(t[0]));
      setStep("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that CSV file.");
    }
  }

  function applyMapping() {
    if (!table) return;
    if (mapping.title === undefined) return toast.error("Choose which column holds the event title.");
    if (mapping.start === undefined && mapping.start_date === undefined) {
      return toast.error("Choose which column holds the start date.");
    }
    const { rows: parsed, truncated } = rowsFromCsv(table, mapping, zone);
    const notes = [`Times without their own offset are read in ${zone}.`];
    if (truncated) notes.push(`Only the first ${MAX_IMPORT_ROWS} rows were read — split the file to import the rest.`);
    void toPreview(parsed, notes);
  }

  function onIcsText(text: string) {
    try {
      const s = rowsFromIcs(text, zone);
      const notes = [`Found ${s.eventsInFile} event${s.eventsInFile === 1 ? "" : "s"} in the calendar.`];
      if (s.recurringSeries > 0) {
        notes.push(
          `${s.recurringSeries} repeating event${s.recurringSeries === 1 ? " was" : "s were"} expanded into ${s.occurrencesAdded} separate dates covering the next ${RECURRENCE_HORIZON_MONTHS} months. Each date is imported as its own event (not as a linked series).`,
        );
      }
      if (s.cancelledSkipped > 0) notes.push(`${s.cancelledSkipped} cancelled event(s) were left out.`);
      notes.push(`Times with no time zone are read in ${zone}. All-day events run midnight to midnight there.`);
      if (s.truncated) notes.push(`Only the first ${MAX_IMPORT_ROWS} events were kept.`);
      void toPreview(s.rows, notes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that calendar.");
    }
  }

  async function onIcsUrl() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const { text } = await fetchIcsFromUrl({ data: { url } });
      onIcsText(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't fetch that calendar.");
    } finally {
      setBusy(false);
    }
  }

  const effective = (r: ImportRow) => ({
    category: bulkCategory === "keep" ? r.category : bulkCategory,
    status: bulkStatus === "keep" ? (r.status ?? defaultStatus) : bulkStatus,
  });

  const chosen = rows.filter((r) => selected.has(r.key) && r.errors.length === 0);
  const chosenDupes = chosen.filter((r) => dupes.has(r.key)).length;

  async function runImport() {
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const res = await importEvents({
        data: {
          onDuplicate,
          rows: chosen.map((r) => ({
            title: r.title,
            description: r.description,
            location: r.location,
            start_time: r.start_time!,
            end_time: r.end_time!,
            tags: r.tags,
            visibility: r.visibility,
            ...effective(r),
          })),
        },
      });
      setResult(res);
      setStep("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([csvTemplate()], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "events-import-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (ctx === undefined) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (ctx === null) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardContent className="space-y-3 p-6 text-sm">
            <p>Set up your calendar first, then you can import events into it.</p>
            <Button asChild>
              <Link to="/onboarding">Set up my calendar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import events</h1>
          <p className="text-sm text-muted-foreground">
            Into <strong>{ctx.name}</strong> · times in {ctx.timezone} · up to {MAX_IMPORT_ROWS} events at a time
          </p>
        </div>
        {step !== "source" && (
          <Button variant="outline" onClick={reset}>
            Start over
          </Button>
        )}
      </div>

      {step === "source" && (
        <Tabs defaultValue="csv">
          <TabsList>
            <TabsTrigger value="csv">Spreadsheet (CSV)</TabsTrigger>
            <TabsTrigger value="ics">Calendar (iCal)</TabsTrigger>
          </TabsList>
          <TabsContent value="csv">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upload a CSV file</CardTitle>
                <CardDescription>
                  Any spreadsheet works — you'll match its columns on the next step. Export from Excel or Google Sheets
                  as "CSV".
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <FilePick accept=".csv,text/csv" label="Choose CSV file" onFile={onCsv} />
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="mr-2 h-4 w-4" /> Download template
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="ics">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import from an iCal calendar</CardTitle>
                <CardDescription>
                  Upload an .ics file, or paste a public calendar link (https:// or webcal://) from Google Calendar,
                  Outlook, Eventbrite, a website, etc. Repeating events are expanded for the next{" "}
                  {RECURRENCE_HORIZON_MONTHS} months.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FilePick
                  accept=".ics,text/calendar"
                  label="Choose .ics file"
                  onFile={async (f) => {
                    const t = await readFile(f);
                    if (t !== null) onIcsText(t);
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/calendar.ics"
                    className="max-w-lg"
                    onKeyDown={(e) => e.key === "Enter" && onIcsUrl()}
                  />
                  <Button onClick={onIcsUrl} disabled={busy || !url.trim()}>
                    <Link2 className="mr-2 h-4 w-4" /> {busy ? "Fetching…" : "Fetch calendar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {step === "map" && table && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Match your columns</CardTitle>
            <CardDescription>
              We guessed from your headers. Use either one "Start" column, or a separate date and time column.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">
                    {f.label}
                    {"required" in f && f.required ? " *" : ""}
                  </Label>
                  <Select
                    value={mapping[f.key as ImportField] === undefined ? NONE : String(mapping[f.key as ImportField])}
                    onValueChange={(v) =>
                      setMapping((m) => {
                        const n = { ...m };
                        if (v === NONE) delete n[f.key as ImportField];
                        else n[f.key as ImportField] = Number(v);
                        return n;
                      })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Not in my file —</SelectItem>
                      {table[0].map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h.trim() || `Column ${i + 1}`}
                          {table[1]?.[i] ? ` (e.g. ${table[1][i].slice(0, 30)})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {table.length - 1} row{table.length === 2 ? "" : "s"} in the file. Dates like 2026-10-08 11:00,
              10/8/2026 11:00 AM, Oct 8, 2026 7pm and ISO 8601 are understood. Tags can be separated by commas or
              semicolons.
            </p>
            <Button onClick={applyMapping}>Preview events</Button>
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <>
          {notice.length > 0 && (
            <Card>
              <CardContent className="space-y-1 p-4 text-sm">
                {notice.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Default status (rows without one)</Label>
                <Select value={defaultStatus} onValueChange={(v) => setDefaultStatus(v as ImportStatus)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft (not public yet)</SelectItem>
                    <SelectItem value="approved">Approved (live)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Set status for all</Label>
                <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as ImportStatus | "keep")}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep per row</SelectItem>
                    <SelectItem value="draft">All draft</SelectItem>
                    <SelectItem value="approved">All approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Set category for all</Label>
                <Select value={bulkCategory} onValueChange={(v) => setBulkCategory(v as ImportCategory | "keep")}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep per row</SelectItem>
                    {IMPORT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {categoryLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Already on your calendar</Label>
                <RadioGroup
                  value={onDuplicate}
                  onValueChange={(v) => setOnDuplicate(v as "skip" | "update")}
                  className="pt-1"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="skip" /> Skip duplicates
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="update" /> Update existing
                  </label>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={chosen.length > 0 && chosen.length === rows.filter((r) => !r.errors.length).length}
                          onCheckedChange={(v) =>
                            setSelected(new Set(v ? rows.filter((r) => !r.errors.length).map((r) => r.key) : []))
                          }
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Starts</TableHead>
                      <TableHead>Ends</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const eff = effective(r);
                      const bad = r.errors.length > 0;
                      return (
                        <TableRow key={r.key} className={bad ? "bg-destructive/5" : undefined}>
                          <TableCell>
                            <Checkbox
                              disabled={bad}
                              checked={selected.has(r.key) && !bad}
                              onCheckedChange={(v) =>
                                setSelected((s) => {
                                  const n = new Set(s);
                                  if (v) n.add(r.key);
                                  else n.delete(r.key);
                                  return n;
                                })
                              }
                              aria-label={`Include ${r.title || r.source}`}
                            />
                          </TableCell>
                          <TableCell className="max-w-64">
                            <div className="truncate font-medium">{r.title || <em>(no title)</em>}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {r.source}
                              {r.location ? ` · ${r.location}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{when(r.start_time, zone)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{when(r.end_time, zone)}</TableCell>
                          <TableCell className="text-xs">{categoryLabel(eff.category)}</TableCell>
                          <TableCell className="text-xs capitalize">{eff.status}</TableCell>
                          <TableCell className="max-w-72 space-y-0.5 text-xs">
                            {dupes.has(r.key) && (
                              <Badge variant="secondary" className="mr-1">
                                {onDuplicate === "skip" ? "Duplicate — will skip" : "Duplicate — will update"}
                              </Badge>
                            )}
                            {r.errors.map((e) => (
                              <div key={e} className="text-destructive">
                                {e}
                              </div>
                            ))}
                            {r.warnings.map((w) => (
                              <div key={w} className="text-muted-foreground">
                                {w}
                              </div>
                            ))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {chosen.length} of {rows.length} selected
              {rows.some((r) => r.errors.length) && ` · ${rows.filter((r) => r.errors.length).length} with errors can't be imported`}
              {chosenDupes > 0 && ` · ${chosenDupes} already on your calendar`}
            </p>
            <Button onClick={runImport} disabled={busy || chosen.length === 0}>
              <Upload className="mr-2 h-4 w-4" />
              {busy ? "Importing…" : `Import ${chosen.length} event${chosen.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}

      {step === "done" && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import finished</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Imported" value={result.imported} />
              <Stat label="Updated" value={result.updated} />
              <Stat label="Skipped (duplicates)" value={result.skipped} />
              <Stat label="Failed" value={result.failed.length} />
            </div>
            {result.failed.length > 0 && (
              <div className="space-y-1">
                <div className="font-medium">Couldn't import:</div>
                {result.failed.map((f, i) => (
                  <div key={i} className="text-xs">
                    <strong>{f.title}</strong> ({when(f.start_time, zone)}) — {f.reason}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/calendar">View calendar</Link>
              </Button>
              <Button variant="outline" onClick={reset}>
                Import more
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function when(iso: string | null, zone: string) {
  if (!iso) return "—";
  return `${fmtEventDate(iso, zone, { month: "short", day: "numeric", year: "numeric" })}, ${fmtTime(iso, zone)}`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function FilePick({ accept, label, onFile }: { accept: string; label: string; onFile: (f: File) => void }) {
  const id = useMemo(() => `file-${Math.random().toString(36).slice(2)}`, []);
  return (
    <>
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button asChild>
        <label htmlFor={id} className="cursor-pointer">
          <FileUp className="mr-2 h-4 w-4" /> {label}
        </label>
      </Button>
    </>
  );
}
