"use server";

import { cookies } from "next/headers";
import {
  isLocale,
  localeCookieName,
  type Locale,
} from "~/i18n/config";

export async function setLocale(locale: string): Promise<Locale | null> {
  if (!isLocale(locale)) {
    return null;
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return locale;
}
