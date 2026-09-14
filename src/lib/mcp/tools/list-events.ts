import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_events",
  title: "List events",
  description:
    "List events visible to the signed-in user, optionally filtered by category, status, text search and date range.",
  inputSchema: {
    search: z.string().trim().min(1).max(100).optional().describe("Match against event title."),
    category: z
      .enum(["sports", "networking", "education", "social", "fundraiser", "workshop", "other"])
      .optional(),
    status: z.enum(["pending", "approved", "rejected", "removed"]).optional(),
    from: z.string().optional().describe("ISO date/time lower bound on start_time."),
    to: z.string().optional().describe("ISO date/time upper bound on start_time."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, category, status, from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("events")
      .select("id, title, description, location, start_time, end_time, status, category, tags, event_format")
      // Unlisted events stay visible to their own owner/staff (RLS already
      // scopes "own, any status" separately from "approved, any owner"), but
      // not to a generic caller just because a row is approved -- spec 04
      // says don't leak unlisted events to a generic agent token.
      .or(`visibility.eq.public,coordinator_id.eq.${ctx.getUserId()}`)
      .order("start_time", { ascending: true })
      .limit(limit);
    if (search) query = query.ilike("title", `%${search}%`);
    if (category) query = query.eq("category", category);
    if (status) query = query.eq("status", status);
    if (from) query = query.gte("start_time", from);
    if (to) query = query.lte("start_time", to);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { events: data ?? [] },
    };
  },
});
