import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { createGenerationRunSchema, createSyllabusSchema } from "@aitb/shared";
import { prisma } from "./lib/prisma";
import { enqueueGenerationJob, initGenerationQueue } from "./lib/queue";

const app = express();
app.use(cors());
app.use(express.json());

initGenerationQueue();

const exportDir = path.join(process.cwd(), "exports");
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}
app.use("/exports", express.static(exportDir));

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function drawPdfFrame(doc: PDFKit.PDFDocument, title: string, page: number) {
  const cursorX = doc.x;
  const cursorY = doc.y;

  // Outer border
  doc
    .save()
    .lineWidth(0.5)
    .strokeColor("#cbd5e1")
    .rect(28, 28, doc.page.width - 56, doc.page.height - 56)
    .stroke()
    .restore();

  // Header
  doc
    .fontSize(8)
    .fillColor("#64748b")
    .text("AI Test Builder | Generated Assessment", 42, 38, { lineBreak: false });

  // Footer
  doc
    .fontSize(8)
    .fillColor("#64748b")
    .text(`Page ${page}`, 0, doc.page.height - 42, { align: "center", lineBreak: false });

  // Restore text flow so frame drawing does not affect content layout.
  doc.x = cursorX;
  doc.y = cursorY;
}

async function createPdfExport(testId: string) {
  const test = await prisma.generatedTest.findUnique({
    where: { id: testId },
    include: {
      questions: {
        include: { topic: true }
      },
      run: {
        include: {
          syllabus: true
        }
      }
    }
  });

  if (!test) {
    throw new Error("Test not found");
  }

  const stamp = Date.now();
  const fileName = `${slugify(test.title || test.id)}-${stamp}.pdf`;
  const filePath = path.join(exportDir, fileName);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4", compress: false });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    let page = 1;
    drawPdfFrame(doc, test.title || "Generated Test", page);
    doc.on("pageAdded", () => {
      page += 1;
      drawPdfFrame(doc, test.title || "Generated Test", page);
    });

    doc.fontSize(20).fillColor("#0f172a").text(test.title || "Generated Test", { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#64748b").text("Assessment Package", { align: "center" });
    doc.moveDown(1);

    const metaBoxY = doc.y;
    doc
      .roundedRect(50, metaBoxY, doc.page.width - 100, 95, 4)
      .fillColor("#f0f4f8")
      .fill()
      .strokeColor("#cbd5e1")
      .lineWidth(0.5)
      .stroke();
    doc.fillColor("#0f172a").fontSize(10);
    const metaTextY = metaBoxY + 14;
    doc.text("Institution: ____________________________", 68, metaTextY, { lineBreak: false });
    doc.text("Instructor: ____________________________", 68, metaTextY + 18, { lineBreak: false });
    doc.text("Academic Term: _________________________", 68, metaTextY + 36, { lineBreak: false });
    doc.text("Date: _________________________________", 68, metaTextY + 54, { lineBreak: false });
    doc.x = 50;
    doc.y = metaBoxY + 110;

    doc.fontSize(9).fillColor("#334155");
    doc.text(`Subject: ${test.run.syllabus.subject}`);
    doc.text(`Grade: ${test.run.syllabus.grade}`);
    doc.text(`Duration: ${test.durationMinutes} minutes`);
    doc.text(`Total marks: ${test.totalMarks}`);
    doc.moveDown(1);

    test.questions.forEach((q: any, idx: number) => {
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
      }
      doc.fontSize(11).fillColor("#0f172a").text(`Q${idx + 1}. (${q.topic.topicName}) ${q.questionText}`);
      doc.moveDown(0.3).fontSize(9).fillColor("#334155");

      const options = Array.isArray(q.optionsJson) ? (q.optionsJson as string[]) : [];
      options.forEach((option, i) => {
        const label = String.fromCharCode(65 + i);
        doc.text(`  ${label}. ${option}`);
      });

      doc
        .moveDown(0.3)
        .fontSize(9)
        .fillColor("#0f172a")
        .text(`Answer: ${q.correctAnswer}`)
        .moveDown(0.1)
        .fillColor("#475569")
        .fontSize(8)
        .text(`Explanation: ${q.explanation}`)
        .moveDown(0.6);
    });

    if (doc.y > doc.page.height - 150) {
      doc.addPage();
    }

    doc.moveDown(1.5);
    doc
      .fontSize(10)
      .fillColor("#0f172a")
      .text("Evaluator Sign-off");
    doc.moveDown(0.8).fontSize(9);
    doc.text("Reviewed by: __________________________");
    doc.text("Signature: ____________________________");
    doc.text("Date: _________________________________");

    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  return `/exports/${fileName}`;
}

async function createJsonExport(testId: string) {
  const test = await prisma.generatedTest.findUnique({
    where: { id: testId },
    include: {
      questions: {
        include: { topic: true }
      },
      run: {
        include: {
          syllabus: true
        }
      }
    }
  });

  if (!test) {
    throw new Error("Test not found");
  }

  const stamp = Date.now();
  const fileName = `${slugify(test.title || test.id)}-${stamp}.json`;
  const filePath = path.join(exportDir, fileName);
  await fsp.writeFile(filePath, JSON.stringify(test, null, 2), "utf-8");
  return `/exports/${fileName}`;
}

async function fallbackGenerateRun(runId: string) {
  const run = await prisma.testGenerationRun.findUnique({
    where: { id: runId },
    include: {
      syllabus: {
        include: { topics: true }
      }
    }
  });

  if (!run) return;

  await prisma.testGenerationRun.update({
    where: { id: run.id },
    data: { status: "RUNNING", startedAt: new Date() }
  });

  const topicCount = run.syllabus.topics.length;
  if (topicCount === 0) {
    await prisma.testGenerationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: "No topics found for syllabus", finishedAt: new Date() }
    });
    return;
  }

  const totalMarks = run.requestedQuestionCount * 2;
  const test = await prisma.generatedTest.create({
    data: {
      runId: run.id,
      title: `${run.syllabus.subject} - ${run.complexityLevel} Generated Test`,
      totalMarks,
      durationMinutes: Math.max(30, run.requestedQuestionCount * 3)
    }
  });

  for (let i = 0; i < run.requestedQuestionCount; i += 1) {
    const topic = run.syllabus.topics[i % topicCount];
    const options = [
      `${topic.topicName} is unrelated to this syllabus`,
      `${topic.topicName} represents the target concept for this question`,
      `${topic.topicName} is only historical and not applicable`,
      `${topic.topicName} cannot be explained with examples`
    ];

    await prisma.generatedQuestion.create({
      data: {
        testId: test.id,
        topicId: topic.id,
        questionText: `${topic.topicName}: Which statement best matches the learning objective '${topic.learningObjective}'?`,
        questionType: run.questionType,
        optionsJson: options,
        correctAnswer: options[1],
        explanation: "The correct option directly aligns with the topic objective and required concept.",
        difficulty: run.complexityLevel,
        marks: 2
      }
    });
  }

  await prisma.testGenerationRun.update({
    where: { id: run.id },
    data: { status: "COMPLETED", finishedAt: new Date() }
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/syllabi", async (req, res) => {
  const parsed = createSyllabusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  let user = await prisma.user.findUnique({ where: { email: "demo@teacher.ai" } });
  if (!user) {
    user = await prisma.user.create({
      data: { name: "Demo Teacher", email: "demo@teacher.ai" }
    });
  }

  const syllabus = await prisma.syllabus.create({
    data: {
      userId: user.id,
      title: parsed.data.title,
      rawText: parsed.data.rawText,
      grade: parsed.data.grade,
      subject: parsed.data.subject,
      topics: {
        create: parsed.data.topics.map((t) => ({
          topicName: t.topicName,
          weight: t.weight,
          learningObjective: t.learningObjective
        }))
      }
    },
    include: { topics: true }
  });

  return res.status(201).json(syllabus);
});

