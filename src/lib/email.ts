// Outgoing email: SMTP (any mail server, Gmail, Microsoft 365…) or an HTTP email API
// (Resend, SendGrid, Brevo). Configured once in the setup wizard or in School settings → Email.
// Passwords and API keys are stored encrypted (see settings.ts / secrets.ts).
import nodemailer from "nodemailer";
import { z } from "zod";
import { db } from "./db";
import { getSetting, setSetting } from "./settings";
import { decrypt } from "./secrets";

export const EMAIL_PROVIDERS = [
  { id: "none", label: "Not now", hint: "Password reset and invite emails stay off. You can set this up later." },
  { id: "smtp", label: "SMTP server", hint: "Your school's mail server, Google Workspace, Microsoft 365 or any SMTP service." },
  { id: "resend", label: "Resend API", hint: "Uses an API key from resend.com." },
  { id: "sendgrid", label: "SendGrid API", hint: "Uses an API key from sendgrid.com." },
  { id: "brevo", label: "Brevo API", hint: "Uses an API key from brevo.com." },
] as const;

export type EmailProvider = (typeof EMAIL_PROVIDERS)[number]["id"];

export type EmailConfig = {
  provider: EmailProvider;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls" | "none";
  smtpUser: string;
  smtpPass: string;
  apiKey: string;
};

const KEY: Record<keyof EmailConfig, string> = {
  provider: "email.provider",
  fromEmail: "email.fromEmail",
  fromName: "email.fromName",
  smtpHost: "email.smtp.host",
  smtpPort: "email.smtp.port",
  smtpSecurity: "email.smtp.security",
  smtpUser: "email.smtp.user",
  smtpPass: "email.smtp.pass",
  apiKey: "email.apiKey",
};
const SECRET_FIELDS = new Set<keyof EmailConfig>(["smtpPass", "apiKey"]);

export async function getEmailConfig(): Promise<EmailConfig> {
  const rows = await db.systemSetting.findMany({ where: { key: { startsWith: "email." } } });
  const get = (k: keyof EmailConfig) => {
    const row = rows.find((r) => r.key === KEY[k]);
    return row ? (row.secret ? decrypt(row.value) : row.value) : "";
  };
  return {
    provider: (get("provider") || "none") as EmailProvider,
    fromEmail: get("fromEmail"),
    fromName: get("fromName"),
    smtpHost: get("smtpHost"),
    smtpPort: Number(get("smtpPort")) || 587,
    smtpSecurity: (get("smtpSecurity") || "starttls") as EmailConfig["smtpSecurity"],
    smtpUser: get("smtpUser"),
    smtpPass: get("smtpPass"),
    apiKey: get("apiKey"),
  };
}

export async function saveEmailConfig(cfg: EmailConfig) {
  for (const k of Object.keys(KEY) as (keyof EmailConfig)[]) {
    await setSetting(KEY[k], String(cfg[k] ?? ""), { secret: SECRET_FIELDS.has(k) });
  }
}

export async function isEmailConfigured() {
  return ((await getSetting(KEY.provider)) ?? "none") !== "none";
}

/** Public view of the config for forms: secrets are replaced by "is it saved?" flags. */
export async function getEmailConfigForForm() {
  const c = await getEmailConfig();
  return { ...c, smtpPass: "", apiKey: "", hasSmtpPass: !!c.smtpPass, hasApiKey: !!c.apiKey };
}
export type EmailFormValues = Awaited<ReturnType<typeof getEmailConfigForForm>>;

/* ---------------- Form parsing (setup wizard + School settings) ---------------- */

const emailFormSchema = z
  .object({
    mailProvider: z.enum(["none", "smtp", "resend", "sendgrid", "brevo"]).default("none"),
    mailFromEmail: z.string().trim().toLowerCase().default(""),
    mailFromName: z.string().trim().max(120).default(""),
    smtpHost: z.string().trim().default(""),
    smtpPort: z.string().trim().default("587"),
    smtpSecurity: z.enum(["tls", "starttls", "none"]).default("starttls"),
    smtpUser: z.string().trim().default(""),
    smtpPass: z.string().default(""),
    mailApiKey: z.string().trim().default(""),
  })
  .superRefine((d, ctx) => {
    if (d.mailProvider === "none") return;
    const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (!z.string().email().safeParse(d.mailFromEmail).success) add("mailFromEmail", "Enter the address emails are sent from.");
    if (d.mailProvider === "smtp") {
      if (!d.smtpHost) add("smtpHost", "Enter the SMTP server, for example smtp.gmail.com.");
      const port = Number(d.smtpPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) add("smtpPort", "Enter a port number, usually 587 or 465.");
    }
  });

