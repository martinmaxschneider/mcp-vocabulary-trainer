"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AudioStatus,
  SatzPriority,
  SatzRegister,
  SatzSource,
  ShadowingStatus,
} from "@prisma/client";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { SOURCE_LANG, TARGET_LANGS } from "~/lib/languages";
import { groupDomainsByKind } from "~/lib/domain-catalog";
import { looksLikeQuestion } from "~/lib/satz-question";
import { useFocusLang } from "~/components/focus-lang-provider";
import { SatzAudioButton } from "~/components/satz-audio-button";
import {
  SimilarEntriesDialog,
  type SimilarEntryCandidate,
} from "~/components/similar-entries-dialog";
import { isEntryCreated } from "~/lib/entry-create";
import { Loader2, Save, Search, Sparkles, X } from "lucide-react";

type TranslationDraft = {
  text: string;
  register: SatzRegister;
  audioUrl?: string | null;
  audioStatus?: AudioStatus;
};

export type SatzFormValues = {
  id?: string;
  mainText: string;
  trigger: string;
  source: SatzSource;
  priority: SatzPriority;
  shadowingStatus: ShadowingStatus;
  domainIds: string[];
  linkedEntries: Array<{ id: string; mainText: string }>;
  grammarTopicIds: string[];
  translations: Record<string, TranslationDraft>;
  answerTo: { id: string; mainText: string } | null;
};

function emptyTranslations(): Record<string, TranslationDraft> {
  return Object.fromEntries(
    TARGET_LANGS.map((lang) => [
      lang.code,
      { text: "", register: SatzRegister.INFORMAL },
    ]),
  );
}

export function emptySatzFormValues(domainId?: string): SatzFormValues {
  return {
    mainText: "",
    trigger: "",
    source: SatzSource.PERSONAL,
    priority: SatzPriority.OCCASIONAL,
    shadowingStatus: ShadowingStatus.NOT_STARTED,
    domainIds: domainId ? [domainId] : [],
    linkedEntries: [],
    grammarTopicIds: [],
    translations: emptyTranslations(),
    answerTo: null,
  };
}

