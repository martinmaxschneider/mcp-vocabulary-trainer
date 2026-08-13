import { getTranslations } from "next-intl/server";
import { WorksheetList } from "~/components/worksheets/worksheet-list";

export default async function WorksheetsPage() {
  const t = await getTranslations("worksheets");

  return (
    <>
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <WorksheetList />
    </>
  );
}
