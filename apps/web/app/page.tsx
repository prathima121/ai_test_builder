"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type TopicInput = {
  id: string;
  topicName: string;
  weight: number;
  learningObjective: string;
};

function makeTopic(seed: number): TopicInput {
  return {
    id: `topic-${seed}`,
    topicName: "",
    weight: 20,
    learningObjective: ""
  };
}

export default function HomePage() {
  const [title, setTitle] = useState("Midterm Unit Test");
  const [subject, setSubject] = useState("Physics");
  const [grade, setGrade] = useState("Grade 10");
  const [rawText, setRawText] = useState("Motion, force, and energy");
  const [complexityLevel, setComplexityLevel] = useState("MEDIUM");
  const [questionCount, setQuestionCount] = useState(10);
  const [questionType, setQuestionType] = useState("MCQ");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [topics, setTopics] = useState<TopicInput[]>([
    { id: "topic-1", topicName: "Newton's Laws", weight: 30, learningObjective: "Apply laws to real scenarios" },
    { id: "topic-2", topicName: "Kinematics", weight: 30, learningObjective: "Solve displacement and velocity problems" },
    { id: "topic-3", topicName: "Work and Energy", weight: 40, learningObjective: "Relate work done to energy changes" }
  ]);

  const canSubmit = useMemo(() => {
    const hasCoreFields = title.trim() && subject.trim() && grade.trim() && rawText.trim();
    const hasValidTopics = topics.every((t) => t.topicName.trim() && t.learningObjective.trim() && t.weight > 0);
    return Boolean(hasCoreFields && hasValidTopics);
  }, [title, subject, grade, rawText, topics]);

  const totalWeight = useMemo(() => topics.reduce((sum, topic) => sum + (Number.isFinite(topic.weight) ? topic.weight : 0), 0), [topics]);
  const filledTopics = useMemo(() => topics.filter((t) => t.topicName.trim() && t.learningObjective.trim()).length, [topics]);
  const readiness = useMemo(() => {
    let score = 0;
    if (title.trim()) score += 15;
    if (subject.trim()) score += 15;
    if (grade.trim()) score += 10;
    if (rawText.trim().length > 20) score += 20;
    score += Math.min(30, filledTopics * 10);
    if (totalWeight >= 90 && totalWeight <= 110) score += 10;
    return Math.min(100, score);
  }, [title, subject, grade, rawText, filledTopics, totalWeight]);

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    try {
      const syllabusRes = await fetch(`${API_URL}/api/syllabi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subject,
          grade,
          rawText,
          topics: topics.map(({ id: _id, ...rest }) => rest)
        })
      });
      if (!syllabusRes.ok) throw new Error("Failed to create syllabus");
      const syllabus = await syllabusRes.json();

      const runRes = await fetch(`${API_URL}/api/generation-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syllabusId: syllabus.id,
          complexityLevel,
          questionCount,
          questionType
        })
      });
      if (!runRes.ok) throw new Error("Failed to start generation run");
      const run = await runRes.json();
      router.push(`/runs/${run.runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function updateTopic(id: string, patch: Partial<TopicInput>) {
    setTopics((prev) => prev.map((topic) => (topic.id === id ? { ...topic, ...patch } : topic)));
  }

  function addTopic() {
    setTopics((prev) => [...prev, makeTopic(prev.length + 1)]);
  }

  function removeTopic(id: string) {
    setTopics((prev) => (prev.length > 1 ? prev.filter((topic) => topic.id !== id) : prev));
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8">
      <header className="panel relative overflow-hidden rounded-3xl px-6 py-8 shadow-lg md:px-10">
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-sky-100 blur-2xl" />
        <p className="muted text-xs uppercase tracking-[0.25em]">Assessment Studio</p>
        <h1 className="gradient-title mt-2 text-3xl font-semibold md:text-4xl">Build Professional Tests In Minutes</h1>
        <p className="muted mt-3 max-w-2xl text-sm md:text-base">
          Enter your syllabus, set complexity, and generate quality question papers with answer keys using the async AI pipeline.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="chip">Async generation</span>
          <span className="chip">Complexity aware</span>
          <span className="chip">PDF export ready</span>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="panel rounded-3xl p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-semibold">Syllabus Details</h2>
          <p className="muted mt-1 text-sm">Define core test metadata and provide source syllabus content.</p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="form-label">Test title</span>
              <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Midterm Unit Test" />
            </label>
            <label className="space-y-2">
              <span className="form-label">Subject</span>
              <input className="form-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Physics" />
            </label>
            <label className="space-y-2">
              <span className="form-label">Grade / Level</span>
              <input className="form-input" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade 10" />
            </label>
            <label className="space-y-2">
              <span className="form-label">Question count</span>
              <input
                type="number"
                min={1}
                max={30}
                className="form-input"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
              />
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="form-label">Syllabus content</span>
            <textarea
              className="form-input min-h-32"
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste or type syllabus text here"
            />
          </label>
        </div>

        <div className="panel rounded-3xl p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-semibold">Generation Settings</h2>
          <p className="muted mt-1 text-sm">Tune cognitive complexity and question style.</p>

          <div className="mt-5 space-y-4">
            <label className="space-y-2 block">
              <span className="form-label">Complexity level</span>
              <select className="form-input" value={complexityLevel} onChange={(e) => setComplexityLevel(e.target.value)}>
                <option value="EASY">Easy: recall and direct application</option>
                <option value="MEDIUM">Medium: multi-step concept use</option>
                <option value="HARD">Hard: scenario and synthesis</option>
              </select>
            </label>
            <label className="space-y-2 block">
              <span className="form-label">Question type</span>
              <select className="form-input" value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
                <option value="MCQ">MCQ - Multiple Choice</option>
                <option value="MAQ">MAQ - Multiple Answer</option>
              </select>
            </label>
            <div className="panel rounded-2xl p-4 text-sm muted">
              Each run is queued asynchronously. You can track progress and preview generated questions as soon as processing finishes.
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.45fr_0.8fr]">
      <div className="panel rounded-3xl p-6 shadow-sm md:p-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Topic Blueprint</h2>
            <p className="muted mt-1 text-sm">List learning outcomes and weight distribution for generation slots.</p>
          </div>
          <button
            type="button"
            onClick={addTopic}
            className="rounded-xl border border-ocean/25 bg-ocean/10 px-4 py-2 text-sm font-medium text-ocean hover:bg-ocean/15"
          >
            Add topic
          </button>
        </div>

        <div className="space-y-4">
          {topics.map((topic) => (
            <div className="panel grid gap-3 rounded-2xl p-4 md:grid-cols-[1fr_120px_1fr_auto]" key={topic.id}>
              <input
                className="form-input"
                value={topic.topicName}
                onChange={(e) => updateTopic(topic.id, { topicName: e.target.value })}
                placeholder="Topic name"
              />
              <input
                type="number"
                min={1}
                max={100}
                className="form-input"
                value={topic.weight}
                onChange={(e) => updateTopic(topic.id, { weight: Number(e.target.value) })}
                placeholder="Weight"
              />
              <input
                className="form-input"
                value={topic.learningObjective}
                onChange={(e) => updateTopic(topic.id, { learningObjective: e.target.value })}
                placeholder="Learning objective"
              />
              <button
                type="button"
                onClick={() => removeTopic(topic.id)}
                disabled={topics.length === 1}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <aside className="panel rounded-3xl p-6 shadow-sm md:p-8">
        <h3 className="text-lg font-semibold">Blueprint Insights</h3>
        <p className="muted mt-1 text-sm">Evaluator-friendly checks before generating your test.</p>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-3 py-2">
            <span className="text-sm">Readiness score</span>
            <strong>{readiness}%</strong>
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <span className="text-sm">Topics configured</span>
            <strong>{filledTopics}/{topics.length}</strong>
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <span className="text-sm">Weight distribution</span>
            <strong>{totalWeight}%</strong>
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <span className="text-sm">Expected duration</span>
            <strong>{Math.max(30, questionCount * 3)} min</strong>
          </div>
        </div>

        <div className="mt-4 text-xs muted">
          Tip: keep topic weights close to 100% for balanced coverage.
        </div>
      </aside>
      </section>

      <section className="flex flex-wrap items-center gap-4">
        <button
          onClick={handleGenerate}
          disabled={!canSubmit || loading}
          className="rounded-xl bg-ocean px-6 py-3 font-medium text-white shadow-sm transition hover:bg-[#1659bb] disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate Test"}
        </button>
        <p className="muted text-sm">Estimated processing time: 20-60 seconds for 10 questions.</p>
        <Link href="/history" className="rounded-xl border px-4 py-2 text-sm">View Published History</Link>
        {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
      </section>
    </main>
  );
}