/**
 * Reads the email fields from a form. Blank password / API key fields keep the saved value,
 * so the form never has to send stored secrets back to the browser.
 */
export async function parseEmailForm(form: FormData): Promise<{ config: EmailConfig } | { errors: Record<string, string> }> {
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = emailFormSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const d = parsed.data;
  const saved = await getEmailConfig().catch(() => null);
  const config: EmailConfig = {
    provider: d.mailProvider,
    fromEmail: d.mailFromEmail,
    fromName: d.mailFromName,
    smtpHost: d.smtpHost,
    smtpPort: Number(d.smtpPort) || 587,
    smtpSecurity: d.smtpSecurity,
    smtpUser: d.smtpUser,
    smtpPass: d.smtpPass || saved?.smtpPass || "",
    apiKey: d.mailApiKey || saved?.apiKey || "",
  };
  if (["resend", "sendgrid", "brevo"].includes(config.provider) && !config.apiKey) return { errors: { mailApiKey: "Paste your API key." } };
  return { config };
}

/* ---------------- Sending ---------------- */

export type EmailMessage = { to: string; subject: string; text: string; html: string };
export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(msg: EmailMessage, config?: EmailConfig): Promise<SendResult> {
  const cfg = config ?? (await getEmailConfig());
  if (cfg.provider === "none") return { ok: false, error: "Email isn't set up yet." };
  const fromName = cfg.fromName || "Campus LMS";
  try {
    switch (cfg.provider) {
      case "smtp": {
        const transport = nodemailer.createTransport({
          host: cfg.smtpHost,
          port: cfg.smtpPort,
          secure: cfg.smtpSecurity === "tls",
          requireTLS: cfg.smtpSecurity === "starttls",
          ignoreTLS: cfg.smtpSecurity === "none",
          auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
          connectionTimeout: 15_000,
          greetingTimeout: 15_000,
          socketTimeout: 20_000,
        });
        await transport.sendMail({ from: { name: fromName, address: cfg.fromEmail }, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
        return { ok: true };
      }
      case "resend":
        return await postJson(
          "https://api.resend.com/emails",
          { Authorization: `Bearer ${cfg.apiKey}` },
          { from: `${fromName} <${cfg.fromEmail}>`, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html },
        );
      case "sendgrid":
        return await postJson(
          "https://api.sendgrid.com/v3/mail/send",
          { Authorization: `Bearer ${cfg.apiKey}` },
          {
            personalizations: [{ to: [{ email: msg.to }] }],
            from: { email: cfg.fromEmail, name: fromName },
            subject: msg.subject,
            content: [{ type: "text/plain", value: msg.text }, { type: "text/html", value: msg.html }],
          },
        );
      case "brevo":
        return await postJson(
          "https://api.brevo.com/v3/smtp/email",
          { "api-key": cfg.apiKey },
          { sender: { name: fromName, email: cfg.fromEmail }, to: [{ email: msg.to }], subject: msg.subject, textContent: msg.text, htmlContent: msg.html },
        );
    }
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<SendResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return { ok: true };
  let detail = "";
  try {
    const j = (await res.json()) as { message?: string; errors?: { message?: string }[] };
    detail = j.message ?? j.errors?.[0]?.message ?? "";
  } catch {}
  if (res.status === 401 || res.status === 403) return { ok: false, error: `The email service rejected the API key${detail ? `: ${detail}` : "."}` };
  return { ok: false, error: `The email service returned an error (${res.status})${detail ? `: ${detail}` : "."}` };
}

function friendlyError(err: unknown) {
  const e = err as { code?: string; responseCode?: number; message?: string; name?: string };
  if (e.code === "EAUTH" || e.responseCode === 535) return "The SMTP server rejected the username or password.";
  if (e.code === "ECONNREFUSED") return "Couldn't connect to the SMTP server. Check the server name and port.";
  if (e.code === "ETIMEDOUT" || e.code === "ECONNECTION" || e.name === "TimeoutError") return "The email server didn't respond in time. Check the server, port and security setting.";
  if (e.code === "ENOTFOUND" || e.code === "EDNS") return "That email server address couldn't be found.";
  if (e.code === "ESOCKET") return "Secure connection failed. Try a different security setting (465 uses SSL/TLS, 587 uses STARTTLS).";
  return e.message ? `Sending failed: ${e.message}` : "Sending failed.";
}
