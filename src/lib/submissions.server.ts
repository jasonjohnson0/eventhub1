import { z } from "zod";
import { CATEGORIES } from "@/lib/submissions.shared";

export const submitSchema = z.object({
  // Which coordinator's calendar this event belongs to. Required -- there is
  // no honest default across a multi-tenant platform, and guessing (the
  // platform's oldest coordinator, previously) meant every submission from
  // every tenant's own submit page landed in one unrelated coordinator's
  // queue regardless of whose site the visitor was actually using.
  coordinator_slug: z.string().trim().toLowerCase().min(1).max(40),
  submitted_by_email: z.string().trim().email().max(254),
  contact_name: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).optional().nullable(),
  location: z.string().trim().max(300).optional().nullable(),
  category: z.enum(CATEGORIES).default("other"),
  start_time: z.string().min(8).max(40),
  end_time: z.string().min(8).max(40),
  image_url: z.string().trim().max(1000).optional().nullable(),
  // Alt text for image_url -- optional, since not every submitter will
  // fill it in, but there was no way to supply one at all before this.
  image_alt: z.string().trim().max(300).optional().nullable(),
  // Honeypot: a field no real visitor fills in (hidden off-screen, not
  // display:none, in the form). A submission bot that fills every input
  // blind trips this; a human never sees it. Anything non-empty here means
  // treat the submission as spam without telling the caller so.
  hp: z.string().max(200).optional(),
});

export const reviewSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(1000).optional().nullable(),
});

export const listSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
});

export async function notifySubmitter(to: string, subject: string, body: string) {
  try {
    const { sendPlatformEmail } = await import("@/lib/platform-mailer.server");
    await sendPlatformEmail({
      to,
      subject,
      html: `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;padding:24px;max-width:600px;margin:auto"><p style="white-space:pre-line">${body}</p><hr style="border:none;border-top:1px solid #eee;margin:24px 0"/><p style="font-size:12px;color:#888">EventHub</p></body></html>`,
      text: body,
    });
  } catch {
    // Email delivery is best-effort; review decisions still stand.
  }
}