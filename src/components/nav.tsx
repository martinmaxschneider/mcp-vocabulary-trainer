"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  BookOpen,
  Home,
  FolderOpen,
  Settings,
  Plus,
  ChevronDown,
  Library,
  Languages,
  Layers,
  NotebookPen,
  Quote,
  Repeat,
} from "lucide-react";
import { FocusLangSelect } from "~/components/focus-lang-select";
import { StreakIndicator } from "~/components/streak-indicator";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const startLinks = [
    { href: "/", label: t("dashboard"), icon: Home },
    { href: "/sentences/review", label: t("sentences"), icon: Quote },
  ];
  const practiceLinks = [
    { href: "/review", label: t("review"), icon: Layers },
    {
      href: "/practice/conjugations",
      label: t("conjugations"),
      icon: Repeat,
    },
    { href: "/grammar", label: t("grammar"), icon: Languages },
    { href: "/worksheets", label: t("worksheets"), icon: NotebookPen },
  ];
  const topicLinks = [
    { href: "/domains", label: t("domains"), icon: FolderOpen },
  ];

  const isSentencePractice =
    pathname === "/sentences/review" ||
    pathname.startsWith("/sentences/review/") ||
    pathname.startsWith("/sentences/listen");
  const isVocabularyActive =
    pathname.startsWith("/vocabulary") ||
    pathname === "/sentences" ||
    pathname.startsWith("/sentences/new") ||
    (pathname.startsWith("/sentences/") &&
      !isSentencePractice &&
      !pathname.startsWith("/sentences/listen") &&
      !pathname.startsWith("/sentences/import"));

  const renderLinks = (
    items: Array<{ href: string; label: string; icon: typeof Home }>,
  ) =>
    items.map((link) => {
      const Icon = link.icon;
      return (
        <Button
          key={link.href}
          asChild
          variant={
            isActive(pathname, link.href) ||
            (link.href === "/sentences/review" && isSentencePractice)
              ? "default"
              : "ghost"
          }
          size="sm"
          className="gap-2"
        >
          <Link href={link.href}>
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        </Button>
      );
    });

  return (
    <nav className="border-b border-border bg-background">
      <div className="container grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4">
        <Link href="/" className="flex items-center space-x-2 justify-self-start">
          <BookOpen className="h-6 w-6" />
          <span className="text-xl font-bold">{t("appName")}</span>
        </Link>

        <div className="flex gap-1">
            {renderLinks(startLinks)}
            {renderLinks(practiceLinks)}
            {renderLinks(topicLinks)}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={isVocabularyActive ? "default" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Library className="h-4 w-4" />
                  {t("vocabulary")}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <Link href="/vocabulary/verbs/list" className="cursor-pointer">
                    {t("verbs")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/vocabulary/nouns/list" className="cursor-pointer">
                    {t("nouns")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/vocabulary/adjectives/list"
                    className="cursor-pointer"
                  >
                    {t("adjectives")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/vocabulary/proverbs/list"
                    className="cursor-pointer"
                  >
                    {t("proverbs")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/sentences" className="cursor-pointer">
                    {t("sentences")}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>

        <div className="flex items-center justify-end gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("add")}>
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/vocabulary/verbs" className="cursor-pointer">
                  {t("verbs")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/vocabulary/nouns" className="cursor-pointer">
                  {t("nouns")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/vocabulary/adjectives" className="cursor-pointer">
                  {t("adjectives")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/vocabulary/proverbs" className="cursor-pointer">
                  {t("proverbs")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/sentences/new" className="cursor-pointer">
                  {t("sentences")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/sentences/import" className="cursor-pointer">
                  {t("sentenceImport")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <FocusLangSelect />
          <StreakIndicator />
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label={t("settingsAriaLabel")}
          >
            <Link href="/settings">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