app.post("/api/generation-runs", async (req, res) => {
  const parsed = createGenerationRunSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const syllabus = await prisma.syllabus.findUnique({
    where: { id: parsed.data.syllabusId }
  });
  if (!syllabus) {
    return res.status(404).json({ error: "Syllabus not found" });
  }

  const run = await prisma.testGenerationRun.create({
    data: {
      syllabusId: parsed.data.syllabusId,
      complexityLevel: parsed.data.complexityLevel,
      requestedQuestionCount: parsed.data.questionCount,
      questionType: parsed.data.questionType,
      status: "QUEUED"
    }
  });

  const enqueued = await enqueueGenerationJob("generate-test", { runId: run.id });
  if (!enqueued) {
    await fallbackGenerateRun(run.id);
  }

  const refreshedRun = await prisma.testGenerationRun.findUnique({ where: { id: run.id } });
  return res.status(202).json({ runId: run.id, status: refreshedRun?.status || run.status, queueMode: enqueued ? "redis" : "fallback" });
});

app.get("/api/generation-runs/:id", async (req, res) => {
  const run = await prisma.testGenerationRun.findUnique({
    where: { id: req.params.id },
    include: {
      test: {
        include: {
          questions: true
        }
      }
    }
  });

  if (!run) {
    return res.status(404).json({ error: "Run not found" });
  }

  return res.json(run);
});

