"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { SatzListen } from "~/components/satz-listen";

export default function SentenceListenPage() {
  const tCommon = useTranslations("common");
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">{tCommon("loading")}</p>}
    >
      <SatzListen />
    </Suspense>
  );
}
