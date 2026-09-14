import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_event",
  title: "Get event",
  description: "Fetch the full details of a single event by its id.",
  inputSchema: { id: z.string().uuid().describe("Event id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) throw new ToolError(`No event found with id ${id}`);
    // RLS only checks status = 'approved', not visibility -- a stranger's
    // generic MCP token could otherwise fetch an unlisted event by UUID just
    // by knowing (or guessing) it. Owner/staff still see their own (spec 04:
    // "allowed if the caller owns it, otherwise only if public").
    if (data.visibility === "unlisted" && data.coordinator_id !== ctx.getUserId()) {
      throw new ToolError(`No event found with id ${id}`);
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { event: data },
    };
  },
});
