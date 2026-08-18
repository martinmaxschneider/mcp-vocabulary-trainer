"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "~/components/ui/button";

export function SatzAudioButton({
  url,
  label,
}: {
  url: string;
  label: string;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  };

  const toggle = () => {
    if (playing) {
      stop();
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = stop;
    audio.onerror = stop;
    setPlaying(true);
    void audio.play().catch(stop);
  };

  return (
    <Button type="button" size="icon" variant="ghost" onClick={toggle} aria-label={label}>
      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </Button>
  );
}
