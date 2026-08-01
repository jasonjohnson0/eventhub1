export type DnsRecord = {
  type: string;
  host: string;
  value: string;
  ttl: string;
  note?: string;
};

export const NAMESERVERS = ["ns1.lovable.app", "ns2.lovable.app"];

export function dnsRecordsFor(domain: string): DnsRecord[] {
  const root = domain || "yourdomain.com";
  return [
    { type: "A", host: "@", value: "185.158.133.1", ttl: "3600", note: `Points ${root} at EventHub` },
    { type: "A", host: "www", value: "185.158.133.1", ttl: "3600", note: "www subdomain" },
    { type: "TXT", host: "_lovable", value: "lovable_verify=<token shown at connect time>", ttl: "3600", note: "Ownership verification" },
    { type: "CNAME", host: "events", value: "sparkle-calendar-co.lovable.app", ttl: "3600", note: "Optional events.* subdomain" },
    { type: "MX", host: "@", value: "10 mx.emailprovider.net", ttl: "3600", note: "Only if your provider sends from this domain" },
    { type: "TXT", host: "@", value: "v=spf1 include:sendgrid.net ~all", ttl: "3600", note: "SPF — match to your email provider" },
    { type: "TXT", host: "_dmarc", value: "v=DMARC1; p=none; rua=mailto:dmarc@" + root, ttl: "3600", note: "DMARC policy" },
  ];
}