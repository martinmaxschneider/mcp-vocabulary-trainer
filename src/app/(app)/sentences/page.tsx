"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Headphones, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { SatzAudioButton } from "~/components/satz-audio-button";
import { AudioStatus } from "@prisma/client";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { useFocusLang } from "~/components/focus-lang-provider";

function SentencesPageInner() {
  const searchParams = useSearchParams();
  const domainId = searchParams.get("domainId") ?? undefined;
  const t = useTranslations("sentences");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const { focusLang } = useFocusLang();
  const [query, setQuery] = useState("");
  const utils = api.useUtils();

  const { data, isLoading } = api.satz.list.useQuery({
    query: query.trim() || undefined,
    domainId,
    limit: 100,
  });

  const deleteMutation = api.satz.delete.useMutation({
    onSuccess: () => {
      toast({ title: tToasts("satzDeleted") });
      void utils.satz.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: tToasts("satzDeleteError"),
        description: resolveErrorCode(error.message)
          ? tErrors(resolveErrorCode(error.message) as "NOT_FOUND")
          : error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="max-w-5xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/sentences/listen">
              <Headphones className="mr-2 h-4 w-4" />
              {t("listen")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sentences/import">
              <Upload className="mr-2 h-4 w-4" />
              {t("import")}
            </Link>
          </Button>
          <Button asChild>
            <Link href={domainId ? `/sentences/new?domainId=${domainId}` : "/sentences/new"}>
              <Plus className="mr-2 h-4 w-4" />
              {t("add")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-6 max-w-md">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
      ) : data?.items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyDesc")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.items.map((satz) => {
            const translation = satz.translations.find(
              (tr) => tr.lang === focusLang,
            );
            return (
              <Card key={satz.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{satz.mainText}</CardTitle>
                    {translation ? (
                      <CardDescription>{translation.text}</CardDescription>
                    ) : null}
                    {satz.trigger ? (
                      <p className="text-sm text-muted-foreground">
                        {t("triggerPrefix")}: {satz.trigger}
                      </p>
                    ) : null}
                    {satz.answerTo ? (
                      <p className="text-sm text-muted-foreground">
                        {t("answerToPrefix")}: {satz.answerTo.mainText}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {satz.domains.map((link) => (
                        <Badge key={link.id} variant="outline">
                          {link.domain.name}
                        </Badge>
                      ))}
                      {satz.linkedEntries.map((link) => (
                        <Badge key={link.id} variant="secondary">
                          {link.entry.mainText}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {translation?.audioUrl &&
                    translation.audioStatus === AudioStatus.DONE ? (
                      <SatzAudioButton
                        url={translation.audioUrl}
                        label={t("playAudio")}
                      />
                    ) : null}
                    <Button asChild size="icon" variant="ghost">
                      <Link href={`/sentences/${satz.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(t("confirmDelete"))) {
                          deleteMutation.mutate({ id: satz.id });
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  {t(`source${satz.source}`)} · {t(`priority${satz.priority}`)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SentencesPage() {
  const tCommon = useTranslations("common");
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">{tCommon("loading")}</p>}>
      <SentencesPageInner />
    </Suspense>
  );
}
