"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  TARGET_LANGS,
  isTargetLang,
  type LearningLangCode,
} from "~/lib/languages";

const STORAGE_KEY = "sprachen-focus-lang";

function defaultLang(): LearningLangCode {
  return TARGET_LANGS[0]?.code ?? "en";
}

function readStoredLang(): LearningLangCode {
  if (typeof window === "undefined") return defaultLang();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw && isTargetLang(raw)) return raw as LearningLangCode;
  return defaultLang();
}

type FocusLangContextValue = {
  focusLang: LearningLangCode;
  setFocusLang: (code: LearningLangCode) => void;
};

const FocusLangContext = createContext<FocusLangContextValue | null>(null);

export function FocusLangProvider({ children }: { children: ReactNode }) {
  const [focusLang, setFocusLangState] = useState<LearningLangCode>(defaultLang);

  useEffect(() => {
    setFocusLangState(readStoredLang());
  }, []);

  const setFocusLang = useCallback((code: LearningLangCode) => {
    if (!isTargetLang(code)) return;
    setFocusLangState(code);
    window.localStorage.setItem(STORAGE_KEY, code);
  }, []);

  const value = useMemo(
    () => ({ focusLang, setFocusLang }),
    [focusLang, setFocusLang],
  );

  return (
    <FocusLangContext.Provider value={value}>
      {children}
    </FocusLangContext.Provider>
  );
}

export function useFocusLang(): FocusLangContextValue {
  const ctx = useContext(FocusLangContext);
  if (!ctx) {
    throw new Error("useFocusLang must be used within FocusLangProvider");
  }
  return ctx;
}
