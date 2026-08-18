import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isAudioTranslationId } from "~/lib/satz-tts";
import { audioFilePath } from "~/server/services/tts";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isAudioTranslationId(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const data = await readFile(audioFilePath(id));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
