"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">{t("pageTitle")}</h1>
      <p className="mb-6 text-muted-foreground">
        {error.message || t("unexpected")}
      </p>
      <Button onClick={reset}>{tCommon("tryAgain")}</Button>
    </div>
  );
}
