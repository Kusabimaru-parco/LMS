---
name: ui-ux-design
description: UI/UX design system and rules for the Campus LMS. Use before building or changing any page, component, form, table, navigation or layout in this project, and when reviewing UI for accessibility, responsiveness or visual polish.
---

# Campus LMS — UI/UX Design Skill

The product is sold to schools. Buyers judge it in the first 30 seconds of a demo, and
it is used daily by teachers on laptops and students on cheap phones. Every screen must
look calm, trustworthy and obvious. Follow these rules for all UI work.

## 1. Principles (in priority order)

1. **Clarity over cleverness.** One primary action per screen. Plain words ("Submit work", not "Finalize deliverable").
2. **Accessible by default** — WCAG 2.2 AA is a sales requirement for schools, not a nice-to-have.
3. **Mobile-first.** Design at 360px wide first, then enhance at `md` (768px) and `lg` (1024px).
4. **Consistency.** Reuse the components in `src/components/ui`. Never hand-roll a new button or card style.
5. **Fast feedback.** Every action shows a result: pending state, success message, or an inline error.

## 2. Design tokens

Defined in `src/app/globals.css` under `@theme`. Never hard-code hex colors in components.

| Token | Use |
|---|---|
| `brand-50 … brand-900` | Primary actions, active nav, links, focus rings. Per-school colour is injected through `--brand-*` CSS vars. |
| `slate-*` (Tailwind) | Text (`slate-900` headings, `slate-600` body, `slate-500` meta), borders (`slate-200`), surfaces (`slate-50`). |
| `emerald` | Success, "Graded", "Submitted" |
| `amber` | Warning, "Due soon" |
| `rose` | Error, "Overdue", destructive actions |

- **Type:** Inter (system fallback). Scale: `text-xs` meta · `text-sm` body/UI · `text-base` reading content · `text-lg` card titles · `text-2xl` page titles. Max 2 weights per screen (`font-medium`, `font-semibold`).
- **Spacing:** 4px grid. Card padding `p-5`, page gutters `px-4 md:px-8`, section gaps `gap-6`.
- **Radius:** `rounded-lg` controls, `rounded-xl` cards, `rounded-full` avatars and pills.
- **Elevation:** borders first (`border border-slate-200`), shadow only `shadow-sm`. No heavy drop shadows.

## 3. Layout & navigation

- **Desktop (`lg+`):** fixed left sidebar (256px) + top bar with page title and user menu.
- **Mobile:** top bar + **bottom tab bar** with max 5 destinations (thumb reach). The sidebar becomes a slide-over drawer for the rest.
- Content max width `max-w-6xl`; reading content (lessons) `max-w-3xl` for 60–80 character lines.
- Every page starts with `<PageHeader title description actions />`.
- Tables become stacked cards below `md`. Never make the page scroll horizontally.

## 4. Accessibility checklist (must pass before a UI change is done)

- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 for 18px+ and UI borders/icons).
- [ ] Touch targets ≥ 44×44px on mobile (`min-h-11`).
- [ ] Visible focus ring on every interactive element (`focus-visible:ring-2 ring-brand-500 ring-offset-2`).
- [ ] Every input has a `<label>`; errors are linked with `aria-describedby` and announced (`role="alert"`).
- [ ] Icons-only buttons have `aria-label`. Decorative icons have `aria-hidden`.
- [ ] Status is never shown by colour alone — always pair with text or an icon.
- [ ] Semantic landmarks: `header`, `nav`, `main`, one `h1` per page, ordered headings.
- [ ] Keyboard: everything reachable with Tab, Escape closes drawers/dialogs, a "Skip to content" link exists.
- [ ] Respect `prefers-reduced-motion`.

## 5. Component rules

- **Buttons:** variants `primary` (one per view), `secondary`, `ghost`, `danger`. Verb-first labels. Show a spinner + disabled state while pending.
- **Forms:** single column, label above field, helper text below, required fields marked. Validate on the server, show errors inline next to the field and a summary at the top for long forms.
- **Cards:** title, optional meta line, body, optional footer actions. Whole card clickable only if it has one destination.
- **Badges:** status pills with icon + text (`Due in 2 days`, `Overdue`, `Graded 92%`).
- **Empty states:** icon, one-sentence explanation, and the action that fixes it ("No courses yet — Create course").
- **Loading:** skeletons matching the final layout, not spinners for whole pages.
- **Dates:** relative for near dates ("Tomorrow, 11:59 PM"), absolute otherwise. Always show the time for deadlines.

## 6. Writing (microcopy)

- Sentence case everywhere. No ALL CAPS except tiny overlines.
- Speak to the user: "Your courses", "You have 3 assignments due this week".
- Errors say what happened and how to fix it: "Password must be at least 8 characters."
- Age-appropriate: students may be 10 years old. Avoid jargon.

## 7. Review before finishing UI work

1. Check the page at 360px, 768px and 1280px widths.
2. Tab through it with the keyboard.
3. Confirm empty, loading, error and full-data states all look intentional.
4. Confirm it looks right for each role that can see it (admin, teacher, student).
