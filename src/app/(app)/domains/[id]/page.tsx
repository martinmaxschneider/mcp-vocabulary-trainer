"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { ArrowLeft, Plus, Trash2, Pencil } from "lucide-react";
import { useToast } from "~/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { resolveErrorCode } from "~/lib/trpc-error";

export default function DomainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("domains");
  const tCategories = useTranslations("categories");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "WORD" | "PROVERB">(
    "ALL"
  );

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const entryTypeLabel = (type: "WORD" | "PROVERB") =>
    type === "WORD"
      ? tCategories("entryTypeWord")
      : tCategories("entryTypeProverb");

  const { data: domains } = api.domain.list.useQuery();
  const domainMeta = domains?.find((d) => d.id === id);

  const { data, refetch } = api.entry.list.useQuery({
    domainId: id,
    type: typeFilter === "ALL" ? undefined : typeFilter,
  });

  const deleteMutation = api.entry.delete.useMutation({
    onSuccess: () => {
      toast({ title: tToasts("entryDeleted") });
      void refetch();
    },
    onError: (error) => {
      toast({
        title: tToasts("entryDeleteError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const handleDelete = (entryId: string, entryName: string) => {
    if (confirm(tCommon("confirmDelete", { name: entryName }))) {
      deleteMutation.mutate({ id: entryId });
    }
  };

  const handleEdit = (entryId: string) => {
    router.push(`/entries/${entryId}/edit`);
  };

  const entries = data?.entries ?? [];
  const domainName = domainMeta?.name ?? t("detailDefaultName");

  return (
    <>
      <div className="mb-8">
        <Link href="/domains">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back")}
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">{domainName}</h1>
            <p className="text-muted-foreground">
              {t("entries", { count: entries.length })}
            </p>
          </div>
          <div className="flex gap-2">
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as "ALL" | "WORD" | "PROVERB")
              }
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("filterAllTypes")}</SelectItem>
                <SelectItem value="WORD">{t("filterWords")}</SelectItem>
                <SelectItem value="PROVERB">{t("filterProverbs")}</SelectItem>
              </SelectContent>
            </Select>
            <Link href={`/entries/new?domainId=${id}`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("addEntry")}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">{t("emptyDomain")}</p>
            <Link href={`/entries/new?domainId=${id}`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("addFirstEntry")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <Card key={entry.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">
                        {entryTypeLabel(entry.type)}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">{entry.mainText}</CardTitle>
                    {entry.note && (
                      <CardDescription className="mt-2">
                        {entry.note}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(entry.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(entry.id, entry.mainText)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("translationsLabel")}
                  </p>
                  {entry.translations.map((translation) => (
                    <div
                      key={translation.id}
                      className="text-sm p-2 rounded-lg bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {translation.lang.toUpperCase()}
                        </Badge>
                        <span className="font-medium">{translation.text}</span>
                      </div>
                      {translation.example && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {translation.example}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
