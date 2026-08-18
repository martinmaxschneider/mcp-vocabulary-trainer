"use client";

import { use } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SatzRegister } from "@prisma/client";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { emptySatzFormValues, SatzForm } from "~/components/satz-form";
import { TARGET_LANGS } from "~/lib/languages";

export default function EditSentencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("sentences");
  const tCommon = useTranslations("common");
  const { data, isLoading } = api.satz.getById.useQuery({ id });

  const translations = Object.fromEntries(
    TARGET_LANGS.map((lang) => {
      const match = data?.translations.find((tr) => tr.lang === lang.code);
      return [
        lang.code,
        {
          text: match?.text ?? "",
          register: match?.register ?? SatzRegister.INFORMAL,
          audioUrl: match?.audioUrl,
          audioStatus: match?.audioStatus,
        },
      ];
    }),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/sentences">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon("back")}
        </Button>
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle")}</CardTitle>
          <CardDescription>{t("editDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
          ) : (
            <SatzForm
              mode="edit"
              initial={{
                ...emptySatzFormValues(),
                id: data.id,
                mainText: data.mainText,
                trigger: data.trigger ?? "",
                source: data.source,
                priority: data.priority,
                shadowingStatus: data.shadowingStatus,
                domainIds: data.domains.map((d) => d.domainId),
                linkedEntries: data.linkedEntries.map((link) => ({
                  id: link.entry.id,
                  mainText: link.entry.mainText,
                })),
                grammarTopicIds: data.grammarTopics.map((g) => g.grammarTopicId),
                translations,
                answerTo: data.answerTo,
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
