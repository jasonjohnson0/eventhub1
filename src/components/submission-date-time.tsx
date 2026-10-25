import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SubmissionDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="space-y-1.5">
    <Label htmlFor="submission-date">Date</Label>
    <div className="flex gap-2">
      <Input id="submission-date" type="date" value={value} onChange={(event) => onChange(event.target.value)} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild><Button type="button" variant="outline" size="icon" aria-label="Choose event date" title="Choose event date"><CalendarDays /></Button></PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="single" selected={value ? parseISO(value) : undefined} defaultMonth={value ? parseISO(value) : undefined} onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }} />
        </PopoverContent>
      </Popover>
    </div>
  </div>;
}

export function SubmissionTime({ label, id, value, onChange }: { label: string; id: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hour, minute] = (value || "18:00").split(":");
  return <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    <div className="flex gap-2">
      <Input id={id} type="time" value={value} onChange={(event) => onChange(event.target.value)} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild><Button type="button" variant="outline" size="icon" aria-label={`Choose ${label.toLowerCase()}`} title={`Choose ${label.toLowerCase()}`}><Clock /></Button></PopoverTrigger>
        <PopoverContent className="w-64 space-y-3" align="end">
          <div className="flex gap-2">
            <Select value={hour} onValueChange={(next) => onChange(`${next}:${minute}`)}>
              <SelectTrigger aria-label={`${label} hour`}><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 24 }, (_, i) => <SelectItem key={i} value={String(i).padStart(2, "0")}>{i % 12 || 12} {i < 12 ? "AM" : "PM"}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={minute} onValueChange={(next) => onChange(`${hour}:${next}`)}>
              <SelectTrigger aria-label={`${label} minute`}><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 60 }, (_, i) => <SelectItem key={i} value={String(i).padStart(2, "0")}>{String(i).padStart(2, "0")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="button" className="w-full" onClick={() => { if (!value) onChange("18:00"); setOpen(false); }}>Done</Button>
        </PopoverContent>
      </Popover>
    </div>
  </div>;
}