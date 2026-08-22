import { describe, expect, it } from "vitest";
import {
  normalizeMediaTitleKey,
  parseMediaKind,
  parseMediaYear,
} from "~/lib/media-work";

describe("media-work helpers", () => {
  it("normalizes titles for find-or-create keys", () => {
    expect(normalizeMediaTitleKey("  La Vie   en Rose ")).toBe("la vie en rose");
  });

  it("parses kind from enum values and aliases", () => {
    expect(parseMediaKind("song")).toBe("SONG");
    expect(parseMediaKind("Lied")).toBe("SONG");
    expect(parseMediaKind("VIDEO")).toBe("VIDEO");
    expect(parseMediaKind("youtube")).toBe("VIDEO");
    expect(parseMediaKind("")).toBeUndefined();
    expect(parseMediaKind("nope")).toBeUndefined();
  });

  it("parses a four-digit year", () => {
    expect(parseMediaYear("2001")).toBe(2001);
    expect(parseMediaYear("99")).toBeUndefined();
    expect(parseMediaYear("")).toBeUndefined();
  });
});
