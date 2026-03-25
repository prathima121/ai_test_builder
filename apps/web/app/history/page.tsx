"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type HistoryItem = {
  id: string;
  title: string;
  totalMarks: number;
  questionCount: number;
  createdAt: string;
  isPublished: boolean;
  publishedAt: string | null;
  subject: string;
  grade: string;
  complexityLevel: "EASY" | "MEDIUM" | "HARD";
};

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [subject, setSubject] = useState("");
  const [complexity, setComplexity] = useState("");
  const [published, setPublished] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (subject.trim()) params.set("subject", subject.trim());
    if (complexity) params.set("complexity", complexity);
    if (published !== "all") params.set("published", published);

    setLoading(true);
    setError(null);

    // Retry logic: attempt up to 3 times with exponential backoff
    const maxRetries = 3;
    let lastError: string = "Unknown error";

    const fetchData = async () => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(`${API_URL}/api/tests?${params.toString()}`, {
            signal: AbortSignal.timeout(15000) // 15 second timeout
          });

          if (!res.ok) {
            throw new Error(`Server returned ${res.status}: ${res.statusText}`);
          }

          const d = await res.json();
          setItems(Array.isArray(d) ? d : []);
          setLoading(false);
          return; // Success, exit function
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Failed to fetch tests";

          if (attempt < maxRetries) {
            // Wait before retry with exponential backoff: 500ms, 1000ms, 2000ms
            await new Promise((resolve) =>
              setTimeout(resolve, Math.pow(2, attempt - 1) * 500)
            );
          }
        }
      }

      // All retries failed
      setError(`${lastError} (tried ${maxRetries} times)`);
      setLoading(false);
    };

    fetchData();
  }, [subject, complexity, published]);

  const stats = useMemo(() => {
    const publishedCount = items.filter((i) => i.isPublished).length;
    return {
      total: items.length,
      published: publishedCount,
      drafts: items.length - publishedCount
    };
  }, [items]);

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <section className="panel rounded-3xl p-6 shadow-sm">
        <p className="muted text-xs uppercase tracking-[0.24em]">Evaluator Workspace</p>
        <h1 className="mt-2 text-3xl font-semibold">Published Test History</h1>
        <p className="muted mt-1">Filter and review generated papers with publish state tracking.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="panel rounded-2xl p-4"><p className="muted text-xs">Total tests</p><p className="mt-1 text-2xl font-semibold">{stats.total}</p></div>
        <div className="panel rounded-2xl p-4"><p className="muted text-xs">Published</p><p className="mt-1 text-2xl font-semibold">{stats.published}</p></div>
        <div className="panel rounded-2xl p-4"><p className="muted text-xs">Drafts</p><p className="mt-1 text-2xl font-semibold">{stats.drafts}</p></div>
      </section>

      {error ? <section className="panel rounded-2xl p-4 border-red-200 bg-red-50"><p className="text-sm text-red-700">{error}</p></section> : null}

      <section className="panel rounded-3xl p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <input className="form-input" placeholder="Filter by subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <select className="form-input" value={complexity} onChange={(e) => setComplexity(e.target.value)}>
            <option value="">All complexity</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
          <select className="form-input" value={published} onChange={(e) => setPublished(e.target.value)}>
            <option value="all">All states</option>
            <option value="true">Published only</option>
            <option value="false">Draft only</option>
          </select>
          <Link href="/" className="rounded-xl border px-4 py-2 text-center">Create New Test</Link>
        </div>
      </section>

      <section className="panel rounded-3xl p-3 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left muted">
                <th className="p-3">Title</th>
                <th className="p-3">Subject</th>
                <th className="p-3">Complexity</th>
                <th className="p-3">Questions</th>
                <th className="p-3">State</th>
                <th className="p-3">Created</th>
                <th className="p-3">Open</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-300/40">
                  <td className="p-3">{item.title}</td>
                  <td className="p-3">{item.subject} ({item.grade})</td>
                  <td className="p-3">{item.complexityLevel}</td>
                  <td className="p-3">{item.questionCount}</td>
                  <td className="p-3">{item.isPublished ? "Published" : "Draft"}</td>
                  <td className="p-3">{new Date(item.createdAt).toLocaleDateString()}</td>
                  <td className="p-3"><Link href={`/tests/${item.id}`} className="text-ocean underline">Preview</Link></td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="p-6 muted" colSpan={7}>No tests found for current filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
