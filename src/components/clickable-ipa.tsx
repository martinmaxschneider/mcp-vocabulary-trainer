"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { segmentIpa } from "~/lib/ipa-segments";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Volume2 } from "lucide-react";

export type PronunciationGuideItemView = {
  id: string;
  symbol: string;
  approx: string | null;
  explanation: string;
  exampleWord: string | null;
};

type ClickableIpaProps = {
  ipa: string;
  items: PronunciationGuideItemView[];
  className?: string;
  /** Show button to open full guide list */
  showFullListButton?: boolean;
  targetLangName?: string;
};

export function ClickableIpa({
  ipa,
  items,
  className,
  showFullListButton = false,
  targetLangName,
}: ClickableIpaProps) {
  const t = useTranslations("pronunciation");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const segments = useMemo(
    () => segmentIpa(ipa, items.map((i) => ({ id: i.id, symbol: i.symbol }))),
    [ipa, items],
  );

  const byId = useMemo(
    () => Object.fromEntries(items.map((i) => [i.id, i])),
    [items],
  );

  const selected = selectedId ? byId[selectedId] : null;

  return (
    <div className="space-y-2">
      <p className={className ?? "mt-1.5 text-lg italic tracking-wide text-foreground/80"}>
        {segments.map((seg, index) =>
          seg.itemId ? (
            <button
              key={`${seg.text}-${index}`}
              type="button"
              className="rounded px-0.5 underline decoration-dotted underline-offset-4 hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={() => setSelectedId(seg.itemId!)}
              title={t("tapForExplanation")}
            >
              {seg.text}
            </button>
          ) : (
            <span key={`${seg.text}-${index}`}>{seg.text}</span>
          ),
        )}
      </p>

      {showFullListButton ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setListOpen(true)}
        >
          <Volume2 className="mr-1.5 h-4 w-4" />
          {t("openGuide")}
          {targetLangName ? ` (${targetLangName})` : ""}
        </Button>
      ) : null}

      <Dialog
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-2xl italic">
              {selected?.symbol}
              {selected?.approx ? (
                <span className="ml-2 text-base font-normal not-italic text-muted-foreground">
                  ≈ {selected.approx}
                </span>
              ) : null}
            </DialogTitle>
            <DialogDescription className="text-base text-foreground">
              {selected?.explanation}
            </DialogDescription>
          </DialogHeader>
          {selected?.exampleWord ? (
            <p className="text-sm text-muted-foreground">
              {t("exampleLabel")}:{" "}
              <span className="font-medium text-foreground">
                {selected.exampleWord}
              </span>
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("guideTitle")}
              {targetLangName ? ` — ${targetLangName}` : ""}
            </DialogTitle>
            <DialogDescription>{t("guideSubtitle")}</DialogDescription>
          </DialogHeader>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyGuideShort")}</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-lg italic">{item.symbol}</span>
                    {item.approx ? (
                      <span className="text-sm text-muted-foreground">
                        ≈ {item.approx}
                      </span>
                    ) : null}
                    {item.exampleWord ? (
                      <span className="text-xs text-muted-foreground">
                        ({item.exampleWord})
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm">{item.explanation}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
