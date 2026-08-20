import { NextResponse } from "next/server";
import { SINGLE_USER_ID } from "~/lib/constants";
import { isTargetLang } from "~/lib/languages";
import { toMobileDailyPackage } from "~/lib/mobile-daily";
import { db } from "~/server/db";
import {
  findLatestListenPackage,
  toHydratedPackage,
} from "~/server/services/daily";

export async function GET(request: Request) {
  const targetLang = new URL(request.url).searchParams.get("targetLang") ?? "";
  if (!isTargetLang(targetLang)) {
    return NextResponse.json({ error: "Invalid targetLang" }, { status: 400 });
  }

  const pkg = await findLatestListenPackage(db, SINGLE_USER_ID, targetLang);
  const hydrated = pkg ? await toHydratedPackage(db, pkg) : null;

  return NextResponse.json({
    date: hydrated?.date ?? "",
    package: hydrated ? toMobileDailyPackage(hydrated) : null,
  });
}
