import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "EventHub — Community Events" },
    { name: "description", content: "Discover upcoming community events and local calendars on EventHub." },
    { property: "og:title", content: "EventHub — Community Events" },
    { property: "og:description", content: "Find upcoming community events near you." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
});
