const MPEG1_LAYER3_BITRATE = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const MPEG2_LAYER3_BITRATE = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const MPEG1_SAMPLE_RATE = [44100, 48000, 32000];
const MPEG2_SAMPLE_RATE = [22050, 24000, 16000];
const MPEG25_SAMPLE_RATE = [11025, 12000, 8000];

function skipId3(buffer: Buffer): number {
  if (buffer.length < 10) return 0;
  if (buffer.toString("ascii", 0, 3) !== "ID3") return 0;
  const size =
    ((buffer[6]! & 0x7f) << 21) |
    ((buffer[7]! & 0x7f) << 14) |
    ((buffer[8]! & 0x7f) << 7) |
    (buffer[9]! & 0x7f);
  return Math.min(buffer.length, 10 + size);
}

function wavDurationMs(buffer: Buffer): number | null {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (chunk === "fmt " && size >= 16 && start + 16 <= buffer.length) {
      byteRate = buffer.readUInt32LE(start + 8);
    }
    if (chunk === "data") {
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (byteRate <= 0 || dataSize <= 0) return null;
  return Math.round((dataSize / byteRate) * 1000);
}

type MpegFrame = {
  bitrate: number;
  sampleRate: number;
  samplesPerFrame: number;
  frameLength: number;
  version: number;
  channels: number;
};

function parseMpegFrame(buffer: Buffer, offset: number): MpegFrame | null {
  if (offset + 4 > buffer.length) return null;
  if (buffer[offset] !== 0xff || (buffer[offset + 1]! & 0xe0) !== 0xe0) {
    return null;
  }
  const b1 = buffer[offset + 1]!;
  const b2 = buffer[offset + 2]!;
  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  if (versionBits === 1 || layerBits !== 1) return null;

  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const isMpeg1 = versionBits === 3;
  const bitrateKbps = isMpeg1
    ? MPEG1_LAYER3_BITRATE[bitrateIndex]
    : MPEG2_LAYER3_BITRATE[bitrateIndex];
  const sampleRate = isMpeg1
    ? MPEG1_SAMPLE_RATE[sampleRateIndex]
    : versionBits === 2
      ? MPEG2_SAMPLE_RATE[sampleRateIndex]
      : MPEG25_SAMPLE_RATE[sampleRateIndex];
  if (!bitrateKbps || !sampleRate) return null;

  const samplesPerFrame = isMpeg1 ? 1152 : 576;
  const frameLength = Math.floor((samplesPerFrame * bitrateKbps * 125) / sampleRate) + padding;
  if (frameLength < 4) return null;
  const channelMode = (buffer[offset + 3]! >> 6) & 0x03;
  const channels = channelMode === 3 ? 1 : 2;
  return {
    bitrate: bitrateKbps * 1000,
    sampleRate,
    samplesPerFrame,
    frameLength,
    version: versionBits,
    channels,
  };
}

function xingOffset(frame: MpegFrame): number {
  if (frame.version === 3) {
    return frame.channels === 1 ? 21 : 36;
  }
  return frame.channels === 1 ? 13 : 21;
}

function xingFrames(buffer: Buffer, frameOffset: number, frame: MpegFrame): number | null {
  const offset = frameOffset + xingOffset(frame);
  if (offset + 8 > buffer.length) return null;
  const tag = buffer.toString("ascii", offset, offset + 4);
  if (tag !== "Xing" && tag !== "Info") return null;
  const flags = buffer.readUInt32BE(offset + 4);
  if ((flags & 0x01) === 0 || offset + 12 > buffer.length) return null;
  return buffer.readUInt32BE(offset + 8);
}

function mp3DurationMs(buffer: Buffer): number | null {
  const start = skipId3(buffer);
  let offset = start;
  while (offset + 4 < buffer.length && !(buffer[offset] === 0xff && (buffer[offset + 1]! & 0xe0) === 0xe0)) {
    offset += 1;
  }
  const frame = parseMpegFrame(buffer, offset);
  if (!frame) return null;

  const frames = xingFrames(buffer, offset, frame);
  if (frames && frames > 0) {
    return Math.round((frames * frame.samplesPerFrame * 1000) / frame.sampleRate);
  }

  const audioBytes = buffer.length - offset;
  if (frame.bitrate <= 0) return null;
  return Math.round((audioBytes * 8 * 1000) / frame.bitrate);
}

export function audioDurationMs(buffer: Buffer): number | null {
  if (buffer.length < 12) return null;
  if (buffer.toString("ascii", 0, 4) === "RIFF") {
    return wavDurationMs(buffer);
  }
  return mp3DurationMs(buffer);
}

export function formatListenClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatListenRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")} h`;
  }
  if (minutes > 0) {
    return seconds === 0 ? `${minutes} min` : `${minutes}:${String(seconds).padStart(2, "0")} min`;
  }
  return `${seconds}s`;
}
