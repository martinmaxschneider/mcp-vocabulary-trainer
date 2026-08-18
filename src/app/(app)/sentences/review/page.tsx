"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { SatzReview } from "~/components/satz-review";

export default function SentenceReviewPage() {
  const tCommon = useTranslations("common");
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">{tCommon("loading")}</p>}
    >
      <SatzReview />
    </Suspense>
  );
}