export function SatzForm({
  initial,
  mode,
}: {
  initial: SatzFormValues;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { focusLang } = useFocusLang();
  const t = useTranslations("sentences");
  const tDomains = useTranslations("domains");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");

  const [values, setValues] = useState<SatzFormValues>(initial);
  const [entryQuery, setEntryQuery] = useState("");
  const [questionQuery, setQuestionQuery] = useState("");
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarCandidates, setSimilarCandidates] = useState<
    SimilarEntryCandidate[]
  >([]);
  const [pendingAllowSimilar, setPendingAllowSimilar] = useState(false);

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const { data: domains } = api.domain.list.useQuery();
  const { data: grammarTopics } = api.grammar.listByLang.useQuery({
    targetLang: focusLang,
  });
  const entrySearch = api.entry.search.useQuery(
    { query: entryQuery, limit: 8 },
    { enabled: entryQuery.trim().length > 0 },
  );
  const questionSearch = api.satz.search.useQuery(
    { query: questionQuery, limit: 8 },
    { enabled: questionQuery.trim().length > 0 },
  );
  const suggestQuestion = api.satz.suggestQuestion.useMutation({
    onSuccess: (result) => {
      if (result.matchId) {
        const match = result.candidates.find((c) => c.id === result.matchId);
        if (match) {
          setValues((prev) => ({
            ...prev,
            answerTo: { id: match.id, mainText: match.mainText },
          }));
          toast({ title: tToasts("satzQuestionLinked") });
          return;
        }
      }
      if (result.suggestedQuestionText) {
        toast({
          title: tToasts("satzQuestionSuggested"),
          description: result.suggestedQuestionText,
        });
        return;
      }
      toast({ title: tToasts("satzQuestionNone") });
    },
    onError: (error) => {
      toast({
        title: tToasts("satzQuestionSuggestError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const createMutation = api.satz.create.useMutation({
    onSuccess: (result) => {
      if (!isEntryCreated(result)) {
        setSimilarCandidates(result.candidates);
        setSimilarOpen(true);
        return;
      }
      setSimilarOpen(false);
      setPendingAllowSimilar(false);
      toast({ title: tToasts("satzCreated") });
      router.push("/sentences");
    },
    onError: (error) => {
      toast({
        title: tToasts("satzCreateError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const updateMutation = api.satz.update.useMutation({
    onSuccess: () => {
      toast({ title: tToasts("satzUpdated") });
      router.push("/sentences");
    },
    onError: (error) => {
      toast({
        title: tToasts("satzUpdateError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const assignableDomains = useMemo(
    () =>
      groupDomainsByKind(
        (domains ?? []).filter(
          (d) => d.kind === "THEME" || d.kind === "SPECIAL",
        ),
      ),
    [domains],
  );

  const busy = createMutation.isPending || updateMutation.isPending;

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const addLinkedEntry = (entry: { id: string; mainText: string }) => {
    setValues((prev) => {
      if (prev.linkedEntries.some((e) => e.id === entry.id)) return prev;
      return { ...prev, linkedEntries: [...prev.linkedEntries, entry] };
    });
    setEntryQuery("");
  };

  const handleSubmit = () => {
    if (!values.mainText.trim()) {
      toast({
        title: t("validationMainText"),
        variant: "destructive",
      });
      return;
    }
    const translations = Object.entries(values.translations)
      .filter(([, draft]) => draft.text.trim())
      .map(([lang, draft]) => ({
        lang,
        text: draft.text.trim(),
        register: draft.register,
        audioUrl: draft.audioUrl ?? undefined,
        audioStatus: draft.audioStatus,
      }));
    if (translations.length === 0) {
      toast({
        title: t("validationTranslation"),
        variant: "destructive",
      });
      return;
    }

    const payload = {
      mainLang: SOURCE_LANG.code,
      mainText: values.mainText.trim(),
      trigger: values.trigger.trim() || undefined,
      source: values.source,
      priority: values.priority,
      shadowingStatus: values.shadowingStatus,
      domainIds: values.domainIds,
      linkedEntryIds: values.linkedEntries.map((e) => e.id),
      grammarTopicIds: values.grammarTopicIds,
      translations,
      answerToId: values.answerTo?.id,
    };

    if (mode === "create") {
      createMutation.mutate({
        ...payload,
        allowSimilar: pendingAllowSimilar || undefined,
      });
    } else if (values.id) {
      updateMutation.mutate({
        id: values.id,
        ...payload,
        answerToId: values.answerTo?.id ?? null,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="satz-main">{t("mainTextLabel")}</Label>
        <textarea
          id="satz-main"
          className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={values.mainText}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, mainText: e.target.value }))
          }
          placeholder={t("mainTextPlaceholder")}
          disabled={busy}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="satz-trigger">{t("triggerLabel")}</Label>
        <Input
          id="satz-trigger"
          value={values.trigger}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, trigger: e.target.value }))
          }
          placeholder={t("triggerPlaceholder")}
          disabled={busy}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>{t("sourceLabel")}</Label>
          <Select
            value={values.source}
            onValueChange={(value) =>
              setValues((prev) => ({ ...prev, source: value as SatzSource }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERSONAL">{t("sourcePERSONAL")}</SelectItem>
              <SelectItem value="GENERIC">{t("sourceGENERIC")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("priorityLabel")}</Label>
          <Select
            value={values.priority}
            onValueChange={(value) =>
              setValues((prev) => ({
                ...prev,
                priority: value as SatzPriority,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["DAILY", "WEEKLY", "OCCASIONAL", "RARE"] as const).map(
                (priority) => (
                  <SelectItem key={priority} value={priority}>
                    {t(`priority${priority}`)}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("shadowingLabel")}</Label>
          <Select
            value={values.shadowingStatus}
            onValueChange={(value) =>
              setValues((prev) => ({
                ...prev,
                shadowingStatus: value as ShadowingStatus,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                ["NOT_STARTED", "PRACTICING", "MASTERED"] as const
              ).map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`shadowing${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">{t("translationsTitle")}</h3>
        {TARGET_LANGS.map((lang) => {
          const draft = values.translations[lang.code];
          return (
            <div key={lang.code} className="cahier-item space-y-2 p-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{lang.code.toUpperCase()}</Badge>
                <span className="font-medium">{tLang(lang.code)}</span>
                {draft?.audioUrl && draft.audioStatus === AudioStatus.DONE ? (
                  <SatzAudioButton
                    url={draft.audioUrl}
                    label={t("playAudio")}
                  />
                ) : null}
              </div>
              <Input
                value={draft?.text ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    translations: {
                      ...prev.translations,
                      [lang.code]: {
                        text: e.target.value,
                        register:
                          prev.translations[lang.code]?.register ??
                          SatzRegister.INFORMAL,
                        audioUrl:
                          e.target.value ===
                          prev.translations[lang.code]?.text
                            ? prev.translations[lang.code]?.audioUrl
                            : null,
                        audioStatus:
                          e.target.value ===
                          prev.translations[lang.code]?.text
                            ? prev.translations[lang.code]?.audioStatus
                            : AudioStatus.NONE,
                      },
                    },
                  }))
                }
                placeholder={t("translationPlaceholder", {
                  language: tLang(lang.code),
                })}
                disabled={busy}
              />
              <Select
                value={draft?.register ?? SatzRegister.INFORMAL}
                onValueChange={(value) =>
                  setValues((prev) => ({
                    ...prev,
                    translations: {
                      ...prev.translations,
                      [lang.code]: {
                        text: prev.translations[lang.code]?.text ?? "",
                        register: value as SatzRegister,
                        audioUrl: null,
                        audioStatus: AudioStatus.NONE,
                      },
                    },
                  }))
                }
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INFORMAL">{t("registerINFORMAL")}</SelectItem>
                  <SelectItem value="FORMAL">{t("registerFORMAL")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">{t("domainsTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("domainsHint")}</p>
        {assignableDomains.map((group) => (
          <div key={group.kind} className="space-y-2">
            <div className="text-sm font-semibold text-muted-foreground">
              {tDomains(`kind${group.kind}`)}
            </div>
            <div className="cahier-section grid gap-2 sm:grid-cols-2">
              {group.domains.map((domain) => (
                <label
                  key={domain.id}
                  className="cahier-item flex cursor-pointer items-center gap-2 p-3"
                >
                  <Checkbox
                    checked={values.domainIds.includes(domain.id)}
                    onCheckedChange={() =>
                      setValues((prev) => ({
                        ...prev,
                        domainIds: toggleId(prev.domainIds, domain.id),
                      }))
                    }
                    disabled={busy}
                  />
                  <span>{domain.name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">{t("entriesTitle")}</h3>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={entryQuery}
            onChange={(e) => setEntryQuery(e.target.value)}
            placeholder={t("entriesSearch")}
            disabled={busy}
          />
        </div>
        {entrySearch.data?.entries && entrySearch.data.entries.length > 0 ? (
          <div className="cahier-section space-y-1">
            {entrySearch.data.entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="cahier-item cahier-item-hover w-full p-2 text-left"
                onClick={() =>
                  addLinkedEntry({ id: entry.id, mainText: entry.mainText })
                }
              >
                {entry.mainText}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {values.linkedEntries.map((entry) => (
            <Badge key={entry.id} variant="secondary" className="gap-1">
              {entry.mainText}
              <button
                type="button"
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    linkedEntries: prev.linkedEntries.filter(
                      (e) => e.id !== entry.id,
                    ),
                  }))
                }
                aria-label={tCommon("delete")}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">{t("answerToTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("answerToHint")}</p>
        {looksLikeQuestion(values.mainText) ? (
          <p className="text-sm text-muted-foreground">{t("answerToIsQuestion")}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={questionQuery}
                  onChange={(e) => setQuestionQuery(e.target.value)}
                  placeholder={t("answerToSearch")}
                  disabled={busy}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !values.mainText.trim() || suggestQuestion.isPending}
                onClick={() =>
                  suggestQuestion.mutate({
                    mainText: values.mainText.trim(),
                    excludeId: values.id,
                  })
                }
              >
                {suggestQuestion.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {t("answerToSuggest")}
              </Button>
            </div>
            {questionSearch.data?.items && questionSearch.data.items.length > 0 ? (
              <div className="cahier-section space-y-1">
                {questionSearch.data.items
                  .filter((satz) => satz.id !== values.id)
                  .map((satz) => (
                    <button
                      key={satz.id}
                      type="button"
                      className="cahier-item cahier-item-hover w-full p-2 text-left"
                      onClick={() => {
                        setValues((prev) => ({
                          ...prev,
                          answerTo: { id: satz.id, mainText: satz.mainText },
                        }));
                        setQuestionQuery("");
                      }}
                    >
                      {satz.mainText}
                    </button>
                  ))}
              </div>
            ) : null}
            {values.answerTo ? (
              <Badge variant="secondary" className="gap-1">
                {values.answerTo.mainText}
                <button
                  type="button"
                  onClick={() =>
                    setValues((prev) => ({ ...prev, answerTo: null }))
                  }
                  aria-label={tCommon("delete")}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
            {suggestQuestion.data?.suggestedQuestionText &&
            !values.answerTo ? (
              <p className="text-sm text-muted-foreground">
                {t("answerToSuggested")}: {suggestQuestion.data.suggestedQuestionText}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">{t("grammarTitle")}</h3>
        {grammarTopics && grammarTopics.length > 0 ? (
          <div className="cahier-section grid gap-2 sm:grid-cols-2">
            {grammarTopics.map((topic) => (
              <label
                key={topic.id}
                className="cahier-item flex cursor-pointer items-center gap-2 p-3"
              >
                <Checkbox
                  checked={values.grammarTopicIds.includes(topic.id)}
                  onCheckedChange={() =>
                    setValues((prev) => ({
                      ...prev,
                      grammarTopicIds: toggleId(prev.grammarTopicIds, topic.id),
                    }))
                  }
                  disabled={busy}
                />
                <span>{topic.title}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("grammarEmpty")}</p>
        )}
      </div>

      <Button type="button" onClick={handleSubmit} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {tCommon("saving")}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            {mode === "create" ? t("createSave") : tCommon("save")}
          </>
        )}
      </Button>

      <SimilarEntriesDialog
        open={similarOpen}
        onOpenChange={setSimilarOpen}
        candidates={similarCandidates}
        confirming={createMutation.isPending}
        namespace="similarSaetze"
        onConfirm={() => {
          setPendingAllowSimilar(true);
          createMutation.mutate({
            mainLang: SOURCE_LANG.code,
            mainText: values.mainText.trim(),
            trigger: values.trigger.trim() || undefined,
            source: values.source,
            priority: values.priority,
            shadowingStatus: values.shadowingStatus,
            domainIds: values.domainIds,
            linkedEntryIds: values.linkedEntries.map((e) => e.id),
            grammarTopicIds: values.grammarTopicIds,
            translations: Object.entries(values.translations)
              .filter(([, draft]) => draft.text.trim())
              .map(([lang, draft]) => ({
                lang,
                text: draft.text.trim(),
                register: draft.register,
                audioUrl: draft.audioUrl ?? undefined,
                audioStatus: draft.audioStatus,
              })),
            answerToId: values.answerTo?.id,
            allowSimilar: true,
          });
        }}
      />
    </div>
  );
}
