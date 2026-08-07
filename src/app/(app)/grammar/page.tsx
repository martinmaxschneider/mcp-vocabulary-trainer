import { getTranslations } from "next-intl/server";
import { GrammarBrowser } from "~/components/grammar-browser";

export default async function GrammarPage() {
  const t = await getTranslations("grammar");

  return (
    <>
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <GrammarBrowser />
    </>
  );
}
