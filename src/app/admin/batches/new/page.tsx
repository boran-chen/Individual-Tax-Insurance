import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { IconChevronLeft } from "@/components/icons";
import UploadWizard from "./UploadWizard";

export const dynamic = "force-dynamic";

export default function NewBatchPage() {
  return (
    <div>
      <PageHeader
        title="新建上传"
        description="上传人资提供的月度佣金总表，确认月份与字段后生成批次。"
        actions={
          <Link className="btn btn-secondary" href="/admin">
            <IconChevronLeft width={16} height={16} />
            返回批次总览
          </Link>
        }
      />
      <UploadWizard />
    </div>
  );
}
