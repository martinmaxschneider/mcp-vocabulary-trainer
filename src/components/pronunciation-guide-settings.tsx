"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Volume2, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { api } from "~/trpc/client";
import {
  SOURCE_LANG,
  TARGET_LANGS,
  type LearningLangCode,
} from "~/lib/languages";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

type ItemDraft = {
  symbol: string;
  approx: string;
  explanation: string;
  exampleWord: string;
};

const emptyDraft = (): ItemDraft => ({
  symbol: "",
  approx: "",
  explanation: "",
  exampleWord: "",
});

export function PronunciationGuideSettings() {
  const t = useTranslations("pronunciation");
  const tSettings = useTranslations("settings");
  const tLang = useTranslations("languages");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();

  const defaultTarget: LearningLangCode = TARGET_LANGS[0]?.code ?? "en";
  const [activeTarget, setActiveTarget] =
    useState<LearningLangCode>(defaultTarget);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft);

  const utils = api.useUtils();
  const guideQuery = api.pronunciation.getByPair.useQuery({
    nativeLang: SOURCE_LANG.code,
    targetLang: activeTarget,
  });

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const invalidate = async () => {
    await utils.pronunciation.getByPair.invalidate({
      nativeLang: SOURCE_LANG.code,
      targetLang: activeTarget,
    });
    await utils.pronunciation.list.invalidate();
  };

  const upsertItems = api.pronunciation.upsertItems.useMutation({
    onSuccess: async () => {
      toast({ title: tToasts("pronunciationItemSaved") });
      setEditorOpen(false);
      setEditingId(null);
      setDraft(emptyDraft());
      await invalidate();
    },
    onError: (error) => {
      toast({
        title: tToasts("pronunciationSaveError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const deleteItem = api.pronunciation.deleteItem.useMutation({
    onSuccess: async () => {
      toast({ title: tToasts("pronunciationItemDeleted") });
      await invalidate();
    },
    onError: (error) => {
      toast({
        title: tToasts("pronunciationDeleteError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const deleteGuide = api.pronunciation.deleteGuide.useMutation({
    onSuccess: async () => {
      toast({ title: tToasts("pronunciationGuideDeleted") });
      await invalidate();
    },
    onError: (error) => {
      toast({
        title: tToasts("pronunciationDeleteError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const items = guideQuery.data?.items ?? [];
  const pairLabel = useMemo(
    () => `${tLang(SOURCE_LANG.code)} → ${tLang(activeTarget)}`,
    [activeTarget, tLang],
  );

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setEditorOpen(true);
  };

  const openEdit = (item: {
    id: string;
    symbol: string;
    approx: string | null;
    explanation: string;
    exampleWord: string | null;
  }) => {
    setEditingId(item.id);
    setDraft({
      symbol: item.symbol,
      approx: item.approx ?? "",
      explanation: item.explanation,
      exampleWord: item.exampleWord ?? "",
    });
    setEditorOpen(true);
  };

  const handleSave = () => {
    if (!draft.symbol.trim() || !draft.explanation.trim()) {
      toast({
        title: t("validationRequired"),
        variant: "destructive",
      });
      return;
    }
    upsertItems.mutate({
      nativeLang: SOURCE_LANG.code,
      targetLang: activeTarget,
      items: [
        {
          symbol: draft.symbol.trim(),
          approx: draft.approx.trim() || null,
          explanation: draft.explanation.trim(),
          exampleWord: draft.exampleWord.trim() || null,
        },
      ],
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          <CardTitle>{tSettings("pronunciationTitle")}</CardTitle>
        </div>
        <CardDescription>{tSettings("pronunciationDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {tSettings("pronunciationHelp", {
            native: tLang(SOURCE_LANG.code),
          })}
        </p>

        <Tabs
          value={activeTarget}
          onValueChange={(value) => setActiveTarget(value as LearningLangCode)}
        >
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            {TARGET_LANGS.map((lang) => (
              <TabsTrigger key={lang.code} value={lang.code}>
                {lang.flag} {tLang(lang.code)}
              </TabsTrigger>
            ))}
          </TabsList>

          {TARGET_LANGS.map((lang) => (
            <TabsContent
              key={lang.code}
              value={lang.code}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{pairLabel}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {t("itemCount", { count: items.length })}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="mr-1 h-4 w-4" />
                    {t("addItem")}
                  </Button>
                  {items.length > 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deleteGuide.isPending}
                        >
                          {t("clearGuide")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("clearGuideConfirmTitle")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("clearGuideConfirmDesc", { pair: pairLabel })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              deleteGuide.mutate({
                                nativeLang: SOURCE_LANG.code,
                                targetLang: activeTarget,
                              })
                            }
                          >
                            {tCommon("delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              {guideQuery.isLoading ? (
                <div className="flex items-center gap-2 py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tCommon("loading")}
                </div>
              ) : items.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {t("emptyGuide", { pair: pairLabel })}
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-lg italic">{item.symbol}</span>
                          {item.approx ? (
                            <span className="text-sm text-muted-foreground">
                              ≈ {item.approx}
                            </span>
                          ) : null}
                          {item.exampleWord ? (
                            <Badge variant="outline" className="font-normal">
                              {item.exampleWord}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.explanation}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(item)}
                          aria-label={tCommon("edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteItem.mutate({ id: item.id })}
                          disabled={deleteItem.isPending}
                          aria-label={tCommon("delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? t("editItem") : t("addItem")}
              </DialogTitle>
              <DialogDescription>
                {t("itemDialogDesc", { pair: pairLabel })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pg-symbol">{t("symbolLabel")}</Label>
                <Input
                  id="pg-symbol"
                  value={draft.symbol}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, symbol: e.target.value }))
                  }
                  placeholder={t("symbolPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-approx">
                  {t("approxLabel")} ({tCommon("optional")})
                </Label>
                <Input
                  id="pg-approx"
                  value={draft.approx}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, approx: e.target.value }))
                  }
                  placeholder={t("approxPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-explanation">{t("explanationLabel")}</Label>
                <Input
                  id="pg-explanation"
                  value={draft.explanation}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, explanation: e.target.value }))
                  }
                  placeholder={t("explanationPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-example">
                  {t("exampleLabel")} ({tCommon("optional")})
                </Label>
                <Input
                  id="pg-example"
                  value={draft.exampleWord}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, exampleWord: e.target.value }))
                  }
                  placeholder={t("examplePlaceholder")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditorOpen(false)}
                disabled={upsertItems.isPending}
              >
                {tCommon("cancel")}
              </Button>
              <Button onClick={handleSave} disabled={upsertItems.isPending}>
                {upsertItems.isPending ? tCommon("saving") : tCommon("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
