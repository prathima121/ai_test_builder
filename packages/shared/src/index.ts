import { z } from "zod";

export const complexitySchema = z.enum(["EASY", "MEDIUM", "HARD"]);
export const questionTypeSchema = z.enum(["MCQ", "MAQ"]);

export const createSyllabusSchema = z.object({
  title: z.string().min(1),
  subject: z.string().min(1),
  grade: z.string().min(1),
  rawText: z.string().min(1),
  topics: z.array(
    z.object({
      topicName: z.string().min(1),
      weight: z.number().int().min(1).max(100).default(10),
      learningObjective: z.string().min(1)
    })
  ).min(1)
});

export const createGenerationRunSchema = z.object({
  syllabusId: z.string().uuid(),
  complexityLevel: complexitySchema,
  questionCount: z.number().int().min(1).max(100),
  questionType: questionTypeSchema
});

export const questionOutputSchema = z.object({
  topicName: z.string(),
  questionText: z.string(),
  options: z.array(z.string()).length(4),
  correctAnswer: z.string(),
  explanation: z.string(),
  difficulty: complexitySchema,
  marks: z.number().int().min(1).max(20),
  questionType: questionTypeSchema
});

export type CreateSyllabusInput = z.infer<typeof createSyllabusSchema>;
export type CreateGenerationRunInput = z.infer<typeof createGenerationRunSchema>;
export type QuestionOutput = z.infer<typeof questionOutputSchema>;
