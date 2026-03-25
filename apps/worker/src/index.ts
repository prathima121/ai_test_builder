import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import OpenAI from "openai";
import { PrismaClient } from "../../../node_modules/.prisma/client";
import { questionOutputSchema, QuestionOutput } from "@aitb/shared";

const prisma = new PrismaClient();
const redisConnection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL
});

function fallbackQuestion(topicName: string, difficulty: "EASY" | "MEDIUM" | "HARD", index: number): QuestionOutput {
  return {
    topicName,
    questionText: `(${difficulty}) ${topicName}: Which option best describes the core concept for slot ${index + 1}?`,
    options: [
      `${topicName} is unrelated to the syllabus`,
      `${topicName} refers to the targeted concept under study`,
      `${topicName} can never be applied`,
      `${topicName} has no educational value`
    ],
    correctAnswer: `${topicName} refers to the targeted concept under study`,
    explanation: `The correct choice identifies the syllabus concept directly and matches ${difficulty} intent.`,
    difficulty,
    marks: difficulty === "HARD" ? 4 : difficulty === "MEDIUM" ? 3 : 2,
    questionType: "MCQ"
  };
}

function validateQuestion(q: QuestionOutput, topicName: string): string[] {
  const issues: string[] = [];
  if (!q.options.includes(q.correctAnswer)) {
    issues.push("correct answer must match one option");
  }

  const unique = new Set(q.options.map((o) => o.toLowerCase().trim()));
  if (unique.size !== q.options.length) {
    issues.push("options must be unique");
  }

  if (!q.questionText.toLowerCase().includes(topicName.toLowerCase())) {
    issues.push("question not clearly tied to topic");
  }

  return issues;
}

async function generateQuestionSlot(args: {
  runId: string;
  topicName: string;
  learningObjective: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  questionType: "MCQ" | "MAQ";
  index: number;
}): Promise<QuestionOutput> {
  const system = "You generate valid exam questions in strict JSON only.";
  const user = `Create one ${args.questionType} question for topic '${args.topicName}' aligned to '${args.learningObjective}' at ${args.difficulty} difficulty. Return JSON keys exactly: topicName, questionText, options (array of 4), correctAnswer, explanation, difficulty, marks, questionType.`;

  if (!process.env.OPENAI_API_KEY) {
    return fallbackQuestion(args.topicName, args.difficulty, args.index);
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.4,
      response_format: { type: "json_object" }
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = questionOutputSchema.parse(JSON.parse(raw));
    const issues = validateQuestion(parsed, args.topicName);
    if (issues.length > 0) {
      return fallbackQuestion(args.topicName, args.difficulty, args.index);
    }

    await prisma.auditLog.create({
      data: {
        runId: args.runId,
        modelName: process.env.OPENAI_MODEL || "openai/gpt-4o-mini",
        promptVersion: "v1",
        tokenUsage: response.usage?.total_tokens || 0
      }
    });

    return parsed;
  } catch {
    return fallbackQuestion(args.topicName, args.difficulty, args.index);
  }
}

new Worker(
  "generation",
  async (job) => {
    if (job.name === "generate-test") {
      const runId: string = job.data.runId;
      const run = await prisma.testGenerationRun.findUnique({
        where: { id: runId },
        include: {
          syllabus: {
            include: { topics: true }
          }
        }
      });

      if (!run) {
        throw new Error("Run not found");
      }

      await prisma.testGenerationRun.update({
        where: { id: run.id },
        data: { status: "RUNNING", startedAt: new Date() }
      });

      const questions: QuestionOutput[] = [];
      const topics = run.syllabus.topics;
      const count = run.requestedQuestionCount;

      for (let i = 0; i < count; i += 1) {
        const topic = topics[i % topics.length];
        const generated = await generateQuestionSlot({
          runId: run.id,
          topicName: topic.topicName,
          learningObjective: topic.learningObjective,
          difficulty: run.complexityLevel,
          questionType: run.questionType,
          index: i
        });
        questions.push(generated);
      }

      const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

      const test = await prisma.generatedTest.create({
        data: {
          runId: run.id,
          title: `${run.syllabus.subject} - ${run.complexityLevel} Generated Test`,
          totalMarks,
          durationMinutes: Math.max(30, count * 3)
        }
      });

      for (let i = 0; i < questions.length; i += 1) {
        const q = questions[i];
        const topic = topics.find((t: { topicName: string }) => t.topicName === q.topicName) || topics[i % topics.length];
        await prisma.generatedQuestion.create({
          data: {
            testId: test.id,
            topicId: topic.id,
            questionText: q.questionText,
            questionType: q.questionType,
            optionsJson: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: q.difficulty,
            marks: q.marks
          }
        });
      }

      await prisma.testGenerationRun.update({
        where: { id: run.id },
        data: { status: "COMPLETED", finishedAt: new Date() }
      });
    }

    if (job.name === "regenerate-question") {
      const questionId: string = job.data.questionId;
      const existing = await prisma.generatedQuestion.findUnique({
        where: { id: questionId },
        include: { topic: true }
      });
      if (!existing) {
        return;
      }

      const replacement = fallbackQuestion(existing.topic.topicName, existing.difficulty, 0);
      await prisma.generatedQuestion.update({
        where: { id: questionId },
        data: {
          questionText: replacement.questionText,
          optionsJson: replacement.options,
          correctAnswer: replacement.correctAnswer,
          explanation: replacement.explanation,
          marks: replacement.marks
        }
      });
    }
  },
  { connection: redisConnection }
);

console.log("Worker started: generation queue");
