import { getTranslations } from "next-intl/server";
import { DomainList } from "~/components/domain-list";

export default async function DomainsPage() {
  const t = await getTranslations("domains");

  return (
    <>
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <DomainList />
    </>
  );
}
