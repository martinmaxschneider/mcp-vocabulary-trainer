import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import pt from "../../messages/pt.json";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
  type Locale,
} from "./config";

const catalogs: Record<Locale, typeof de> = { de, en, es, fr, pt };

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: catalogs[locale],
  };
});
