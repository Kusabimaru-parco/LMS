// Grade categories for client components (lib/grading.ts imports the database, so it can't be used there).
export const CATEGORIES_CLIENT = [
  { id: "assignment", label: "Assignments" },
  { id: "quiz", label: "Quizzes" },
  { id: "exam", label: "Exams" },
] as const;
