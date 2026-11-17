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
  await db.emailTemplate.deleteMany();
  await db.jobLog.deleteMany();
  await db.systemSetting.create({ data: { key: "setup.completedAt", value: new Date().toISOString() } });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const school = await db.school.create({
    data: {
      name: "Northfield Academy", slug: "northfield", brandColor: "#4f46e5", timezone: "UTC", academicYear: "2026–2027",
      address: "100 Northfield Avenue", phone: "+1 555 0100", email: "office@northfield.edu", website: "https://northfield.edu",
      gradeWeights: { assignment: 40, quiz: 30, exam: 30 },
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
        joinCode: ["MATH24", "BIO7QK", "ENG3XW", "HIS8MP", "CSP2NT"][ci],
        enrollments: { create: students.map((s) => ({ userId: s.id })) },
      },
    });
    const topic = ["Algebra", "Cell_(biology)", "Creative_writing", "World_history", "Computer_science"][ci];
    const week1 = await db.module.create({
      data: {
        courseId: course.id, position: 0, title: "Week 1: Getting started",
        description: `## This week\n- Read the course overview and the reference article below\n- Work through lessons 1 and 2\n- Take the check-in quiz (you can try it more than once)\n- Hand in the diagnostic and problem set 1`,
        materials: { create: [{ title: `Reference: ${topic.replace(/_/g, " ").replace(/\s*\(.*\)/, "")}`, kind: "LINK", format: "other", url: `https://en.wikipedia.org/wiki/${topic}`, position: 0 }] },
      },
    });
    const week2 = await db.module.create({
      data: {
        courseId: course.id, position: 1, title: "Week 2: Practice and review",
        description: `## This week\n- Lessons 3 to 5\n- Start your unit project proposal\n- The unit exam opens later this week: 30 minutes, one attempt`,
      },
    });

    const lessonTitles = ["Welcome and course overview", "Core concepts", "Worked examples", "Practice and review", "Going further"];
    const lessons = [];
    for (const [i, t] of lessonTitles.entries()) {
      lessons.push(await db.lesson.create({
        data: {
          courseId: course.id, moduleId: i < 2 ? week1.id : week2.id, position: i, title: `${i + 1}. ${t}`,
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
    for (const [ai, a] of assignmentDefs.entries()) {
      const asg = await db.assignment.create({
        data: {
          courseId: course.id, moduleId: ai < 2 ? week1.id : week2.id, title: a.title, dueAt: at(a.days), points: a.points,
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

    // A practice quiz (marked automatically) and a timed exam
    const quiz = await db.quiz.create({
      data: {
        courseId: course.id, moduleId: week1.id, kind: "QUIZ", title: "Week 1 check-in", published: true,
        description: "Five minutes, three questions. Try it as many times as you like; your best score counts.",
        maxAttempts: 0, closesAt: at(3 + ci), showResults: "IMMEDIATE",
        questions: {
          create: [
            { position: 0, type: "SINGLE", points: 1, prompt: `Which of these best describes what ${def.title} is about?`,
              options: [{ id: "a", text: def.description, correct: true }, { id: "b", text: "Memorising facts without understanding them", correct: false }, { id: "c", text: "Only taking tests", correct: false }],
              explanation: "The course overview in lesson 1 explains this." },
            { position: 1, type: "TRUE_FALSE", points: 1, prompt: "Regular, short practice helps you learn better than cramming.",
              options: [{ id: "true", text: "True", correct: true }, { id: "false", text: "False", correct: false }] },
            { position: 2, type: "SHORT", points: 2, prompt: "Which lesson number is the course overview?", answers: ["1", "one", "lesson 1"] },
          ],
        },
      },
      include: { questions: true },
    });
    if (ci < 3) {
      const [q1, q2, q3] = quiz.questions.sort((x, y) => x.position - y.position);
      await db.quizAttempt.create({
        data: {
          quizId: quiz.id, studentId: students[0].id, startedAt: at(-1, 16), submittedAt: at(-1, 16, 6),
          answers: { [q1.id]: "a", [q2.id]: "true", [q3.id]: ci === 0 ? "1" : "2" },
          awarded: { [q1.id]: 1, [q2.id]: 1, [q3.id]: ci === 0 ? 2 : 0 },
          questionOrder: [q1.id, q2.id, q3.id], score: ci === 0 ? 4 : 2, maxScore: 4,
        },
      });
    }
    await db.quiz.create({
      data: {
        courseId: course.id, moduleId: week2.id, kind: "EXAM", title: "Unit 1 exam", published: true,
        description: "30 minutes, one attempt. Stay on the page until you submit.",
        timeLimitMin: 30, maxAttempts: 1, opensAt: at(4 + ci, 9, 0), closesAt: at(4 + ci, 17, 0), showResults: "SCORE_ONLY", shuffleQuestions: true,
        questions: {
          create: [
            { position: 0, type: "MULTIPLE", points: 2, prompt: "Which of these are good study habits? Choose all that apply.",
              options: [{ id: "a", text: "Taking notes in your own words", correct: true }, { id: "b", text: "Asking questions when stuck", correct: true }, { id: "c", text: "Skipping practice problems", correct: false }] },
            { position: 1, type: "ESSAY", points: 5, prompt: `In a short paragraph, explain one idea from ${def.title} you found interesting and why.` },
          ],
        },
      },
    });
    if (ci === 0) {
      await db.event.create({
        data: { schoolId: school.id, courseId: course.id, createdById: def.teacher.id, title: "Study group in the library", location: "Library, Room 2", startsAt: at(2, 15, 0), endsAt: at(2, 16, 0) },
      });
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

  // A parent with two children
  const parent = await user("parent@northfield.edu", "Rosa Garcia", "PARENT");
  await db.parentLink.createMany({ data: [{ parentId: parent.id, studentId: students[0].id }, { parentId: parent.id, studentId: students[1].id }] });

  // Grading periods around today
  const q1Start = new Date(Date.now() - 70 * day);
  const q2Start = new Date(Date.now() + 10 * day);
  await db.gradingPeriod.createMany({
    data: [
      { schoolId: school.id, name: "Quarter 1", startsAt: q1Start, endsAt: new Date(q2Start.getTime() - day) },
      { schoolId: school.id, name: "Quarter 2", startsAt: q2Start, endsAt: new Date(q2Start.getTime() + 70 * day) },
    ],
  });

  // Attendance for the last 10 weekdays in every course
  const courses = await db.course.findMany({ where: { schoolId: school.id }, select: { id: true, teacherId: true } });
  const days = [];
  for (let i = 1; days.length < 10; i++) {
    const d = new Date(Date.now() - i * day);
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
  }
  const rows = [];
  for (const [ci, c] of courses.entries()) {
    for (const [di, date] of days.entries()) {
      for (const [si, st] of students.entries()) {
        const r = (si * 7 + di * 3 + ci) % 23;
        const status = r === 0 ? "ABSENT" : r === 5 ? "LATE" : r === 11 && si % 4 === 0 ? "EXCUSED" : "PRESENT";
        rows.push({ courseId: c.id, studentId: st.id, date, status, recordedById: c.teacherId });
      }
    }
  }
  await db.attendance.createMany({ data: rows });

  // A rubric on each "Unit project proposal"
  await db.assignment.updateMany({
    where: { title: "Unit project proposal", course: { schoolId: school.id } },
    data: {
      points: 16,
      rubric: [
        { id: "c1", title: "Clear goal", levels: [{ id: "c1a", label: "Excellent", points: 4, description: "Specific and realistic" }, { id: "c1b", label: "Good", points: 3, description: "" }, { id: "c1c", label: "Developing", points: 2, description: "" }, { id: "c1d", label: "Beginning", points: 1, description: "Unclear" }] },
        { id: "c2", title: "Research and sources", levels: [{ id: "c2a", label: "Excellent", points: 4, description: "3+ reliable sources" }, { id: "c2b", label: "Good", points: 3, description: "" }, { id: "c2c", label: "Developing", points: 2, description: "" }, { id: "c2d", label: "Beginning", points: 1, description: "" }] },
        { id: "c3", title: "Plan and timeline", levels: [{ id: "c3a", label: "Excellent", points: 4, description: "" }, { id: "c3b", label: "Good", points: 3, description: "" }, { id: "c3c", label: "Developing", points: 2, description: "" }, { id: "c3d", label: "Beginning", points: 1, description: "" }] },
        { id: "c4", title: "Writing", levels: [{ id: "c4a", label: "Excellent", points: 4, description: "" }, { id: "c4b", label: "Good", points: 3, description: "" }, { id: "c4c", label: "Developing", points: 2, description: "" }, { id: "c4d", label: "Beginning", points: 1, description: "" }] },
      ],
    },
  });

  // Question bank
  await db.bankQuestion.createMany({
    data: [
      { schoolId: school.id, ownerId: tMath.id, category: "Algebra", type: "SINGLE", points: 1, prompt: "What is the value of x if 2x + 6 = 14?", options: [{ id: "a", text: "4", correct: true }, { id: "b", text: "8", correct: false }, { id: "c", text: "10", correct: false }] },
      { schoolId: school.id, ownerId: tMath.id, category: "Algebra", type: "TRUE_FALSE", points: 1, prompt: "The graph of y = x² is a parabola.", options: [{ id: "true", text: "True", correct: true }, { id: "false", text: "False", correct: false }] },
      { schoolId: school.id, ownerId: tMath.id, category: "Algebra", type: "SHORT", points: 2, prompt: "Factor: x² − 9", answers: ["(x-3)(x+3)", "(x+3)(x-3)", "(x - 3)(x + 3)", "(x + 3)(x - 3)"] },
      { schoolId: school.id, ownerId: tSci.id, category: "Biology", type: "SINGLE", points: 1, prompt: "Which part of the cell contains the genetic material?", options: [{ id: "a", text: "Nucleus", correct: true }, { id: "b", text: "Cell wall", correct: false }, { id: "c", text: "Ribosome", correct: false }] },
      { schoolId: school.id, ownerId: tSci.id, category: "Biology", type: "MULTIPLE", points: 2, prompt: "Which of these are needed for photosynthesis?", options: [{ id: "a", text: "Sunlight", correct: true }, { id: "b", text: "Carbon dioxide", correct: true }, { id: "c", text: "Salt", correct: false }] },
    ],
  });

  const foundation = at(10);
  foundation.setHours(0, 0, 0, 0);
  await db.event.create({
    data: { schoolId: school.id, title: "Foundation Day (no classes)", allDay: true, startsAt: foundation, description: "School celebration. Families are welcome from 9 AM." },
  });

  console.log(`Seeded ${school.name}. Demo password for all accounts: ${DEMO_PASSWORD} (parent: parent@northfield.edu)`);
}

main().finally(() => db.$disconnect());
