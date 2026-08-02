"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { api } from "~/trpc/client";
import { DomainAssignment } from "~/components/domain-assignment";

export default function ProverbDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("vocabulary");
  const tCategories = useTranslations("categories");

  const { data: proverb, isLoading } = api.entry.getById.useQuery({ id });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!proverb) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="mb-4 text-muted-foreground">{t("notFoundProverb")}</p>
          <Link href="/vocabulary/proverbs/list">
            <Button variant="outline">{t("backToOverview")}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="mb-8">
        <Link href="/vocabulary/proverbs/list">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToOverview")}
          </Button>
        </Link>
        <div className="mb-4 flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary">{tCategories("proverb")}</Badge>
            </div>
            <h1 className="mb-2 text-4xl font-bold">{proverb.mainText}</h1>
            {proverb.note && (
              <p className="text-lg text-muted-foreground">{proverb.note}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("translationsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {proverb.translations.map((translation) => (
                <div
                  key={translation.id}
                  className="border-l-4 border-primary pl-4"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="outline">
                      {translation.lang.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="font-medium">{translation.text}</p>
                  {translation.example && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {translation.example}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("domainAssignmentTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DomainAssignment
              entryId={proverb.id}
              currentDomainIds={proverb.domains.map((d) => d.domainId)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
