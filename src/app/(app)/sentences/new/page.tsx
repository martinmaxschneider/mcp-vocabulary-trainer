"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { emptySatzFormValues, SatzForm } from "~/components/satz-form";

function NewSentenceForm() {
  const searchParams = useSearchParams();
  const domainId = searchParams.get("domainId") ?? undefined;
  return <SatzForm mode="create" initial={emptySatzFormValues(domainId)} />;
}

export default function NewSentencePage() {
  const t = useTranslations("sentences");
  const tCommon = useTranslations("common");

  return (
    <div className="max-w-3xl">
      <Link href="/sentences">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon("back")}
        </Button>
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{t("createTitle")}</CardTitle>
          <CardDescription>{t("createDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">{tCommon("loading")}</p>}>
            <NewSentenceForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
