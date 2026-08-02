import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "~/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">{t("notFoundTitle")}</h1>
      <p className="mb-6 text-muted-foreground">
        {t("notFoundDescription")}
      </p>
      <Button asChild>
        <Link href="/">{t("backToDashboard")}</Link>
      </Button>
    </div>
  );
}
