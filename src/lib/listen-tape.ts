export type TapeMarker = {
  clipIndex: number;
  startSec: number;
  endSec: number;
};

export type ListenTape = {
  blob: Blob;
  durationSec: number;
  markers: TapeMarker[];
};

export function encodePcmWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function concatMono(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function resampleMono(
  buffer: AudioBuffer,
  targetRate: number,
): Float32Array {
  const channels = Math.max(1, buffer.numberOfChannels);
  const srcRate = buffer.sampleRate;
  const length = Math.max(1, Math.round((buffer.length * targetRate) / srcRate));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const srcPos = (i * srcRate) / targetRate;
    const index = Math.floor(srcPos);
    const frac = srcPos - index;
    let sample = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      const a = data[Math.min(index, data.length - 1)] ?? 0;
      const b = data[Math.min(index + 1, data.length - 1)] ?? 0;
      sample += a + (b - a) * frac;
    }
    out[i] = sample / channels;
  }
  return out;
}

function silence(sampleRate: number, durationMs: number): Float32Array {
  return new Float32Array(
    Math.max(1, Math.round((Math.max(0, durationMs) / 1000) * sampleRate)),
  );
}

async function decodeUrl(
  ctx: AudioContext,
  url: string,
): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`AUDIO_PLAY_FAILED`);
  }
  const bytes = await response.arrayBuffer();
  return ctx.decodeAudioData(bytes.slice(0));
}

export async function buildListenTape(
  clips: Array<{ url: string; pauseBeforeMs: number }>,
  options?: { skipFirstPause?: boolean; sampleRate?: number },
): Promise<ListenTape> {
  const sampleRate = options?.sampleRate ?? 22050;
  const Offline =
    window.OfflineAudioContext ||
    (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!Offline) throw new Error("AUDIO_PLAY_FAILED");
  const ctx = new Offline(1, 1, sampleRate);

  const parts: Float32Array[] = [];
  const markers: TapeMarker[] = [];
  let cursor = 0;

  try {
    for (let i = 0; i < clips.length; i += 1) {
      const clip = clips[i]!;
      if (clip.pauseBeforeMs > 0 && !(options?.skipFirstPause && i === 0)) {
        const gap = silence(sampleRate, clip.pauseBeforeMs);
        parts.push(gap);
        cursor += gap.length;
      }
      const decoded = await decodeUrl(ctx, clip.url);
      const samples = resampleMono(decoded, sampleRate);
      const startSec = cursor / sampleRate;
      parts.push(samples);
      cursor += samples.length;
      markers.push({
        clipIndex: i,
        startSec,
        endSec: cursor / sampleRate,
      });
    }
  } finally {
    if ("close" in ctx && typeof ctx.close === "function") {
      void ctx.close();
    }
  }

  const pcm = concatMono(parts);
  return {
    blob: encodePcmWav(pcm, sampleRate),
    durationSec: pcm.length / sampleRate,
    markers,
  };
}

export function markerAtTime(
  markers: TapeMarker[],
  timeSec: number,
): TapeMarker | null {
  if (markers.length === 0) return null;
  if (!Number.isFinite(timeSec)) return markers[0] ?? null;
  let lastStarted: TapeMarker | null = null;
  for (const marker of markers) {
    if (timeSec < marker.startSec) {
      return lastStarted ?? marker;
    }
    lastStarted = marker;
    if (timeSec < marker.endSec) return marker;
  }
  return lastStarted;
}
