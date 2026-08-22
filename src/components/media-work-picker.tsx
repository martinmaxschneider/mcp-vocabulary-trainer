"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MediaKind } from "@prisma/client";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { MEDIA_KINDS, type MediaKindName } from "~/lib/media-work";
import { Loader2, Plus, X } from "lucide-react";

export type MediaWorkSummary = {
  id: string;
  kind: MediaKind;
  title: string;
  creator: string | null;
  year: number | null;
  url: string | null;
};

const NONE = "__none__";

export function mediaWorkLabel(
  work: Pick<MediaWorkSummary, "kind" | "title" | "creator">,
  kindLabel: (kind: MediaKindName) => string,
) {
  const kind = kindLabel(work.kind);
  return work.creator ? `${kind} · ${work.title} (${work.creator})` : `${kind} · ${work.title}`;
}

export function MediaWorkPicker({
  value,
  onChange,
  disabled,
}: {
  value: MediaWorkSummary | null;
  onChange: (next: MediaWorkSummary | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("sentences");
  const [kind, setKind] = useState<MediaKind | typeof NONE>(value?.kind ?? NONE);
  const [title, setTitle] = useState(value?.title ?? "");
  const [creator, setCreator] = useState(value?.creator ?? "");
  const [url, setUrl] = useState(value?.url ?? "");
  const [year, setYear] = useState(value?.year ? String(value.year) : "");

  const kindFilter = kind === NONE ? undefined : kind;
  const listQuery = api.mediaWork.list.useQuery(
    {
      kind: kindFilter,
      query: title.trim() || undefined,
      limit: 8,
    },
    { enabled: !disabled },
  );
  const ensureMutation = api.mediaWork.ensure.useMutation({
    onSuccess: (work) => {
      onChange({
        id: work.id,
        kind: work.kind,
        title: work.title,
        creator: work.creator,
        year: work.year,
        url: work.url,
      });
      setKind(work.kind);
      setTitle(work.title);
      setCreator(work.creator ?? "");
      setUrl(work.url ?? "");
      setYear(work.year ? String(work.year) : "");
    },
  });

  const matches = useMemo(
    () => (listQuery.data?.items ?? []).filter((item) => item.id !== value?.id),
    [listQuery.data?.items, value?.id],
  );

  const kindLabel = (next: MediaKindName) => t(`mediaKind${next}`);

  const handleKindChange = (next: string) => {
    if (next === NONE) {
      setKind(NONE);
      onChange(null);
      return;
    }
    setKind(next as MediaKind);
    if (value) onChange(null);
  };

  const handleCreate = () => {
    if (kind === NONE || !title.trim()) return;
    const parsedYear = year.trim() ? Number(year.trim()) : null;
    ensureMutation.mutate({
      kind,
      title: title.trim(),
      creator: creator.trim() || null,
      url: url.trim() || null,
      year:
        parsedYear && Number.isInteger(parsedYear) && parsedYear >= 1000
          ? parsedYear
          : null,
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">{t("mediaLabel")}</h3>
        <p className="text-sm text-muted-foreground">{t("mediaHint")}</p>
      </div>
      {value ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            {mediaWorkLabel(value, kindLabel)}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(null);
                setKind(NONE);
                setTitle("");
                setCreator("");
                setUrl("");
                setYear("");
              }}
              aria-label={t("mediaClear")}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("mediaKindLabel")}</Label>
          <Select value={kind} onValueChange={handleKindChange} disabled={disabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("mediaNone")}</SelectItem>
              {MEDIA_KINDS.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`mediaKind${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("mediaTitleLabel")}</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("mediaSearchPlaceholder")}
            disabled={disabled || kind === NONE}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("mediaCreatorLabel")}</Label>
          <Input
            value={creator}
            onChange={(e) => setCreator(e.target.value)}
            placeholder={t("mediaCreatorPlaceholder")}
            disabled={disabled || kind === NONE}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("mediaUrlLabel")}</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("mediaUrlPlaceholder")}
            disabled={disabled || kind === NONE}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("mediaYearLabel")}</Label>
          <Input
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2001"
            disabled={disabled || kind === NONE}
          />
        </div>
      </div>
      {kind !== NONE && matches.length > 0 ? (
        <div className="cahier-section space-y-1">
          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              className="cahier-item cahier-item-hover w-full p-2 text-left text-sm"
              disabled={disabled}
              onClick={() => {
                onChange({
                  id: item.id,
                  kind: item.kind,
                  title: item.title,
                  creator: item.creator,
                  year: item.year,
                  url: item.url,
                });
                setKind(item.kind);
                setTitle(item.title);
                setCreator(item.creator ?? "");
                setUrl(item.url ?? "");
                setYear(item.year ? String(item.year) : "");
              }}
            >
              {mediaWorkLabel(item, kindLabel)}
            </button>
          ))}
        </div>
      ) : null}
      {kind !== NONE ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !title.trim() || ensureMutation.isPending}
          onClick={handleCreate}
        >
          {ensureMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {t("mediaCreate")}
        </Button>
      ) : null}
    </div>
  );
}
