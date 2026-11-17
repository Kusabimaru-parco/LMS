// The emails Campus LMS sends. Each uses the school's active custom template for that email type,
// or the built-in default. Returns whether it was delivered so callers can fall back
// (for example, showing a temporary password on screen when email isn't set up).
import { db } from "./db";
import { isEmailConfigured, sendEmail, type EmailConfig, type SendResult } from "./email";
import { renderEmail, renderTemplate, TEMPLATES, type TemplateFields, type TemplateKey } from "./email-templates";
import { getBaseUrl } from "./url";
import { RESET_TOKEN_MINUTES } from "./passwords";
import { ROLE_LABEL } from "./utils";

type School = { name: string; brandColor: string };
type Person = { name: string; email: string; role?: string };

/** The template in use for this email type: the active custom one, or the default. */
export async function activeTemplate(key: TemplateKey): Promise<TemplateFields> {
  const custom = await db.emailTemplate.findFirst({ where: { key, active: true }, orderBy: { updatedAt: "desc" } });
  return custom ?? TEMPLATES[key].defaults;
}

function personVars(user: Person, school: School): Record<string, string> {
  return {
    name: user.name.split(" ")[0],
    fullName: user.name,
    email: user.email,
    school: school.name,
    role: user.role ? (ROLE_LABEL[user.role] ?? user.role).toLowerCase() : "member",
  };
}

export async function sendTemplated(key: TemplateKey, user: Person, school: School, vars: Record<string, string>): Promise<SendResult> {
  if (!(await isEmailConfigured())) return { ok: false, error: "Email isn't set up." };
  const tpl = await activeTemplate(key);
  const msg = renderTemplate(key, tpl, { ...personVars(user, school), ...vars }, school);
  return sendEmail({ to: user.email, ...msg });
}

export async function sendWelcomeEmail(user: Person, school: School, tempPassword: string) {
  return sendTemplated("welcome", user, school, { tempPassword, link: `${await getBaseUrl()}/login` });
}

export async function sendTempPasswordEmail(user: Person, school: School, tempPassword: string) {
  return sendTemplated("tempPassword", user, school, { tempPassword, link: `${await getBaseUrl()}/login` });
}

export async function sendResetLinkEmail(user: Person, school: School, token: string) {
  const link = `${await getBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return sendTemplated("resetLink", user, school, { link, minutes: String(RESET_TOKEN_MINUTES) });
}

/** A template test: renders the given (possibly unsaved) fields with sample values. */
export async function sendTemplateTest(key: TemplateKey, fields: TemplateFields, to: Person, school: School, sample: Record<string, string>) {
  const msg = renderTemplate(key, fields, { ...sample, ...personVars(to, school) }, school);
  return sendEmail({ to: to.email, ...msg, subject: `[Test] ${msg.subject}` });
}

export async function sendTestEmail(to: string, school: School, config?: EmailConfig) {
  const { html, text } = renderEmail({
    school,
    heading: "Email is working",
    body: "This is a test from Campus LMS. Welcome emails, password resets, reminders and weekly summaries will be sent like this one.",
  });
  return sendEmail({ to, subject: `Test email from ${school.name}`, html, text }, config);
}
