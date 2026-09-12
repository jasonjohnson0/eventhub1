import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_event",
  title: "Create event",
  description: "Create a new event owned by the signed-in user.",
  inputSchema: {
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000).optional(),
    location: z.string().max(300).optional(),
    start_time: z.string().describe("ISO 8601 start time, e.g. 2026-10-01T18:00:00Z."),
    end_time: z.string().describe("ISO 8601 end time."),
    category: z
      .enum(["sports", "networking", "education", "social", "fundraiser", "workshop", "other"])
      .default("other"),
    tags: z.array(z.string().min(1).max(40)).max(20).default([]),
    event_format: z.enum(["in_person", "virtual", "hybrid"]).default("in_person"),
    virtual_link: z.string().url().max(500).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("events")
      .insert({
        coordinator_id: ctx.getUserId()!,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        start_time: input.start_time,
        end_time: input.end_time,
        status: "approved",
        category: input.category,
        tags: input.tags,
        event_format: input.event_format,
        virtual_link: input.event_format === "in_person" ? null : input.virtual_link ?? null,
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { event: data },
    };
  },
});
