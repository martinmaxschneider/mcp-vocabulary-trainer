"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Plus } from "lucide-react";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";

interface DomainAssignmentProps {
  entryId: string;
  currentDomainIds: string[];
  onUpdate?: () => void;
}

export function DomainAssignment({
  entryId,
  currentDomainIds,
  onUpdate,
}: DomainAssignmentProps) {
  const t = useTranslations("domainAssignment");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const [selectedDomains, setSelectedDomains] = useState<string[]>(
    currentDomainIds ?? []
  );
  const [isEditing, setIsEditing] = useState(false);

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const { data: allDomains } = api.domain.list.useQuery();
  const assignMutation = api.entry.assignDomains.useMutation({
    onSuccess: () => {
      toast({
        title: t("updated"),
      });
      setIsEditing(false);
      if (onUpdate) onUpdate();
    },
    onError: (error) => {
      toast({
        title: tToasts("domainUpdateError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const handleToggleDomain = (domainId: string) => {
    setSelectedDomains((prev) =>
      prev.includes(domainId)
        ? prev.filter((id) => id !== domainId)
        : [...prev, domainId]
    );
  };

  const handleSave = () => {
    assignMutation.mutate({
      entryId,
      domainIds: selectedDomains,
    });
  };

  const handleCancel = () => {
    setSelectedDomains(currentDomainIds ?? []);
    setIsEditing(false);
  };

  if (!isEditing) {
    const assignedDomains =
      allDomains?.filter((d) => selectedDomains.includes(d.id)) ?? [];

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("title")}</CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {tCommon("edit")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {assignedDomains.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noneAssigned")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assignedDomains.map((d) => (
                <Badge key={d.id} variant="secondary">
                  {d.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("editTitle")}</CardTitle>
        <CardDescription>{t("editDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {allDomains?.map((domain) => (
            <div
              key={domain.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedDomains.includes(domain.id)
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
              onClick={() => handleToggleDomain(domain.id)}
            >
              <input
                type="checkbox"
                checked={selectedDomains.includes(domain.id)}
                onChange={() => handleToggleDomain(domain.id)}
                className="h-4 w-4 cursor-pointer"
              />
              <span className="font-medium">{domain.name}</span>
            </div>
          ))}
        </div>

        {allDomains?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("noDomainsAvailable")}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={assignMutation.isPending}
            size="sm"
          >
            {assignMutation.isPending ? tCommon("saving") : tCommon("save")}
          </Button>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={assignMutation.isPending}
            size="sm"
          >
            {tCommon("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
