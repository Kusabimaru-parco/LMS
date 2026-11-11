// Loads a complete demo school for sales demos. It REPLACES all data and skips the setup wizard.
// Run: npm run demo   (pair with DEMO_MODE="true" for one-click sign-in buttons)
// Never run this on a real school's server.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const DEMO_PASSWORD = "demo1234";
const day = 24 * 60 * 60 * 1000;
const at = (days, hour = 23, min = 59) => {
  const d = new Date(Date.now() + days * day);
  d.setHours(hour, min, 0, 0);
  return d;
};

async function main() {
  await db.school.deleteMany();
  await db.systemSetting.deleteMany();
  await db.systemSetting.create({ data: { key: "setup.completedAt", value: new Date().toISOString() } });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const school = await db.school.create({
    data: {
      name: "Northfield Academy", slug: "northfield", brandColor: "#4f46e5", timezone: "UTC", academicYear: "2026–2027",
      address: "100 Northfield Avenue", phone: "+1 555 0100", email: "office@northfield.edu", website: "https://northfield.edu",
    },
  });
  const user = (email, name, role, gradeLevel) =>
    db.user.create({ data: { schoolId: school.id, email, name, role, gradeLevel, passwordHash: hash } });

  await user("admin@northfield.edu", "Grace Admin", "ADMIN");
  const tMath = await user("teacher@northfield.edu", "Daniel Reyes", "TEACHER");
  const tSci = await user("m.santos@northfield.edu", "Maria Santos", "TEACHER");
  const tEng = await user("j.cruz@northfield.edu", "James Cruz", "TEACHER");

  const studentNames = [
    "Sofia Garcia", "Liam Tan", "Ava Lim", "Noah Bautista", "Mia Flores", "Ethan Ramos",
    "Chloe Mendoza", "Lucas Aquino", "Isabella Navarro", "Mason Villanueva", "Zoe Castillo", "Leo Torres",
  ];
  const students = [await user("student@northfield.edu", studentNames[0], "STUDENT", "Grade 10")];
  for (const n of studentNames.slice(1)) {
    const email = n.toLowerCase().replace(" ", ".") + "@northfield.edu";
    students.push(await user(email, n, "STUDENT", "Grade 10"));
  }

  const courseDefs = [
    { code: "MATH-10", title: "Algebra II", color: "indigo", teacher: tMath,
      description: "Functions, quadratic equations, polynomials and an introduction to logarithms." },
    { code: "SCI-10", title: "Biology", color: "emerald", teacher: tSci,
      description: "Cells, genetics, evolution and ecosystems through hands-on investigation." },
    { code: "ENG-10", title: "English Literature", color: "rose", teacher: tEng,
      description: "Reading and writing about novels, poetry and drama from around the world." },
    { code: "HIST-10", title: "World History", color: "amber", teacher: tEng,
      description: "From ancient civilizations to the modern world, with a focus on primary sources." },
    { code: "CS-10", title: "Intro to Computer Science", color: "sky", teacher: tMath,
      description: "Problem solving, algorithms and programming fundamentals in Python." },
  ];

  for (const [ci, def] of courseDefs.entries()) {
    const course = await db.course.create({
      data: {
        schoolId: school.id, code: def.code, title: def.title, description: def.description,
        color: def.color, teacherId: def.teacher.id,
        enrollments: { create: students.map((s) => ({ userId: s.id })) },
      },
    });

    const lessonTitles = ["Welcome and course overview", "Core concepts", "Worked examples", "Practice and review", "Going further"];
    const lessons = [];
    for (const [i, t] of lessonTitles.entries()) {
      lessons.push(await db.lesson.create({
        data: {
          courseId: course.id, position: i, title: `${i + 1}. ${t}`,
          content: `## ${t}\n\nIn this lesson of ${def.title} we will cover the key ideas step by step.\n\n### Learning goals\n- Understand the main idea of this topic\n- Apply it to a short practice problem\n- Explain your reasoning to a classmate\n\n### Read\nTake 10 minutes to read through the notes below, then try the practice questions at the end.\n\nGood learning comes from small, regular practice. Take notes in your own words and ask questions in class if anything is unclear.`,
        },
      }));
    }
    // first student completed some lessons
    for (const l of lessons.slice(0, 2 + (ci % 3))) {
      await db.lessonProgress.create({ data: { userId: students[0].id, lessonId: l.id } });
    }

    const assignmentDefs = [
      { title: "Diagnostic quiz", days: -14, points: 20 },
      { title: "Problem set 1", days: -6, points: 50 },
      { title: "Unit project proposal", days: 1 + ci, points: 100 },
      { title: "Problem set 2", days: 5 + ci, points: 50 },
      { title: "Mid-unit reflection", days: 12, points: 30 },
    ];
    for (const a of assignmentDefs) {
      const asg = await db.assignment.create({
        data: {
          courseId: course.id, title: a.title, dueAt: at(a.days), points: a.points,
          instructions: `Complete the ${a.title.toLowerCase()} for ${def.title}.\n\nShow your work clearly and submit your answers in the text box. Your teacher will leave feedback after grading.`,
        },
      });
      if (a.days < 0) {
        for (const [si, s] of students.entries()) {
          if (si % 5 === 4) continue; // a few missing submissions
          const graded = a.days < -10 || si % 2 === 0;
          await db.submission.create({
            data: {
              assignmentId: asg.id, studentId: s.id, submittedAt: at(a.days - 1, 18),
              content: "Here is my completed work with explanations for each answer.",
              score: graded ? Math.round(a.points * (0.68 + ((si * 7 + ci * 3) % 30) / 100)) : null,
              feedback: graded ? "Good work — check question 3 and show every step." : null,
              gradedAt: graded ? at(a.days + 1, 10) : null,
            },
          });
        }
      }
    }

    await db.announcement.create({
      data: { courseId: course.id, authorId: def.teacher.id, createdAt: at(-1, 8, 15),
        title: "Welcome to the new unit!",
        body: `Hi everyone — the next unit of ${def.title} starts this week. Please review lesson 1 before class and bring your questions.` },
    });
    await db.announcement.create({
      data: { courseId: course.id, authorId: def.teacher.id, createdAt: at(-5, 14, 0),
        title: "Office hours moved",
        body: "Office hours this week are on Thursday, 3:00–4:00 PM in Room 204." },
    });
  }

  console.log(`Seeded ${school.name}. Demo password for all accounts: ${DEMO_PASSWORD}`);
}

main().finally(() => db.$disconnect());
