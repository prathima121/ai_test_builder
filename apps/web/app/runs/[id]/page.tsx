"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type RunResponse = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  errorMessage: string | null;
  test: { id: string } | null;
};

export default function RunStatusPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<RunResponse | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`${API_URL}/api/generation-runs/${params.id}`);
      if (res.ok) {
        const data: RunResponse = await res.json();
        setRun(data);
        if (data.status === "COMPLETED" && data.test?.id) {
          router.push(`/tests/${data.test.id}`);
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [params.id, router]);

  const progress = useMemo(() => {
    if (!run) return 10;
    if (run.status === "QUEUED") return 20;
    if (run.status === "RUNNING") return 60;
    if (run.status === "COMPLETED") return 100;
    return 100;
  }, [run]);

  return (
    <main className="mx-auto max-w-2xl panel rounded-3xl p-8 shadow-sm">
      <p className="muted text-xs uppercase tracking-[0.22em]">Async Pipeline</p>
      <h1 className="mt-2 text-2xl font-bold">Generation Status</h1>
      <p className="muted mt-2 break-all text-sm">Run ID: {params.id}</p>

      <div className="mt-6 h-4 w-full rounded-full bg-slate-200/60">
        <div className="h-4 rounded-full bg-ocean transition-all" style={{ width: `${progress}%` }} />
      </div>

      <p className="mt-4 font-medium">Current state: {run?.status || "LOADING"}</p>
      <p className="muted mt-1 text-sm">This page auto-refreshes while your paper is being assembled.</p>
      {run?.errorMessage ? <p className="text-red-600 mt-2">{run.errorMessage}</p> : null}
    </main>
  );
}
