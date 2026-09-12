import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listEvents from "./tools/list-events";
import getEvent from "./tools/get-event";
import createEvent from "./tools/create-event";
import updateEvent from "./tools/update-event";
import listVenues from "./tools/list-venues";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "eventhub",
  title: "EventHub",
  version: "0.1.0",
  instructions:
    "Tools for EventHub, a community event calendar. Use `list_events` and `get_event` to read the calendar, `create_event` and `update_event` to manage events owned by the signed-in user, and `list_venues` to look up venues.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listEvents, getEvent, createEvent, updateEvent, listVenues],
});
