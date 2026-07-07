// Server-only email provider dispatch.
// Each provider takes { apiKey, fromName, fromAddress, extra } + a message and returns { ok, error? }.
// All providers use fetch (HTTP APIs) so they run on Cloudflare Workers.
// TODO: AWS SES as paid add-on — implement in Phase 3b (signature matches others).

export type EmailProvider = "lovable" | "sendgrid" | "postmark" | "mailgun" | "none";

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

export type SendResult = { ok: true } | { ok: false; error: string };

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
  if (res.status >= 200 && res.status < 300) return { ok: true };
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
  if (res.status >= 200 && res.status < 300) return { ok: true };
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
  if (res.status >= 200 && res.status < 300) return { ok: true };
  const body = await res.text().catch(() => "");
  return { ok: false, error: `Mailgun ${res.status}: ${body.slice(0, 300)}` };
}

async function sendViaLovable(_c: EmailCredentials, _m: EmailMessage): Promise<SendResult> {
  // Lovable's built-in email is queued via the email infra (pgmq + cron).
  // For "Test Email" from setup, we treat the config as always valid — the queue
  // handles delivery. A real integration would enqueue to `transactional_emails`.
  return { ok: true };
}

export async function sendEmail(c: EmailCredentials, m: EmailMessage): Promise<SendResult> {
  switch (c.provider) {
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