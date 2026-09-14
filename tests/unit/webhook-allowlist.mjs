// Standalone verification of isAllowedWebhookUrl()/maskWebhookUrl() in
// src/lib/chat-notify.server.ts (spec 08, Slack/Discord notifications).
// Copied verbatim (no app-specific imports) since that file isn't loadable
// outside the Vite/TanStack build.
//
// This is the SSRF gate the spec calls out explicitly: a coordinator pastes
// a URL, the server fetch()es it. Every non-https scheme and every
// off-allowlist host has to be rejected, not just the two documented
// examples -- a coordinator-controlled URL reaching an internal address
// (localhost, a cloud metadata endpoint, an arbitrary attacker server) is
// exactly the failure mode a partial allowlist would miss.
// Run: node tests/unit/webhook-allowlist.mjs

const ALLOWED_HOSTS = {
  slack: new Set(["hooks.slack.com"]),
  discord: new Set(["discord.com", "discordapp.com"]),
};

function isAllowedWebhookUrl(url, kind) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS[kind].has(u.hostname);
  } catch {
    return false;
  }
}

function maskWebhookUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const firstSegment = u.pathname.split("/").filter(Boolean)[0];
    return `${u.hostname}${firstSegment ? `/${firstSegment}` : ""}/…`;
  } catch {
    return "••••";
  }
}

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + extra}`);
  if (!cond) failures++;
};

// --- the happy paths ---------------------------------------------------------
check(
  "a real Slack incoming webhook URL is allowed",
  isAllowedWebhookUrl("https://hooks.slack.com/services/T00/B00/XXX", "slack"),
);
check(
  "a real Discord webhook URL is allowed",
  isAllowedWebhookUrl("https://discord.com/api/webhooks/123/abc", "discord"),
);
check(
  "discordapp.com (the legacy host Discord still serves) is allowed",
  isAllowedWebhookUrl("https://discordapp.com/api/webhooks/123/abc", "discord"),
);

// --- SSRF: wrong host entirely -----------------------------------------------
check(
  "an arbitrary attacker-controlled host is rejected for slack",
  !isAllowedWebhookUrl("https://evil.example.com/steal", "slack"),
);
check(
  "localhost is rejected (would reach the server's own loopback)",
  !isAllowedWebhookUrl("https://localhost/admin", "slack"),
);
check(
  "a cloud metadata endpoint is rejected",
  !isAllowedWebhookUrl("https://169.254.169.254/latest/meta-data/", "slack"),
);
check(
  "a slack URL is rejected when checked against the discord allowlist",
  !isAllowedWebhookUrl("https://hooks.slack.com/services/T00/B00/XXX", "discord"),
);

// --- SSRF: right host, wrong scheme/lookalike --------------------------------
check(
  "plain http (not https) is rejected even for an otherwise-valid host",
  !isAllowedWebhookUrl("http://hooks.slack.com/services/T00/B00/XXX", "slack"),
);
check(
  "a host that merely contains the allowed string is rejected (not a suffix/substring match)",
  !isAllowedWebhookUrl("https://hooks.slack.com.evil.example.com/x", "slack"),
);
check(
  "userinfo-prefixed lookalike is rejected, not parsed as the real host",
  !isAllowedWebhookUrl("https://hooks.slack.com@evil.example.com/x", "slack"),
);
check(
  "a malformed URL does not throw, just fails closed",
  !isAllowedWebhookUrl("not a url at all", "slack"),
);
check(
  "an empty string does not throw, just fails closed",
  !isAllowedWebhookUrl("", "discord"),
);

// --- masking: never the token path -------------------------------------------
check(
  "masking a Slack URL keeps the host and the first path segment, not the token",
  maskWebhookUrl("https://hooks.slack.com/services/T00000/B00000/xxxxxxxxxxxxxxxxxxxxxxxx") ===
    "hooks.slack.com/services/…",
);
check(
  "masking never contains the actual webhook token",
  !maskWebhookUrl("https://hooks.slack.com/services/T00000/B00000/SECRETTOKEN123").includes(
    "SECRETTOKEN123",
  ),
);
check("masking null/empty returns empty, not a throw", maskWebhookUrl(null) === "" && maskWebhookUrl("") === "");
check("masking a malformed value fails closed to a placeholder, not a throw", maskWebhookUrl("not a url") === "••••");

console.log("\n" + (failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED"));
process.exit(failures ? 1 : 0);
