import { describe, expect, it } from "vitest";
import {
  blobForAudioPlayback,
  collectClipUrls,
  normalizeClipUrl,
  remapItemClips,
} from "~/lib/offline-daily";
import type { PlaybackClip } from "~/lib/satz-tts";

const clips: PlaybackClip[] = [
  { url: "/api/audio/main/a", durationMs: 1000, kind: "main" },
  {
    url: "https://host.local:4843/api/audio/b?x=1",
    durationMs: 800,
    kind: "translation",
  },
];

describe("offline daily helpers", () => {
  it("normalizes clip URLs to path + query", () => {
    expect(normalizeClipUrl("/api/audio/main/a")).toBe("/api/audio/main/a");
    expect(normalizeClipUrl("https://host.local:4843/api/audio/b?x=1")).toBe(
      "/api/audio/b?x=1",
    );
  });

  it("collects unique normalized clip URLs", () => {
    expect(
      collectClipUrls([
        { clips },
        { clips: [clips[0]!] },
      ]),
    ).toEqual(["/api/audio/main/a", "/api/audio/b?x=1"]);
  });

  it("remaps clip URLs when a blob mapping exists", () => {
    const mapped = remapItemClips(
      [{ id: "1", clips }],
      new Map([["/api/audio/main/a", "blob:item-a"]]),
    );
    expect(mapped[0]?.clips[0]?.url).toBe("blob:item-a");
    expect(mapped[0]?.clips[1]?.url).toBe(
      "https://host.local:4843/api/audio/b?x=1",
    );
  });

  it("gives untyped blobs an audio/mpeg type for iOS playback", async () => {
    const raw = new Blob([new Uint8Array([1, 2, 3])]);
    const typed = await blobForAudioPlayback(raw);
    expect(typed.type).toBe("audio/mpeg");
    const already = await blobForAudioPlayback(
      new Blob([new Uint8Array([1])], { type: "audio/wav" }),
    );
    expect(already.type).toBe("audio/wav");
  });
});
