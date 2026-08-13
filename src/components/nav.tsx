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
  NotebookPen,
} from "lucide-react";
import { ThemeToggle } from "~/components/theme-toggle";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const links = [
    { href: "/", label: t("dashboard"), icon: Home },
    { href: "/domains", label: t("domains"), icon: FolderOpen },
    { href: "/review", label: t("review"), icon: BookOpen },
    {
      href: "/practice/conjugations",
      label: t("conjugations"),
      icon: BookOpen,
    },
    { href: "/grammar", label: t("grammar"), icon: Languages },
    { href: "/worksheets", label: t("worksheets"), icon: NotebookPen },
  ];

  const isVocabularyActive = pathname.startsWith("/vocabulary");

  return (
    <nav className="border-b bg-background">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center space-x-2">
            <BookOpen className="h-6 w-6" />
            <span className="text-xl font-bold">{t("appName")}</span>
          </Link>

          <div className="flex gap-1">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <Button
                  key={link.href}
                  asChild
                  variant={isActive(pathname, link.href) ? "default" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Link href={link.href}>
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                </Button>
              );
            })}

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
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("add")}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
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
