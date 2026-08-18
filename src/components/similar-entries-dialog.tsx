"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Loader2 } from "lucide-react";

export type SimilarEntryCandidate = {
  id: string;
  mainText: string;
  score: number;
  llmMatch?: boolean;
};

export function SimilarEntriesDialog({
  open,
  onOpenChange,
  candidates,
  confirming,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: SimilarEntryCandidate[];
  confirming?: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("similarEntries");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="cahier-section max-h-64 space-y-2 overflow-y-auto">
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              className="cahier-item flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{candidate.mainText}</div>
                {candidate.llmMatch ? (
                  <div className="text-xs text-muted-foreground">
                    {t("llmMatch")}
                  </div>
                ) : null}
              </div>
              <Badge variant={candidate.llmMatch ? "default" : "outline"}>
                {t("score", {
                  percent: Math.round(candidate.score * 100),
                })}
              </Badge>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirming}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {confirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("confirm")}
              </>
            ) : (
              t("confirm")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
