import type { DailyListenSource } from "~/lib/daily-listen";
import type { PlaybackClip } from "~/lib/satz-tts";

export const OFFLINE_DB_NAME = "sprachen-offline";
export const OFFLINE_DB_VERSION = 1;
export const OFFLINE_STORE = "daily";
export const OFFLINE_RECORD_ID = "current";
export const OFFLINE_AUDIO_CACHE = "sprachen-daily-audio-v1";

export type OfflineDailyRecord = {
  id: typeof OFFLINE_RECORD_ID;
  packageId: string;
  date: string;
  targetLang: string;
  savedAt: string;
  items: DailyListenSource[];
};

export type OfflineDailySource = {
  id: string;
  date: string;
  targetLang: string;
  items: DailyListenSource[];
};

export function normalizeClipUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://sprachen.local");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function collectClipUrls(
  items: Array<{ clips: Array<Pick<PlaybackClip, "url">> }>,
): string[] {
  const urls = new Set<string>();
  for (const item of items) {
    for (const clip of item.clips) {
      if (clip.url) urls.add(normalizeClipUrl(clip.url));
    }
  }
  return [...urls];
}

export function remapItemClips<T extends { clips: PlaybackClip[] }>(
  items: T[],
  urlMap: Map<string, string>,
): T[] {
  return items.map((item) => ({
    ...item,
    clips: item.clips.map((clip) => {
      const mapped = urlMap.get(normalizeClipUrl(clip.url));
      return mapped ? { ...clip, url: mapped } : clip;
    }),
  }));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        db.createObjectStore(OFFLINE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open offline database"));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function loadOfflineDaily(): Promise<OfflineDailyRecord | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    const tx = db.transaction(OFFLINE_STORE, "readonly");
    const record = await idbRequest(
      tx.objectStore(OFFLINE_STORE).get(OFFLINE_RECORD_ID),
    );
    return (record as OfflineDailyRecord | undefined) ?? null;
  } finally {
    db.close();
  }
}

async function putOfflineDaily(record: OfflineDailyRecord): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(OFFLINE_STORE, "readwrite");
    tx.objectStore(OFFLINE_STORE).put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("Failed to store offline daily"));
      tx.onabort = () =>
        reject(tx.error ?? new Error("Offline daily store aborted"));
    });
  } finally {
    db.close();
  }
}

export async function cacheOfflineAudio(
  urls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  await caches.delete(OFFLINE_AUDIO_CACHE);
  const cache = await caches.open(OFFLINE_AUDIO_CACHE);
  const total = urls.length;
  let done = 0;
  onProgress?.(0, total);
  for (const url of urls) {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(`Audio download failed (${response.status}): ${url}`);
    }
    await cache.put(url, response);
    done += 1;
    onProgress?.(done, total);
  }
}

export function requestShellCache(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type: "CACHE_SHELL" });
  });
}

export async function saveDailyOffline(
  source: OfflineDailySource,
  onProgress?: (done: number, total: number) => void,
): Promise<OfflineDailyRecord> {
  const items = source.items.map((item) => ({
    ...item,
    clips: item.clips.map((clip) => ({
      ...clip,
      url: normalizeClipUrl(clip.url),
    })),
  }));
  const urls = collectClipUrls(items);
  await cacheOfflineAudio(urls, onProgress);
  const record: OfflineDailyRecord = {
    id: OFFLINE_RECORD_ID,
    packageId: source.id,
    date: source.date,
    targetLang: source.targetLang,
    savedAt: new Date().toISOString(),
    items,
  };
  await putOfflineDaily(record);
  requestShellCache();
  return record;
}

export async function hydrateOfflineItems(
  items: DailyListenSource[],
): Promise<{ items: DailyListenSource[]; blobUrls: string[] }> {
  const cache = await caches.open(OFFLINE_AUDIO_CACHE);
  const urlMap = new Map<string, string>();
  const blobUrls: string[] = [];
  for (const url of collectClipUrls(items)) {
    const cached = await cache.match(url);
    if (!cached) continue;
    const objectUrl = URL.createObjectURL(await cached.blob());
    urlMap.set(url, objectUrl);
    blobUrls.push(objectUrl);
  }
  return { items: remapItemClips(items, urlMap), blobUrls };
}

export function revokeBlobUrls(urls: string[]): void {
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
}
