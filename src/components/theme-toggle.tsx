"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

type ThemeToggleProps = {
  /** Compact icon button for the nav bar */
  variant?: "icon" | "buttons";
};

export function ThemeToggle({ variant = "icon" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("settings");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size={variant === "icon" ? "icon" : "sm"}
        aria-label={t("themeTitle")}
        disabled
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  if (variant === "buttons") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={theme === "light" ? "default" : "outline"}
          onClick={() => setTheme("light")}
        >
          <Sun className="mr-2 h-4 w-4" />
          {t("themeLight")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={theme === "dark" ? "default" : "outline"}
          onClick={() => setTheme("dark")}
        >
          <Moon className="mr-2 h-4 w-4" />
          {t("themeDark")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={theme === "system" ? "default" : "outline"}
          onClick={() => setTheme("system")}
        >
          <Monitor className="mr-2 h-4 w-4" />
          {t("themeSystem")}
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("themeTitle")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">{t("themeTitle")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          {t("themeLight")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          {t("themeDark")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          {t("themeSystem")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
