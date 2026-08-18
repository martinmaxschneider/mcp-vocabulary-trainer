import { describe, expect, it } from "vitest";
import {
  buildListenPlaylist,
  remainingListenMs,
  sentenceBounds,
} from "~/lib/listen-playlist";
import type { PlaybackClip } from "~/lib/satz-tts";

const clips: PlaybackClip[] = [
  { url: "/main.mp3", durationMs: 1000, kind: "main" },
  { url: "/tr.mp3", durationMs: 2000, kind: "translation" },
];

describe("buildListenPlaylist", () => {
  it("repeats jobs and skips main language after the first pass", () => {
    const playlist = buildListenPlaylist(
      [{ id: "a", clips }],
      {
        repeatsPerSentence: 2,
        listRepeats: 2,
        pauseMs: 500,
        mainLangOnce: true,
      },
    );
    expect(playlist.map((item) => item.url)).toEqual([
      "/main.mp3",
      "/tr.mp3",
      "/tr.mp3",
      "/tr.mp3",
      "/tr.mp3",
    ]);
    expect(playlist[0]?.pauseBeforeMs).toBe(500);
  });
});

describe("remainingListenMs", () => {
  it("adds pause and scaled audio duration", () => {
    expect(
      remainingListenMs(
        [{ durationMs: 2000, pauseBeforeMs: 500 }],
        1,
        2,
      ),
    ).toBe(1500);
  });
});

describe("sentenceBounds", () => {
  it("finds previous and next sentence starts", () => {
    const playlist = buildListenPlaylist(
      [
        { id: "a", clips: [clips[1]!] },
        { id: "b", clips: [clips[1]!] },
      ],
      {
        repeatsPerSentence: 1,
        listRepeats: 1,
        pauseMs: 0,
        mainLangOnce: false,
      },
    );
    expect(sentenceBounds(playlist, 1)).toEqual({
      start: 1,
      prevStart: 0,
      nextStart: null,
    });
  });
});
