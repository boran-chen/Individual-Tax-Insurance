"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressBar } from "@/components/ui";

type JobResponse = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  progress: number;
  errorMessage: string | null;
};

export default function JobProgressWatcher({
  jobId,
  initialStatus,
  initialProgress,
}: {
  jobId: string;
  initialStatus: string;
  initialProgress: number;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobResponse>({
    id: jobId,
    status: initialStatus as JobResponse["status"],
    progress: initialProgress,
    errorMessage: null,
  });

  useEffect(() => {
    if (job.status === "SUCCEEDED" || job.status === "FAILED") return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as JobResponse;
        setJob(data);
        if (data.status === "SUCCEEDED" || data.status === "FAILED") {
          router.refresh();
        }
      } catch {
        // 等待下一次
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [job.status, jobId, router]);

  return (
    <div>
      <ProgressBar value={job.progress} />
      <div className="progress-info">
        <span>
          {job.status === "FAILED"
            ? job.errorMessage ?? "处理失败"
            : job.status === "SUCCEEDED"
              ? "处理完成"
              : "正在解析、校验并拆分数据…"}
        </span>
        <span>{job.progress}%</span>
      </div>
    </div>
  );
}
