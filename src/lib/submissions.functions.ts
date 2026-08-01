import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SubmissionStatus } from "@/lib/submissions.shared";
import {
  listSchema,
  notifySubmitter,
  reviewSchema,
  submitSchema,
} from "@/lib/submissions.server";

export type EventSubmission = {
  id: string;
  coordinator_id: string | null;
  submitted_by_email: string;
  event_data: {
    title: string;
    description?: string | null;
    location?: string | null;
    category?: string | null;
    start_time: string;
    end_time: string;
    image_url?: string | null;
    contact_name?: string | null;
  };
  status: SubmissionStatus;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_event_id: string | null;
};

/** Public — anyone can propose an event; lands in the coordinator queue. */
export const submitEvent = createServerFn({ method: "POST" })
  .inputValidator((d) => submitSchema.parse(d))
  .handler(async ({ data }) => {
    if (new Date(data.end_time) <= new Date(data.start_time)) {
      throw new Error("End time must be after the start time");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = supabaseAdmin as any;
    // Route to the primary coordinator (owner of the earliest event).
    const { data: firstEvent } = await sb
      .from("events")
      .select("coordinator_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const { error } = await sb.from("event_submissions").insert({
      coordinator_id: firstEvent?.coordinator_id ?? null,
      submitted_by_email: data.submitted_by_email.toLowerCase(),
      status: "pending",
      event_data: {
        title: data.title,
        description: data.description ?? null,
        location: data.location ?? null,
        category: data.category,
        start_time: data.start_time,
        end_time: data.end_time,
        image_url: data.image_url ?? null,
        contact_name: data.contact_name ?? null,
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data, context }): Promise<EventSubmission[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    let q = sb.from("event_submissions").select("*").order("submitted_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as EventSubmission[];
  });

export const listPendingSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EventSubmission[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("event_submissions")
      .select("*")
      .eq("status", "pending")
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as EventSubmission[];
  });

export const approveSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => reviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: sub, error } = await sb
      .from("event_submissions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("Submission not found");
    if (sub.status !== "pending") throw new Error("Already reviewed");

    const ed = sub.event_data as EventSubmission["event_data"];
    const { data: created, error: evErr } = await sb
      .from("events")
      .insert({
        coordinator_id: context.userId,
        title: ed.title,
        description: ed.description ?? null,
        location: ed.location ?? null,
        start_time: ed.start_time,
        end_time: ed.end_time,
        category: ed.category ?? "other",
        status: "approved",
      })
      .select("id, title")
      .single();
    if (evErr) throw new Error(evErr.message);

    const { error: updErr } = await sb
      .from("event_submissions")
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        notes: data.notes ?? null,
        created_event_id: created.id,
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    await notifySubmitter(
      sub.submitted_by_email,
      `Your event was approved: ${ed.title}`,
      `Good news — "${ed.title}" is now published on the community calendar.${data.notes ? `\n\nNote from the organizer team:\n${data.notes}` : ""}`,
    );
    return { ok: true, event_id: created.id as string };
  });

export const rejectSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => reviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: sub } = await sb
      .from("event_submissions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!sub) throw new Error("Submission not found");
    const { error } = await sb
      .from("event_submissions")
      .update({
        status: "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        notes: data.notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const ed = sub.event_data as EventSubmission["event_data"];
    await notifySubmitter(
      sub.submitted_by_email,
      `Update on your submission: ${ed.title}`,
      `Thanks for submitting "${ed.title}". We aren't able to publish it right now.${data.notes ? `\n\nReason:\n${data.notes}` : ""}`,
    );
    return { ok: true };
  });