import confetti from "canvas-confetti";
import type { CelebrationIntensity } from "~/lib/gamification-config";

export function fireConfetti(intensity: CelebrationIntensity) {
  if (typeof window === "undefined") return;
  if (intensity === "none" || intensity === "small") return;

  if (intensity === "medium") {
    void confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.7 },
    });
    return;
  }

  void confetti({
    particleCount: 140,
    spread: 80,
    origin: { y: 0.6 },
  });
  void confetti({
    particleCount: 70,
    angle: 60,
    spread: 55,
    origin: { x: 0 },
  });
  void confetti({
    particleCount: 70,
    angle: 120,
    spread: 55,
    origin: { x: 1 },
  });
}
