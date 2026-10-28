import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import {
  getAggregationForSubmission,
  getDiffPage,
  getDiffTypeStats,
  getSubmissionForUser,
} from "@/lib/services/return-service";
import { getBatchById } from "@/lib/services/batch-service";
import ReturnDetailView from "@/components/ReturnDetailView";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProvinceReturnDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("PROVINCE");
  const { id } = await params;
  const search = await searchParams;
  const page = Math.max(1, Number(first(search.page) ?? "1") || 1);
  const type = first(search.type) ?? "";
  const db = getDb();

  const submission = (() => {
    try {
      return getSubmissionForUser(db, user, id);
    } catch {
      notFound();
    }
  })();

  const batch = getBatchById(db, submission.batch_id);
  if (!batch) notFound();

  const org = db
    .prepare("SELECT name FROM organizations WHERE id = ?")
    .get(submission.org_id) as { name: string } | undefined;

  return (
    <ReturnDetailView
      batch={{ month: batch.month, version: batch.version }}
      orgName={org?.name ?? submission.org_id}
      submission={submission}
      diffStats={getDiffTypeStats(db, id)}
      diffs={getDiffPage(db, id, page, 50, type || null)}
      page={page}
      pageSize={50}
      filterType={type}
      makeHref={(nextPage, nextType) => {
        const query = new URLSearchParams({ page: String(nextPage) });
        if (nextType) query.set("type", nextType);
        return `/province/returns/${id}?${query.toString()}`;
      }}
      backHref={`/province/returns?batchId=${submission.batch_id}&orgId=${submission.org_id}`}
      aggregation={getAggregationForSubmission(db, id)}
    />
  );
}
