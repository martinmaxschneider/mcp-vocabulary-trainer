"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import type { LanguageConjugationProfile } from "~/lib/conjugation-catalog";
import { Loader2, Pencil, Save, X } from "lucide-react";

type FormRow = {
  tenseKey: string;
  personIndex: number;
  form: string;
};

type ConjugationTableProps = {
  language: string;
  languageName: string;
  flag: string;
  profile: LanguageConjugationProfile;
  forms: FormRow[];
  isIrregular?: boolean;
  editable?: boolean;
  isSaving?: boolean;
  isTogglingIrregular?: boolean;
  onSave?: (forms: FormRow[]) => void;
  onIrregularChange?: (isIrregular: boolean) => void;
};

function formsToDraft(
  profile: LanguageConjugationProfile,
  forms: FormRow[]
): Record<string, string[]> {
  const draft: Record<string, string[]> = {};
  for (const tense of profile.tenses) {
    draft[tense.key] = Array.from({ length: profile.persons.length }, () => "");
  }
  for (const f of forms) {
    const arr = draft[f.tenseKey];
    if (arr && f.personIndex >= 0 && f.personIndex < arr.length) {
      arr[f.personIndex] = f.form;
    }
  }
  return draft;
}

export function ConjugationTable({
  language,
  languageName,
  flag,
  profile,
  forms,
  isIrregular = false,
  editable = false,
  isSaving = false,
  isTogglingIrregular = false,
  onSave,
  onIrregularChange,
}: ConjugationTableProps) {
  const t = useTranslations("conjugations");
  const tCommon = useTranslations("common");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string[]>>(() =>
    formsToDraft(profile, forms)
  );

  const sortedTenses = useMemo(
    () => [...profile.tenses].sort((a, b) => a.sortOrder - b.sortOrder),
    [profile.tenses]
  );

  const displayDraft = editing ? draft : formsToDraft(profile, forms);
  const hasAnyForm = forms.some((f) => f.form.trim());

  const startEdit = () => {
    setDraft(formsToDraft(profile, forms));
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(formsToDraft(profile, forms));
    setEditing(false);
  };

  const handleSave = () => {
    const next: FormRow[] = [];
    for (const tense of profile.tenses) {
      const arr = draft[tense.key] ?? [];
      arr.forEach((form, personIndex) => {
        next.push({ tenseKey: tense.key, personIndex, form });
      });
    }
    onSave?.(next);
    setEditing(false);
  };

  if (!hasAnyForm && !editing && !editable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{flag}</span>
            <span>{languageName}</span>
            {isIrregular && (
              <Badge variant="secondary">{tCommon("irregular")}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("noConjugations")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <span>{flag}</span>
            <span>{languageName}</span>
            {isIrregular && !editable && (
              <Badge variant="secondary">{tCommon("irregular")}</Badge>
            )}
          </CardTitle>
          {editable && onIrregularChange && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`irregular-${language}`}
                checked={isIrregular}
                disabled={isTogglingIrregular}
                onCheckedChange={(checked) =>
                  onIrregularChange(checked === true)
                }
              />
              <Label
                htmlFor={`irregular-${language}`}
                className="text-sm font-normal text-muted-foreground"
              >
                {t("irregularInLanguage")}
              </Label>
            </div>
          )}
        </div>
        {editable && !editing && (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            {tCommon("edit")}
          </Button>
        )}
        {editable && editing && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cancelEdit}
              disabled={isSaving}
            >
              <X className="mr-2 h-4 w-4" />
              {tCommon("cancel")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSaving ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasAnyForm && !editing && (
          <p className="text-sm text-muted-foreground">
            {t("noFormsYet", { langCode: language.toUpperCase() })}
          </p>
        )}
        {sortedTenses.map((tense) => {
          const tenseForms = displayDraft[tense.key] ?? [];
          const showTense =
            editing || tenseForms.some((f) => f.trim().length > 0);
          if (!showTense) return null;

          return (
            <div key={tense.key}>
              <Badge variant="outline" className="mb-3">
                {tense.label}
              </Badge>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {profile.persons.map((person) => (
                  <div
                    key={`${tense.key}-${person.index}`}
                    className="flex items-center gap-2 rounded bg-muted/30 p-2"
                  >
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      {person.label}
                    </span>
                    {editing ? (
                      <Input
                        value={tenseForms[person.index] ?? ""}
                        onChange={(e) => {
                          setDraft((prev) => {
                            const next = { ...prev };
                            const arr = [
                              ...(next[tense.key] ??
                                Array.from(
                                  { length: profile.persons.length },
                                  () => ""
                                )),
                            ];
                            arr[person.index] = e.target.value;
                            next[tense.key] = arr;
                            return next;
                          });
                        }}
                        className="h-8"
                      />
                    ) : (
                      <span className="font-medium">
                        {tenseForms[person.index] || "—"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
