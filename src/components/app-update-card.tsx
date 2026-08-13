"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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

const ACTIVE = new Set(["running", "restarting"]);

export function AppUpdateCard() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const tErrorCodes = useTranslations("errors.codes");
  const { toast } = useToast();
  const sawRestarting = useRef(false);

  const statusQuery = api.settings.updateStatus.useQuery(undefined, {
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (
        status === "running" ||
        status === "restarting" ||
        sawRestarting.current
      ) {
        return 1500;
      }
      return false;
    },
    retry: true,
    retryDelay: 1500,
  });

  const startMutation = api.settings.startUpdate.useMutation({
    onSuccess: async () => {
      sawRestarting.current = false;
      await statusQuery.refetch();
    },
    onError: (err) => {
      const code = resolveErrorCode(err.message);
      toast({
        title: t("updateFailed"),
        description: code
          ? tErrorCodes(code as "UPDATE_DISABLED_IN_DEV")
          : err.message,
        variant: "destructive",
      });
    },
  });

  const status = statusQuery.data?.status ?? "idle";
  const step = statusQuery.data?.step;
  const log = statusQuery.data?.log ?? "";
  const error = statusQuery.data?.error;
  const isBusy = ACTIVE.has(status) || startMutation.isPending;

  useEffect(() => {
    if (status === "restarting") {
      sawRestarting.current = true;
    }
  }, [status]);

  useEffect(() => {
    if (sawRestarting.current && status === "success") {
      window.location.reload();
    }
  }, [status]);

  const stepLabel =
    step === "pull"
      ? t("updateStepPull")
      : step === "install"
        ? t("updateStepInstall")
        : step === "migrate"
          ? t("updateStepMigrate")
          : step === "build"
            ? t("updateStepBuild")
            : step === "restart"
              ? t("updateStepRestart")
              : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          <CardTitle>{t("updateTitle")}</CardTitle>
        </div>
        <CardDescription>{t("updateDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("updateHelp")}</p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={isBusy}>
              {isBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {isBusy ? t("updateRunning") : t("updateButton")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("updateConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("updateConfirmDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
              >
                {t("updateConfirmAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {status === "running" || status === "restarting" ? (
          <p className="text-sm font-medium">
            {status === "restarting" ? t("updateRestarting") : stepLabel}
          </p>
        ) : null}

        {status === "needsRestart" ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t("updateNeedsRestart")}
          </p>
        ) : null}

        {status === "success" && !sawRestarting.current ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            {t("updateSuccess")}
          </p>
        ) : null}

        {status === "failed" ? (
          <p className="text-sm text-destructive">
            {t("updateFailed")}
            {error ? ` ${error}` : ""}
          </p>
        ) : null}

        {log ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("updateLog")}</p>
            <pre className="max-h-64 overflow-auto rounded-lg bg-[#101820] p-3 text-xs leading-relaxed text-[#dce7f4]">
              {log}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
