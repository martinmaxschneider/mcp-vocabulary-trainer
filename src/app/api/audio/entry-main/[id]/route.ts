import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isAudioTranslationId } from "~/lib/satz-tts";
import { entryMainAudioFilePath } from "~/server/services/tts";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isAudioTranslationId(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const data = await readFile(entryMainAudioFilePath(id));
    const isWav =
      data.length >= 12 &&
      data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WAVE";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": isWav ? "audio/wav" : "audio/mpeg",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
