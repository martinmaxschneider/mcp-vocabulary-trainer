/** Silent PCM WAV so iOS can keep a media session alive between clips. */
export function createSilentWavBlob(
  durationMs: number,
  sampleRate = 8000,
): Blob {
  const samples = Math.max(
    1,
    Math.round((Math.max(0, durationMs) / 1000) * sampleRate),
  );
  const dataSize = samples * 2;
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
  return new Blob([buffer], { type: "audio/wav" });
}

const silentUrlCache = new Map<number, string>();

export function silentAudioUrl(durationMs: number): string {
  const key = Math.max(50, Math.round(durationMs));
  const cached = silentUrlCache.get(key);
  if (cached) return cached;
  const url = URL.createObjectURL(createSilentWavBlob(key));
  silentUrlCache.set(key, url);
  return url;
}
