import { NextResponse } from "next/server";
import { SOURCE_LANG, TARGET_LANGS } from "~/lib/languages";

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: "sprachen",
    nativeLang: SOURCE_LANG,
    targetLangs: TARGET_LANGS,
  });
}
