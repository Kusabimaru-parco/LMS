// Settings form fields shared by "New quiz/exam" and the builder's settings panel.
import type { FieldDef } from "@/components/simple-form";
import { SHOW_RESULTS } from "./quiz";
import { toLocalInput } from "./utils";

type Settings = {
  title?: string;
  description?: string;
  kind: string;
  moduleId?: string | null;
  timeLimitMin?: number | null;
  maxAttempts?: number;
  opensAt?: Date | null;
  closesAt?: Date | null;
  showResults?: string;
  shuffleQuestions?: boolean;
  drawCount?: number | null;
};

export function defaultSettings(kind: string): Settings {
  const closes = new Date(Date.now() + 7 * 86_400_000);
  closes.setHours(23, 59, 0, 0);
  return kind === "EXAM"
    ? { kind, timeLimitMin: 60, maxAttempts: 1, closesAt: closes, showResults: "SCORE_ONLY", shuffleQuestions: true }
    : { kind, timeLimitMin: null, maxAttempts: 0, closesAt: closes, showResults: "IMMEDIATE", shuffleQuestions: false };
}

export function quizSettingsFields(s: Settings, modules: { value: string; label: string }[]): FieldDef[] {
  return [
    { name: "title", label: "Title", required: true, defaultValue: s.title, placeholder: s.kind === "EXAM" ? "e.g. Midterm exam" : "e.g. Chapter 3 check-in" },
    { name: "description", label: "Instructions", type: "textarea", rows: 4, defaultValue: s.description, hint: "Shown before students start. Say what's covered and what they may use." },
    { name: "kind", label: "Type", type: "select", defaultValue: s.kind, half: true, options: [{ value: "QUIZ", label: "Quiz" }, { value: "EXAM", label: "Exam" }] },
    { name: "moduleId", label: "Module", type: "select", defaultValue: s.moduleId ?? "", half: true, options: modules },
    { name: "timeLimitMin", label: "Time limit (minutes)", type: "number", min: 1, max: 600, defaultValue: s.timeLimitMin?.toString() ?? "", half: true, hint: "Leave empty for no limit." },
    { name: "maxAttempts", label: "Attempts allowed", type: "number", min: 0, max: 50, defaultValue: String(s.maxAttempts ?? 1), half: true, hint: "0 = unlimited. The best score counts." },
    { name: "opensAt", label: "Opens", type: "datetime-local", defaultValue: s.opensAt ? toLocalInput(s.opensAt) : "", half: true, hint: "Empty = open as soon as you publish." },
    { name: "closesAt", label: "Closes", type: "datetime-local", defaultValue: s.closesAt ? toLocalInput(s.closesAt) : "", half: true, hint: "Shown as the due date. Running attempts end at this time." },
    { name: "showResults", label: "After submitting, students see", type: "select", defaultValue: s.showResults ?? "IMMEDIATE", options: SHOW_RESULTS },
    {
      name: "shuffleQuestions", label: "Question order", type: "select", defaultValue: s.shuffleQuestions ? "yes" : "no",
      options: [{ value: "no", label: "Same order for everyone" }, { value: "yes", label: "Shuffle for each student" }],
      half: true,
    },
    {
      name: "drawCount", label: "Questions per student", type: "number", min: 1, max: 500, defaultValue: s.drawCount?.toString() ?? "", half: true,
      hint: "Optional. Each student gets this many questions picked at random, so no two exams are the same.",
    },
  ];
}
