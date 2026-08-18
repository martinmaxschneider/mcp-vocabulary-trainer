"use client";

import { useParams } from "next/navigation";
import { SatzImportReview } from "~/components/satz-import-review";

export default function SentenceImportBatchPage() {
  const params = useParams<{ id: string }>();
  return <SatzImportReview batchId={params.id} />;
}