app.get("/api/tests/:id", async (req, res) => {
  const test = await prisma.generatedTest.findUnique({
    where: { id: req.params.id },
    include: {
      questions: {
        include: {
          topic: true
        }
      },
      run: {
        include: {
          syllabus: {
            include: {
              topics: true
            }
          }
        }
      }
    }
  });

  if (!test) {
    return res.status(404).json({ error: "Test not found" });
  }

  return res.json(test);
});

app.get("/api/tests", async (req, res) => {
  const published = req.query.published;
  const subject = String(req.query.subject || "").trim();
  const complexity = String(req.query.complexity || "").trim();

  const tests = await prisma.generatedTest.findMany({
    include: {
      run: {
        include: {
          syllabus: true
        }
      },
      questions: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const filtered = tests.filter((test: any) => {
    if (published === "true" && !test.isPublished) return false;
    if (published === "false" && test.isPublished) return false;
    if (subject && !test.run.syllabus.subject.toLowerCase().includes(subject.toLowerCase())) return false;
    if (complexity && test.run.complexityLevel !== complexity) return false;
    return true;
  });

  return res.json(
    filtered.map((test: any) => ({
      id: test.id,
      title: test.title,
      totalMarks: test.totalMarks,
      questionCount: test.questions.length,
      createdAt: test.createdAt,
      isPublished: test.isPublished,
      publishedAt: test.publishedAt,
      subject: test.run.syllabus.subject,
      grade: test.run.syllabus.grade,
      complexityLevel: test.run.complexityLevel
    }))
  );
});

app.post("/api/tests/:id/publish", async (req, res) => {
  const test = await prisma.generatedTest.findUnique({ where: { id: req.params.id } });
  if (!test) {
    return res.status(404).json({ error: "Test not found" });
  }

  const actor = String(req.body?.publishedBy || "Demo Teacher");
  const published = await prisma.generatedTest.update({
    where: { id: test.id },
    data: {
      isPublished: true,
      publishedAt: new Date(),
      publishedBy: actor
    }
  });

  return res.json({
    id: published.id,
    isPublished: published.isPublished,
    publishedAt: published.publishedAt,
    publishedBy: published.publishedBy
  });
});

app.post("/api/tests/:id/regenerate-question/:questionId", async (req, res) => {
  const question = await prisma.generatedQuestion.findFirst({
    where: {
      id: req.params.questionId,
      testId: req.params.id
    },
    include: {
      topic: true,
      test: {
        include: {
          run: true
        }
      }
    }
  });

  if (!question) {
    return res.status(404).json({ error: "Question not found" });
  }

  const enqueued = await enqueueGenerationJob("regenerate-question", {
    questionId: question.id,
    testId: question.testId,
    runId: question.test.runId
  });

  if (!enqueued) {
    const options = [
      `${question.topic.topicName} is unrelated to this syllabus`,
      `${question.topic.topicName} represents the target concept for this question`,
      `${question.topic.topicName} is only historical and not applicable`,
      `${question.topic.topicName} cannot be explained with examples`
    ];

    await prisma.generatedQuestion.update({
      where: { id: question.id },
      data: {
        questionText: `${question.topic.topicName}: Which statement best matches the learning objective '${question.topic.learningObjective}'?`,
        optionsJson: options,
        correctAnswer: options[1],
        explanation: "Regenerated in fallback mode due to queue unavailability."
      }
    });
  }

  return res.status(202).json({ status: enqueued ? "QUEUED" : "COMPLETED", queueMode: enqueued ? "redis" : "fallback" });
});

app.get("/api/tests/:id/export", async (req, res) => {
  try {
    const format = String(req.query.format || "json").toLowerCase();
    const test = await prisma.generatedTest.findUnique({ where: { id: req.params.id } });
    if (!test) {
      return res.status(404).json({ error: "Test not found" });
    }

    if (format !== "pdf" && format !== "json") {
      return res.status(400).json({ error: "Unsupported format. Use pdf or json." });
    }

    const relativePath = format === "pdf" ? await createPdfExport(test.id) : await createJsonExport(test.id);
    const host = `${req.protocol}://${req.get("host")}`;

    const exportRec = await prisma.testExport.create({
      data: {
        testId: test.id,
        format,
        fileUrl: `${host}${relativePath}`
      }
    });

    return res.json(exportRec);
  } catch (error) {
    console.error("[EXPORT_ERROR]", error);
    return res.status(500).json({ error: "Export failed" });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
