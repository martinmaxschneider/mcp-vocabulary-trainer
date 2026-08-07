"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";

type ExampleRow = {
  native: string;
  target: string;
  note?: string;
};

export default function GrammarTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("grammar");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tToasts = useTranslations("toasts");
  const tErrorCodes = useTranslations("errors.codes");
  const router = useRouter();
  const { toast } = useToast();

  const topicQuery = api.grammar.getById.useQuery({ id });
  const utils = api.useUtils();

  const deleteMutation = api.grammar.delete.useMutation({
    onSuccess: async () => {
      toast({ title: tToasts("grammarDeleted") });
      await utils.grammar.listByLang.invalidate();
      router.push("/grammar");
    },
    onError: (err) => {
      const code = resolveErrorCode(err.message);
      toast({
        title: tToasts("grammarDeleteError"),
        description: code ? tErrorCodes(code as "NOT_FOUND") : err.message,
        variant: "destructive",
      });
    },
  });

  if (topicQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (topicQuery.isError || !topicQuery.data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/grammar">
            <ArrowLeft className="h-4 w-4" />
            {tCommon("back")}
          </Link>
        </Button>
        <p className="text-muted-foreground">{tCommon("notFound")}</p>
      </div>
    );
  }

  const topic = topicQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2">
            <Link href="/grammar">
              <ArrowLeft className="h-4 w-4" />
              {tCommon("back")}
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{tLang(topic.targetLang)}</Badge>
            <Badge variant="secondary">{topic.category}</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{topic.title}</h1>
          <p className="text-muted-foreground">{topic.summary}</p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {tCommon("delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteConfirmDesc", { title: topic.title })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate({ id: topic.id })}
              >
                {tCommon("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="space-y-8">
        {topic.blocks.map((block) => {
          const examples = (block.examples as ExampleRow[] | null) ?? [];
          return (
            <section key={block.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {t(`blockType.${block.type}`)}
                </Badge>
                {block.title ? (
                  <h2 className="text-lg font-semibold">{block.title}</h2>
                ) : null}
              </div>

              {block.type === "RULE" && block.body ? (
                <p className="whitespace-pre-wrap leading-relaxed">
                  {block.body}
                </p>
              ) : null}

              {block.type === "EXAMPLES" && examples.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">
                          {t("exampleNative")}
                        </th>
                        <th className="px-3 py-2 font-medium">
                          {t("exampleTarget")}
                        </th>
                        <th className="px-3 py-2 font-medium">
                          {t("exampleNote")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {examples.map((row, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-2 align-top">{row.native}</td>
                          <td className="px-3 py-2 align-top font-medium">
                            {row.target}
                          </td>
                          <td className="px-3 py-2 align-top text-muted-foreground">
                            {row.note ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {block.type === "NOTE" && block.body ? (
                <div className="rounded-md border-l-4 border-primary/40 bg-muted/40 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {block.body}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">{t("editHint")}</p>
    </div>
  );
}
