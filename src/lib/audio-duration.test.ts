import { describe, expect, it } from "vitest";
import {
  audioDurationMs,
  formatListenClock,
  formatListenRemaining,
} from "~/lib/audio-duration";

function wavBuffer(durationSec: number, sampleRate = 8000, channels = 1) {
  const dataSize = sampleRate * channels * 2 * durationSec;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

describe("audioDurationMs", () => {
  it("reads WAV duration from the data chunk", () => {
    expect(audioDurationMs(wavBuffer(2))).toBe(2000);
    expect(audioDurationMs(Buffer.from("not audio"))).toBeNull();
  });

  it("estimates MP3 CBR duration from the first frame", () => {
    const header = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    const frameLength = Math.floor((1152 * 128 * 125) / 44100);
    const frames = 100;
    const buffer = Buffer.alloc(frameLength * frames);
    header.copy(buffer);
    const duration = audioDurationMs(buffer);
    expect(duration).toBeGreaterThan(2000);
    expect(duration).toBeLessThan(3000);
  });
});

describe("formatListenClock", () => {
  it("formats a player clock", () => {
    expect(formatListenClock(12_000)).toBe("0:12");
    expect(formatListenClock(90_000)).toBe("1:30");
    expect(formatListenClock(3_600_000)).toBe("1:00:00");
  });
});

describe("formatListenRemaining", () => {
  it("formats compact remaining labels", () => {
    expect(formatListenRemaining(12_000)).toBe("12s");
    expect(formatListenRemaining(60_000)).toBe("1 min");
    expect(formatListenRemaining(90_000)).toBe("1:30 min");
    expect(formatListenRemaining(3_600_000)).toBe("1:00 h");
  });
});
