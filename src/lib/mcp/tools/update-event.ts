import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_event",
  title: "Update event",
  description:
    "Update fields on an existing event the signed-in user is allowed to manage. Only provided fields change.",
  inputSchema: {
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(4000).optional(),
    location: z.string().max(300).optional(),
    start_time: z.string().optional().describe("ISO 8601 start time."),
    end_time: z.string().optional().describe("ISO 8601 end time."),
    category: z
      .enum(["sports", "networking", "education", "social", "fundraiser", "workshop", "other"])
      .optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, ...fields }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (Object.keys(patch).length === 0) throw new ToolError("Provide at least one field to update.");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("events").update(patch).eq("id", id).select();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data || data.length === 0) {
      throw new ToolError(`No event updated — id ${id} not found or not editable by you.`);
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data[0], null, 2) }],
      structuredContent: { event: data[0] },
    };
  },
});
