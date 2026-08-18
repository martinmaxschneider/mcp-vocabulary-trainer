import { describe, expect, it } from "vitest";
import {
  DEFAULT_SATZ_LISTEN_SETTINGS,
  parseSatzListenSettings,
} from "~/lib/satz-listen-settings";

describe("parseSatzListenSettings", () => {
  it("returns defaults for invalid input", () => {
    expect(parseSatzListenSettings(null)).toEqual(DEFAULT_SATZ_LISTEN_SETTINGS);
    expect(parseSatzListenSettings("x")).toEqual(DEFAULT_SATZ_LISTEN_SETTINGS);
  });

  it("keeps valid values and drops unknown ones", () => {
    expect(
      parseSatzListenSettings({
        pauseMs: 2000,
        playbackRate: 0.75,
        repeatsPerSentence: 3,
        listRepeats: 2,
        autoAdvance: false,
        mainLangOnce: false,
      }),
    ).toEqual({
      pauseMs: 2000,
      playbackRate: 0.75,
      repeatsPerSentence: 3,
      listRepeats: 2,
      autoAdvance: false,
      mainLangOnce: false,
    });
    expect(
      parseSatzListenSettings({
        pauseMs: 999,
        playbackRate: 2,
        repeatsPerSentence: 4,
        listRepeats: 9,
        autoAdvance: "yes",
      }),
    ).toEqual({
      ...DEFAULT_SATZ_LISTEN_SETTINGS,
      pauseMs: 1000,
      playbackRate: 1.5,
    });
  });
});
