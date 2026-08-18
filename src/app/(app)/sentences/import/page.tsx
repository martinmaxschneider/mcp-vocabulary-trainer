"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { useFocusLang } from "~/components/focus-lang-provider";
import { Loader2, Upload } from "lucide-react";

export default function SentenceImportPage() {
  const router = useRouter();
  const t = useTranslations("sentences");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const { focusLang } = useFocusLang();
  const tLang = useTranslations("languages");
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);

  const { data: batches } = api.satzImport.listBatches.useQuery({ limit: 10 });
  const uploadMutation = api.satzImport.uploadCsv.useMutation({
    onSuccess: (batch) => {
      toast({ title: tToasts("satzImportUploaded") });
      router.push(`/sentences/import/${batch.id}`);
    },
    onError: (error) => {
      const code = resolveErrorCode(error.message);
      toast({
        title: tToasts("satzImportUploadError"),
        description: code
          ? tErrors(code as "NOT_FOUND")
          : error.message,
        variant: "destructive",
      });
    },
  });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setFilename(file.name);
    setCsvText(text);
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="mb-2 text-4xl font-bold">{t("importTitle")}</h1>
        <p className="text-muted-foreground">{t("importSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("importDrop")}</CardTitle>
          <CardDescription>
            {t("importHint", { language: tLang(focusLang) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t("importDrop")}
            </Button>
            {filename ? (
              <span className="text-sm text-muted-foreground">{filename}</span>
            ) : null}
          </div>
          <Button
            type="button"
            disabled={uploadMutation.isPending}
            onClick={() => {
              if (!csvText) {
                toast({
                  title: tToasts("satzImportUploadError"),
                  description: t("importNoFile"),
                  variant: "destructive",
                });
                return;
              }
              uploadMutation.mutate({
                csvText,
                filename: filename ?? undefined,
                targetLang: focusLang,
              });
            }}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t("importUpload")}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">{t("importRecent")}</h2>
        {batches?.items.length ? (
          <div className="space-y-2">
            {batches.items.map((batch) => (
              <Link
                key={batch.id}
                href={`/sentences/import/${batch.id}`}
                className="cahier-item cahier-item-hover flex items-center justify-between p-3"
              >
                <div>
                  <div className="font-medium">
                    {batch.filename ?? batch.id}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {batch._count.items} ·{" "}
                    {new Date(batch.updatedAt).toLocaleString()}
                  </div>
                </div>
                <Badge variant="outline">
                  {t(`importStatus${batch.status}`)}
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("importEmptyRecent")}</p>
        )}
      </div>
    </div>
  );
}
