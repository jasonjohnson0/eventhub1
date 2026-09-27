// Server-only email provider dispatch.
// Each provider takes { apiKey, fromName, fromAddress, extra } + a message and returns { ok, error? }.
// All providers use fetch (HTTP APIs) so they run on Cloudflare Workers.
// TODO: AWS SES as paid add-on — implement in Phase 3b (signature matches others).

export type EmailProvider = "lovable" | "sendgrid" | "postmark" | "mailgun" | "none" | "outbox";

export type EmailCredentials = {
  provider: EmailProvider;
  apiKey: string;
  fromName: string;
  fromAddress: string;
  extra?: Record<string, unknown> | null; // mailgun_domain lives here
};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendResult = { ok: true; messageId?: string } | { ok: false; error: string };

function fromHeader(name: string, address: string): string {
  return name ? `${name} <${address}>` : address;
}

async function sendViaSendGrid(c: EmailCredentials, m: EmailMessage): Promise<SendResult> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: m.to }] }],
      from: { email: c.fromAddress, name: c.fromName || undefined },
      subject: m.subject,
      content: [
        { type: "text/plain", value: m.text ?? m.subject },
        { type: "text/html", value: m.html },
      ],
    }),
  });
  if (res.status >= 200 && res.status < 300) {
    return { ok: true, messageId: res.headers.get("x-message-id") ?? undefined };
  }
  const body = await res.text().catch(() => "");
  return { ok: false, error: `SendGrid ${res.status}: ${body.slice(0, 300)}` };
}

async function sendViaPostmark(c: EmailCredentials, m: EmailMessage): Promise<SendResult> {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": c.apiKey,
    },
    body: JSON.stringify({
      From: fromHeader(c.fromName, c.fromAddress),
      To: m.to,
      Subject: m.subject,
      HtmlBody: m.html,
      TextBody: m.text ?? m.subject,
      MessageStream: "outbound",
    }),
  });
  if (res.status >= 200 && res.status < 300) {
    const body = await res.json().catch(() => null) as { MessageID?: string } | null;
    return { ok: true, messageId: body?.MessageID };
  }
  const body = await res.text().catch(() => "");
  return { ok: false, error: `Postmark ${res.status}: ${body.slice(0, 300)}` };
}

async function sendViaMailgun(c: EmailCredentials, m: EmailMessage): Promise<SendResult> {
  const domain = (c.extra?.mailgun_domain as string | undefined) ?? "";
  if (!domain) return { ok: false, error: "Mailgun domain is required" };
  const form = new URLSearchParams();
  form.set("from", fromHeader(c.fromName, c.fromAddress));
  form.set("to", m.to);
  form.set("subject", m.subject);
  form.set("html", m.html);
  form.set("text", m.text ?? m.subject);
  const auth = Buffer.from(`api:${c.apiKey}`).toString("base64");
  const res = await fetch(`https://api.mailgun.net/v3/${encodeURIComponent(domain)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (res.status >= 200 && res.status < 300) {
    const body = await res.json().catch(() => null) as { id?: string } | null;
    return { ok: true, messageId: body?.id };
  }
  const body = await res.text().catch(() => "");
  return { ok: false, error: `Mailgun ${res.status}: ${body.slice(0, 300)}` };
}

async function sendViaLovable(_c: EmailCredentials, _m: EmailMessage): Promise<SendResult> {
  // Lovable's built-in email is queued via the email infra (pgmq + cron).
  // For "Test Email" from setup, we treat the config as always valid — the queue
  // handles delivery. A real integration would enqueue to `transactional_emails`.
  // This `ok: true` does not mean delivered -- platform-mailer.server.ts's
  // logging layer maps a lovable send to status "simulated", not "sent"
  // (spec 07 F1), specifically so a log built on top of this doesn't lie.
  return { ok: true };
}

/** Test-only transport: POSTs the full message to TEST_EMAIL_OUTBOX_URL so a
 *  browser test can open the link an email really carried (e.g. a private-
 *  event invite's accept link). Triple-gated, so it can never deliver -- or
 *  silently swallow -- mail in production:
 *   1. `outbox` isn't a value of the email_provider_type enum, so no
 *      production platform_config row can select it (only the test mock can);
 *   2. it requires TEST_EMAIL_OUTBOX_URL, which only tests/run.sh sets;
 *   3. it refuses to run when NODE_ENV is "production". */
async function sendViaOutbox(m: EmailMessage): Promise<SendResult> {
  const url = process.env["TEST_EMAIL_OUTBOX_URL"];
  if (!url || process.env["NODE_ENV"] === "production") {
    return { ok: false, error: "Test outbox is not available here" };
  }
  const res = await fetch(url, { method: "POST", body: JSON.stringify(m) });
  return res.ok ? { ok: true, messageId: `outbox-${Date.now()}` } : { ok: false, error: `Outbox ${res.status}` };
}

export async function sendEmail(c: EmailCredentials, m: EmailMessage): Promise<SendResult> {
  switch (c.provider) {
    case "outbox":
      return sendViaOutbox(m);
    case "sendgrid":
      return sendViaSendGrid(c, m);
    case "postmark":
      return sendViaPostmark(c, m);
    case "mailgun":
      return sendViaMailgun(c, m);
    case "lovable":
      return sendViaLovable(c, m);
    case "none":
      return { ok: false, error: "No email provider configured" };
  }
}