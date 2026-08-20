import { describe, expect, it } from "vitest";
import {
  concatMono,
  encodePcmWav,
  markerAtTime,
} from "~/lib/listen-tape";

describe("listen tape helpers", () => {
  it("concatenates mono buffers", () => {
    const out = concatMono([
      new Float32Array([1, 2]),
      new Float32Array([3]),
    ]);
    expect([...out]).toEqual([1, 2, 3]);
  });

  it("encodes a valid WAV blob", async () => {
    const blob = encodePcmWav(new Float32Array(22050), 22050);
    expect(blob.type).toBe("audio/wav");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(bytes.byteLength).toBe(44 + 22050 * 2);
  });

  it("finds the marker for a playback time", () => {
    const markers = [
      { clipIndex: 0, startSec: 0, endSec: 1.2 },
      { clipIndex: 1, startSec: 1.2, endSec: 2.5 },
    ];
    expect(markerAtTime(markers, 0.4)?.clipIndex).toBe(0);
    expect(markerAtTime(markers, 1.2)?.clipIndex).toBe(1);
    expect(markerAtTime(markers, 9)?.clipIndex).toBe(1);
  });

  it("keeps the previous clip during pause gaps instead of the last item", () => {
    const markers = [
      { clipIndex: 0, startSec: 0, endSec: 1.2 },
      { clipIndex: 1, startSec: 2.4, endSec: 3.5 },
      { clipIndex: 2, startSec: 4.7, endSec: 6 },
    ];
    expect(markerAtTime(markers, 1.8)?.clipIndex).toBe(0);
    expect(markerAtTime(markers, 4)?.clipIndex).toBe(1);
    expect(markerAtTime(markers, -0.1)?.clipIndex).toBe(0);
    expect(markerAtTime(markers, Number.NaN)?.clipIndex).toBe(0);
  });
});
