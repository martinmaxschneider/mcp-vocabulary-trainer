"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "~/components/ui/button";
import { LISTEN_PAUSE_MS } from "~/lib/satz-tts";

export function SatzAudioButton({
  url,
  urls,
  label,
}: {
  url?: string;
  urls?: string[];
  label: string;
}) {
  const queue = (urls ?? (url ? [url] : [])).filter(Boolean);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef(false);

  const stop = () => {
    stopRef.current = true;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  };

  const playUrl = (src: string) =>
    new Promise<void>((resolve, reject) => {
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("AUDIO_PLAY_FAILED"));
      void audio.play().catch(reject);
    });

  const toggle = () => {
    if (playing) {
      stop();
      return;
    }
    if (queue.length === 0) return;
    stopRef.current = false;
    setPlaying(true);
    void (async () => {
      try {
        for (let i = 0; i < queue.length; i++) {
          if (stopRef.current) break;
          await playUrl(queue[i]!);
          if (stopRef.current) break;
          if (i < queue.length - 1) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, LISTEN_PAUSE_MS);
            });
          }
        }
      } catch {
        // playback failed
      } finally {
        audioRef.current = null;
        setPlaying(false);
      }
    })();
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={toggle}
      aria-label={label}
      disabled={queue.length === 0}
    >
      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </Button>
  );
}
