import { describe, expect, it } from "vitest";
import { createSilentWavBlob } from "~/lib/silent-audio";

describe("createSilentWavBlob", () => {
  it("writes a WAV header and silent samples", async () => {
    const blob = createSilentWavBlob(1000, 8000);
    expect(blob.type).toBe("audio/wav");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
    expect(bytes.byteLength).toBe(44 + 8000 * 2);
  });
});
