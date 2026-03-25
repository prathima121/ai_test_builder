"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Question = {
  id: string;
  questionText: string;
  optionsJson: string[];
  correctAnswer: string;
  explanation: string;
  marks: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topic: { topicName: string };
};

type TestResponse = {
  id: string;
  title: string;
  totalMarks: number;
  durationMinutes: number;
  isPublished: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  questions: Question[];
  run: {
    complexityLevel: "EASY" | "MEDIUM" | "HARD";
    syllabus: {
      topics: Array<{ topicName: string; weight: number }>;
    };
  };
};

export default function TestPreviewPage() {
  const params = useParams<{ id: string }>();
  const [test, setTest] = useState<TestResponse | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "json" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/tests/${params.id}`)
      .then((r) => r.json())
      .then((d) => setTest(d));
  }, [params.id]);

  const grouped = useMemo(() => {
    if (!test) return {} as Record<string, Question[]>;
    return test.questions.reduce<Record<string, Question[]>>((acc, q) => {
      const key = q.topic.topicName;
      if (!acc[key]) acc[key] = [];
      acc[key].push(q);
      return acc;
    }, {});
  }, [test]);

  const insight = useMemo(() => {
    if (!test) {
      return {
        topics: 0,
        avgMarks: 0,
        byDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
        total: 0,
        difficultyBalance: 0,
        generatedByTopic: {} as Record<string, number>,
        targetByTopic: {} as Record<string, number>
      };
    }
    const topics = new Set(test.questions.map((q) => q.topic.topicName)).size;
    const avgMarks = test.questions.length ? (test.questions.reduce((sum, q) => sum + q.marks, 0) / test.questions.length).toFixed(1) : "0";
    const byDifficulty = test.questions.reduce(
      (acc, q) => {
        acc[q.difficulty] += 1;
        return acc;
      },
      { EASY: 0, MEDIUM: 0, HARD: 0 }
    );
    const total = test.questions.length || 1;
    const difficultyBalance = Math.round(((byDifficulty.MEDIUM * 100) + (byDifficulty.HARD * 120) + (byDifficulty.EASY * 70)) / total);
    const generatedByTopic = test.questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.topic.topicName] = (acc[q.topic.topicName] || 0) + 1;
      return acc;
    }, {});
    const targetByTopic = test.run.syllabus.topics.reduce<Record<string, number>>((acc, t) => {
      acc[t.topicName] = Math.max(1, Math.round((t.weight / 100) * total));
      return acc;
    }, {});
    return { topics, avgMarks, byDifficulty, total: test.questions.length, difficultyBalance, generatedByTopic, targetByTopic };
  }, [test]);

  async function handlePublish() {
    if (!test || test.isPublished) return;
    setPublishing(true);
    setPublishError(null);
    
    // Retry logic: attempt up to 3 times with exponential backoff
    const maxRetries = 3;
    let lastError: string = "Unknown error";
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(`${API_URL}/api/tests/${test.id}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publishedBy: "Demo Teacher" }),
          signal: AbortSignal.timeout(15000) // 15 second timeout
        });
        
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}: ${res.statusText}`);
        }
        
        const updated = await res.json();
        setTest((prev) => (prev ? { ...prev, ...updated } : prev));
        setPublishing(false);
        return; // Success, exit function
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Publish failed";
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff: 500ms, 1000ms, 2000ms
          await new Promise((resolve) => 
            setTimeout(resolve, Math.pow(2, attempt - 1) * 500)
          );
        }
      }
    }
    
    // All retries failed
    setPublishError(`${lastError} (tried ${maxRetries} times)`);
    setPublishing(false);
  }

  async function handleExport(format: "pdf" | "json") {
    if (!test) return;
    setExportError(null);
    setExporting(format);
    
    // Retry logic: attempt up to 3 times with exponential backoff
    const maxRetries = 3;
    let lastError: string = "Unknown error";
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(`${API_URL}/api/tests/${test.id}/export?format=${format}`, {
          signal: AbortSignal.timeout(15000) // 15 second timeout
        });
        
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}: ${res.statusText}`);
        }
        
        const payload = await res.json();
        const url = payload?.fileUrl;
        if (!url) {
          throw new Error("Export file URL missing in response");
        }
        
        window.open(url, "_blank", "noopener,noreferrer");
        return; // Success, exit function
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Export failed";
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff: 500ms, 1000ms, 2000ms
          await new Promise((resolve) => 
            setTimeout(resolve, Math.pow(2, attempt - 1) * 500)
          );
        }
      }
    }
    
    // All retries failed
    setExportError(`${lastError} (tried ${maxRetries} times)`);
    setExporting(null);
  }

  if (!test) {
    return <main className="mx-auto max-w-3xl">Loading test...</main>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <section className="panel rounded-3xl p-6 shadow-sm overflow-hidden">
        <h1 className="text-2xl font-bold">{test.title}</h1>
        <p className="muted mt-1">Total marks: {test.totalMarks} | Duration: {test.durationMinutes} minutes</p>
        {test.isPublished ? (
          <p className="mt-2 text-sm text-emerald-600">Published by {test.publishedBy || "N/A"} on {test.publishedAt ? new Date(test.publishedAt).toLocaleString() : "N/A"}</p>
        ) : (
          <p className="muted mt-2 text-sm">Draft mode: publish this paper to include it in evaluator history.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => setShowAnswers((v) => !v)} className="rounded bg-ocean px-4 py-2 text-white">
            {showAnswers ? "Hide Answers" : "Show Answers"}
          </button>
          <button
            onClick={handlePublish}
            disabled={test.isPublished || publishing}
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
          >
            {test.isPublished ? "Published" : publishing ? "Publishing..." : "Publish Test"}
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null}
            className="rounded bg-mint px-4 py-2 text-white disabled:opacity-60"
          >
            {exporting === "pdf" ? "Exporting PDF..." : "Export PDF"}
          </button>
          <button
            onClick={() => handleExport("json")}
            disabled={exporting !== null}
            className="rounded border px-4 py-2 disabled:opacity-60"
          >
            {exporting === "json" ? "Exporting JSON..." : "Export JSON"}
          </button>
          <Link href="/history" className="rounded border px-4 py-2">Open History</Link>
        </div>
        {publishError ? <p className="mt-3 text-sm text-red-600">{publishError}</p> : null}
        {exportError ? <p className="mt-3 text-sm text-red-600">{exportError}</p> : null}
      </section>

      <section className="panel rounded-3xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Quality Insights</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border p-3">
            <p className="muted text-xs">Topic coverage</p>
            <p className="mt-1 text-xl font-semibold">{insight.topics}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="muted text-xs">Avg marks / question</p>
            <p className="mt-1 text-xl font-semibold">{insight.avgMarks}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="muted text-xs">Difficulty spread</p>
            <p className="mt-1 text-sm">E:{insight.byDifficulty.EASY} M:{insight.byDifficulty.MEDIUM} H:{insight.byDifficulty.HARD}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="muted text-xs">Questions</p>
            <p className="mt-1 text-xl font-semibold">{insight.total}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="muted text-xs">Difficulty Gauge</p>
            <div
              className="mx-auto mt-2 h-16 w-16 rounded-full"
              style={{
                background: `conic-gradient(#22c55e 0 ${Math.min(100, insight.difficultyBalance)}%, #cbd5e1 ${Math.min(100, insight.difficultyBalance)}% 100%)`
              }}
            >
              <div className="mx-auto mt-2 h-12 w-12 rounded-full panel text-center text-xs leading-[3rem]">{insight.difficultyBalance}</div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold">Coverage Chart (Target vs Generated)</h3>
          <div className="mt-3 space-y-3">
            {Object.keys(insight.targetByTopic).map((topicName) => {
              const target = insight.targetByTopic[topicName] || 0;
              const generated = insight.generatedByTopic[topicName] || 0;
              const ratio = target > 0 ? Math.min(100, Math.round((generated / target) * 100)) : 0;
              return (
                <div key={topicName}>
                  <div className="mb-1 flex items-start justify-between gap-3 text-xs">
                    <span className="min-w-0 break-words">{topicName}</span>
                    <span className="muted shrink-0 text-right">target {target} | generated {generated}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200/60">
                    <div className="h-2 rounded-full bg-ocean" style={{ width: `${ratio}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {Object.entries(grouped).map(([topicName, questions]) => (
        <section key={topicName} className="panel rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-3">{topicName}</h2>
          <div className="space-y-6">
            {questions.map((q, idx) => (
              <article key={q.id} className="border-l-4 border-ocean pl-4">
                <p className="font-medium">Q{idx + 1}. {q.questionText} ({q.marks} marks)</p>
                <ul className="mt-2 list-disc pl-5 muted">
                  {q.optionsJson.map((opt) => (
                    <li key={opt}>{opt}</li>
                  ))}
                </ul>
                {showAnswers ? (
                  <div className="panel mt-2 rounded p-3 text-sm">
                    <p><strong>Answer:</strong> {q.correctAnswer}</p>
                    <p><strong>Explanation:</strong> {q.explanation}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
