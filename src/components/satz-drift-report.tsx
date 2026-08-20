"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Flag, Loader2 } from "lucide-react";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useToast } from "~/hooks/use-toast";
import { drainAudioQueue } from "~/lib/process-audio-queue";

export type SatzDriftApplied = {
  fix: "SOURCE" | "TRANSLATION";
  newText: string;
  translationId?: string;
  audioRequested: boolean;
};

export function SatzDriftReport({
  satzId,
  targetLang,
  onApplied,
}: {
  satzId: string;
  targetLang: string;
  onApplied?: (result: SatzDriftApplied) => void;
}) {
  const t = useTranslations("sentences");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const analyzeDrift = api.satz.analyzeDrift.useMutation();
  const applyDrift = api.satz.applyDriftFix.useMutation();
  const processAudio = api.satz.processAudio.useMutation();
  const result = analyzeDrift.data;

  const close = () => {
    setOpen(false);
    analyzeDrift.reset();
  };

  const apply = async () => {
    if (!result?.hasDrift || !result.fix || !result.newText) return;
    try {
      const res = await applyDrift.mutateAsync({
        satzId,
        side: result.fix,
        newText: result.newText,
        translationId: result.translationId,
      });
      close();
      toast({ title: tToasts("satzDriftApplied") });
      onApplied?.({
        fix: result.fix,
        newText: result.newText,
        translationId: result.translationId,
        audioRequested: res.audioRequested,
      });
      if (res.audioRequested) {
        void drainAudioQueue((limit) => processAudio.mutateAsync({ limit }));
      }
    } catch {
      toast({ title: tToasts("satzDriftError"), variant: "destructive" });
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full border-[#1e3a5f]/20 text-[#1e3a5f]"
        onClick={() => {
          setOpen(true);
          analyzeDrift.mutate({ satzId, targetLang });
        }}
      >
        <Flag className="mr-2 h-4 w-4" />
        {t("driftReport")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("driftDialogTitle")}</DialogTitle>
            <DialogDescription>{t("driftDialogDesc")}</DialogDescription>
          </DialogHeader>

          {analyzeDrift.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("driftAnalyzing")}
            </div>
          ) : analyzeDrift.isError ? (
            <p className="text-sm text-destructive">{tToasts("satzDriftError")}</p>
          ) : result ? (
            result.hasDrift && result.newText ? (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">{result.reason}</p>
                <p className="font-medium">
                  {result.fix === "SOURCE"
                    ? t("driftFixSource")
                    : t("driftFixTranslation")}
                </p>
                <div className="space-y-1">
                  <p className="text-muted-foreground line-through">
                    {result.fix === "SOURCE"
                      ? result.mainText
                      : result.translationText}
                  </p>
                  <p className="font-semibold">{result.newText}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="font-medium">{t("driftNone")}</p>
                <p className="text-muted-foreground">{result.reason}</p>
              </div>
            )
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {tCommon("cancel")}
            </Button>
            {result?.hasDrift && result.newText ? (
              <Button onClick={() => void apply()} disabled={applyDrift.isPending}>
                {applyDrift.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t("driftApply")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
