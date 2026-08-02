"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { TARGET_LANGS } from "~/lib/languages";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { DomainAssignment } from "~/components/domain-assignment";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { ArrowLeft, Pencil, Trash2, Loader2 } from "lucide-react";

export default function NounDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("vocabulary");
  const tCommon = useTranslations("common");
  const tCategories = useTranslations("categories");
  const tLang = useTranslations("languages");
  const tToasts = useTranslations("toasts");
  const tEntries = useTranslations("entries");
  const tErrorCodes = useTranslations("errors.codes");
  const router = useRouter();
  const { toast } = useToast();

  const { data: noun, isLoading, refetch } = api.entry.getById.useQuery({ id });

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrorCodes(code as "NOT_FOUND") : message;
  };

  const deleteMutation = api.entry.delete.useMutation({
    onSuccess: () => {
      toast({
        title: tToasts("nounDeleted"),
      });
      router.push("/vocabulary/nouns/list");
    },
    onError: (error) => {
      toast({
        title: tToasts("entryDeleteError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    if (confirm(tCommon("confirmDelete", { name: noun?.mainText ?? "" }))) {
      deleteMutation.mutate({ id });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!noun) {
    return (
      <div className="max-w-5xl">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t("notFoundNoun")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <Link href="/vocabulary/nouns/list">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToNouns")}
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <h1 className="text-4xl font-bold">{noun.mainText}</h1>
              <Badge variant="outline">{tCategories("noun")}</Badge>
            </div>
            {noun.note && (
              <p className="text-muted-foreground">{noun.note}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Link href={`/entries/${noun.id}/edit`}>
              <Button variant="outline">
                <Pencil className="mr-2 h-4 w-4" />
                {tCommon("edit")}
              </Button>
            </Link>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {tCommon("delete")}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("translationsTitle")}</CardTitle>
            <CardDescription>{t("translationsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {noun.translations.map((translation) => {
                const lang = TARGET_LANGS.find(
                  (l) => l.code === translation.lang
                );
                return (
                  <div key={translation.id} className="rounded-lg border p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-2xl">{lang?.flag}</span>
                      <span className="font-semibold">
                        {tLang(
                          translation.lang
                        )}
                      </span>
                    </div>
                    <p className="mb-1 text-lg font-medium">{translation.text}</p>
                    {translation.example && (
                      <p className="text-sm text-muted-foreground">
                        {tEntries("examplePrefix")} {translation.example}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <DomainAssignment
          entryId={noun.id}
          currentDomainIds={(noun.domains ?? []).map((d) => d.domainId)}
          onUpdate={() => void refetch()}
        />
      </div>
    </div>
  );
}
