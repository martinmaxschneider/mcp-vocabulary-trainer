"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { TARGET_LANGS, getTargetLang } from "~/lib/languages";
import { useFocusLang } from "~/components/focus-lang-provider";
import { cn } from "~/lib/utils";

export function FocusLangSelect() {
  const t = useTranslations("nav");
  const tLang = useTranslations("languages");
  const { focusLang, setFocusLang } = useFocusLang();
  const current = getTargetLang(focusLang);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("focusLangAria")}
        >
          <span aria-hidden className="text-lg leading-none">
            {current?.flag}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {TARGET_LANGS.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            className="cursor-pointer gap-2"
            onClick={() => setFocusLang(lang.code)}
          >
            <span aria-hidden>{lang.flag}</span>
            <span className="flex-1">{tLang(lang.code)}</span>
            <Check
              className={cn(
                "h-4 w-4",
                lang.code === focusLang ? "opacity-100" : "opacity-0",
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
