"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useToast } from "~/hooks/use-toast";
import { FolderOpen, Plus, Pencil, Trash2 } from "lucide-react";
import { resolveErrorCode } from "~/lib/trpc-error";

export function DomainList() {
  const t = useTranslations("domains");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const [newDomainName, setNewDomainName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const { data: domains, refetch } = api.domain.list.useQuery();
  const createMutation = api.domain.create.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.created
          ? tToasts("domainCreated")
          : tToasts("domainExists"),
      });
      setNewDomainName("");
      void refetch();
      window.location.href = `/domains/${result.domain.id}/suggestions`;
    },
    onError: (error) => {
      toast({
        title: tToasts("domainCreateError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const renameMutation = api.domain.rename.useMutation({
    onSuccess: () => {
      toast({ title: tToasts("domainRenamed") });
      setEditingId(null);
      void refetch();
    },
    onError: (error) => {
      toast({
        title: tToasts("domainRenameError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = api.domain.remove.useMutation({
    onSuccess: () => {
      toast({ title: tToasts("domainDeleted") });
      void refetch();
    },
    onError: (error) => {
      toast({
        title: tToasts("domainDeleteError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (newDomainName.trim()) {
      createMutation.mutate({ name: newDomainName.trim() });
    }
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      renameMutation.mutate({ id, name: editName.trim() });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm(t("confirmDelete"))) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("create")}</CardTitle>
          <CardDescription>{t("createDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="domain-name" className="sr-only">
                {t("domainNameLabel")}
              </Label>
              <Input
                id="domain-name"
                placeholder={t("createPlaceholder")}
                value={newDomainName}
                onChange={(e) => setNewDomainName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newDomainName.trim()}
            >
              <Plus className="mr-2 h-4 w-4" />
              {tCommon("create")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {domains?.map((domain) => (
          <Card key={domain.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              {editingId === domain.id ? (
                <div className="space-y-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(domain.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleRename(domain.id)}
                      disabled={renameMutation.isPending}
                    >
                      {tCommon("save")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      {tCommon("cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{domain.name}</CardTitle>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(domain.id);
                          setEditName(domain.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(domain.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>
                    {t("entries", { count: domain.entryCount })}
                  </CardDescription>
                </>
              )}
            </CardHeader>
            {editingId !== domain.id && (
              <CardContent>
                <Link href={`/domains/${domain.id}`}>
                  <Button variant="outline" className="w-full">
                    {t("viewEntries")}
                  </Button>
                </Link>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
