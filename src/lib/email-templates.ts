// Email templates: built-in defaults, {{variable}} substitution and the branded HTML layout.
// Pure (no Node APIs) so the template editor can render a live preview in the browser.

export type TemplateKey = "welcome" | "tempPassword" | "resetLink" | "dueReminder" | "parentDigest";
export type TemplateFields = { subject: string; heading: string; body: string; buttonLabel: string };
type Variable = { name: string; description: string; sample: string };

const COMMON: Variable[] = [
  { name: "name", description: "First name", sample: "Sofia" },
  { name: "fullName", description: "Full name", sample: "Sofia Garcia" },
  { name: "school", description: "School name", sample: "Northfield Academy" },
  { name: "email", description: "Their email address", sample: "sofia@school.edu" },
];

export const TEMPLATES: Record<TemplateKey, {
  label: string;
  description: string;
  variables: Variable[];
  /** Shown in a highlighted box under the text (not editable, always included). */
  highlight?: { label: string; variable: string };
  hasButton: boolean;
  defaults: TemplateFields;
}> = {
  welcome: {
    label: "Welcome (new account)",
    description: "Sent when an administrator adds someone or imports people. Includes their temporary password.",
    variables: [...COMMON, { name: "role", description: "student, teacher, parent…", sample: "student" }, { name: "link", description: "Sign-in link", sample: "https://lms.school.edu/login" }],
    highlight: { label: "Temporary password", variable: "tempPassword" },
    hasButton: true,
    defaults: {
      subject: "Your {{school}} account",
      heading: "Welcome to {{school}}",
      body: "Hi {{name}},\n\nAn account has been created for you as a {{role}}. Sign in with your email address ({{email}}) and the temporary password below.\n\nYou'll be asked to choose your own password straight away.",
      buttonLabel: "Sign in",
    },
  },
  tempPassword: {
    label: "Password reset by an administrator",
    description: "Sent when an administrator resets someone's password. Includes the new temporary password.",
    variables: [...COMMON, { name: "link", description: "Sign-in link", sample: "https://lms.school.edu/login" }],
    highlight: { label: "Temporary password", variable: "tempPassword" },
    hasButton: true,
    defaults: {
      subject: "New temporary password for {{school}}",
      heading: "Your password was reset",
      body: "Hi {{name}},\n\nA school administrator reset your password. Sign in with the temporary password below, then choose a new one.\n\nIf you didn't ask for this, contact your school.",
      buttonLabel: "Sign in",
    },
  },
  resetLink: {
    label: "Forgot password link",
    description: "Sent when someone uses \"Forgot password\" on the sign-in page.",
    variables: [...COMMON, { name: "link", description: "One-time reset link", sample: "https://lms.school.edu/reset-password?token=…" }, { name: "minutes", description: "How long the link works", sample: "60" }],
    hasButton: true,
    defaults: {
      subject: "Reset your {{school}} password",
      heading: "Reset your password",
      body: "Hi {{name}},\n\nSomeone asked to reset the password for {{email}}. Choose a new password with the button below. The link works for {{minutes}} minutes and only once.\n\nIf you didn't ask for this, ignore this email. Your password won't change.",
      buttonLabel: "Choose a new password",
    },
  },
  dueReminder: {
    label: "Due tomorrow reminder",
    description: "Sent to students about a day before an assignment, quiz or exam is due, if they haven't handed it in.",
    variables: [...COMMON, { name: "kind", description: "assignment, quiz or exam", sample: "assignment" }, { name: "title", description: "Title", sample: "Problem set 2" }, { name: "course", description: "Course", sample: "Algebra II" }, { name: "due", description: "Due date and time", sample: "Tomorrow, 11:59 PM" }, { name: "link", description: "Link to it", sample: "https://lms.school.edu/courses/…" }],
    hasButton: true,
    defaults: {
      subject: "Reminder: {{title}} is due {{due}}",
      heading: "{{title}} is due soon",
      body: "Hi {{name}},\n\nJust a reminder that the {{kind}} \"{{title}}\" in {{course}} is due {{due}}, and you haven't handed it in yet.\n\nYou've got this!",
      buttonLabel: "Open it",
    },
  },
  parentDigest: {
    label: "Weekly summary for parents",
    description: "Sent to parents every Monday morning with each child's grades, missing work and attendance.",
    variables: [...COMMON, { name: "summary", description: "The summary for each child (filled in automatically)", sample: "Liam Tan\n- Average: 86% (B)\n- Missing work: Problem set 1 (Algebra II)\n- Due this week: Unit project proposal (Biology)\n- Absences in the last 7 days: 0" }, { name: "week", description: "Week", sample: "Nov 16 – Nov 22" }, { name: "link", description: "Sign-in link", sample: "https://lms.school.edu/login" }],
    hasButton: true,
    defaults: {
      subject: "{{school}} weekly summary · {{week}}",
      heading: "This week at {{school}}",
      body: "Hi {{name}},\n\nHere's how things are going.\n\n{{summary}}\n\nSign in to see grades, teacher feedback and the calendar.",
      buttonLabel: "Open Campus LMS",
    },
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
export const sampleVariables = (key: TemplateKey) =>
  Object.fromEntries([...TEMPLATES[key].variables, { name: "tempPassword", sample: "kq7m-9tdp-x2wa" }].map((v) => [v.name, v.sample]));

export const fill = (text: string, vars: Record<string, string>) =>
  text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Renders a template with variables into subject, HTML and plain text. */
export function renderTemplate(key: TemplateKey, tpl: TemplateFields, vars: Record<string, string>, school: { name: string; brandColor: string }) {
  const def = TEMPLATES[key];
  const body = fill(tpl.body, vars);
  return {
    subject: fill(tpl.subject, vars).replace(/\s+/g, " ").trim(),
    ...renderEmail({
      school,
      heading: fill(tpl.heading, vars),
      body,
      highlight: def.highlight ? { label: def.highlight.label, value: vars[def.highlight.variable] ?? "" } : undefined,
      button: def.hasButton && tpl.buttonLabel.trim() && vars.link ? { label: fill(tpl.buttonLabel, vars), url: vars.link } : undefined,
      footer: `Sent by ${school.name} through Campus LMS.`,
    }),
  };
}

/**
 * A simple, accessible branded email. Works in every mail client (table layout, inline styles).
 * Body: blank lines separate paragraphs; lines starting with "- " become a list.
 */
export function renderEmail(opts: {
  school: { name: string; brandColor: string };
  heading: string;
  body: string;
  button?: { label: string; url: string };
  highlight?: { label: string; value: string };
  footer?: string;
}) {
  const { school, heading, body, button, highlight, footer } = opts;
  const color = /^#[0-9a-f]{6}$/i.test(school.brandColor) ? school.brandColor : "#4f46e5";
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const p = "margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155";
  const htmlBlocks = blocks.map((b) => {
    const lines = b.split("\n");
    const items = lines.filter((l) => l.trim().startsWith("- "));
    if (items.length && items.length === lines.length - (lines[0].trim().startsWith("- ") ? 0 : 1)) {
      const title = lines[0].trim().startsWith("- ") ? "" : `<p style="${p};margin-bottom:6px;font-weight:600;color:#0f172a">${esc(lines[0])}</p>`;
      return `${title}<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;color:#334155">${items.map((l) => `<li>${esc(l.trim().slice(2))}</li>`).join("")}</ul>`;
    }
    return `<p style="${p}">${lines.map(esc).join("<br>")}</p>`;
  });
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:15px"><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${color};margin-right:8px"></span>${esc(school.name)}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${esc(heading)}</h1>
${htmlBlocks.join("\n")}
${highlight ? `<div style="margin:18px 0;padding:14px 16px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0"><div style="font-size:12px;color:#64748b">${esc(highlight.label)}</div><div style="margin-top:4px;font-size:18px;font-weight:600;font-family:Consolas,Menlo,monospace;letter-spacing:1px">${esc(highlight.value)}</div></div>` : ""}
${button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${esc(button.label)}</a></p><p style="margin:0;font-size:12px;color:#64748b;word-break:break-all">Or open this link: ${esc(button.url)}</p>` : ""}
</td></tr>
${footer ? `<tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${esc(footer)}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
  const text = [
    heading,
    "",
    ...blocks.flatMap((b) => [b, ""]),
    ...(highlight ? [`${highlight.label}: ${highlight.value}`, ""] : []),
    ...(button ? [`${button.label}: ${button.url}`, ""] : []),
    ...(footer ? ["--", footer] : []),
  ].join("\n");
  return { html, text };
}
