export const DEFAULT_DAILY_GOAL_XP = 50;

export const XP = {
  correct: 10,
  typo: 5,
  wrong: 2,
  worksheetComplete: 25,
} as const;

export const LEECH_WRONG_THRESHOLD = 6;
export const LEECH_SUCCESS_RATE = 0.5;
export const LEECH_RECOVERY_BOX = 4;

export const CONJUGATION_PRO_MIN_BOX = 4;
export const COMEBACK_GAP_DAYS = 7;

export type CelebrationIntensity = "none" | "small" | "medium" | "large";

export type CelebrationKind =
  | "dailyGoal"
  | "streakMilestone"
  | "achievement"
  | "perfectSession";

export type CelebrationRule = {
  intensity: CelebrationIntensity;
  enabled: boolean;
  minCards?: number;
  thresholds?: readonly number[];
};

/**
 * Tune celebration frequency here. Downgrade intensity or set enabled=false
 * if the app feels too festive for small amounts of practice.
 */
export const CELEBRATIONS = {
  dailyGoal: {
    intensity: "medium",
    enabled: true,
  },
  streakMilestone: {
    intensity: "large",
    enabled: true,
    thresholds: [3, 7, 30, 100],
  },
  achievement: {
    intensity: "large",
    enabled: true,
  },
  perfectSession: {
    intensity: "medium",
    enabled: true,
    minCards: 10,
  },
} as Record<CelebrationKind, CelebrationRule>;

export const LEVELS = [
  { key: "beginner", minXp: 0 },
  { key: "learner", minXp: 200 },
  { key: "intermediate", minXp: 800 },
  { key: "advanced", minXp: 2000 },
  { key: "fluent", minXp: 5000 },
  { key: "master", minXp: 10000 },
] as const;

export type LevelKey = (typeof LEVELS)[number]["key"];

export type LangXpBreakdown = {
  xp: number;
  answers: number;
  correct: number;
};

export function xpForAnswer(isCorrect: boolean, isTypo = false): number {
  if (isCorrect && isTypo) return XP.typo;
  if (isCorrect) return XP.correct;
  return XP.wrong;
}

export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDateString(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days);
  return localDateString(next);
}

export function cardMasteryShare(box: number): number {
  if (box <= 1) return 0;
  if (box >= 6) return 1;
  return (box - 1) / 5;
}

export function masteryPercent(
  progressed: Iterable<{ box: number }>,
  availableCount: number,
): number {
  let sum = 0;
  let counted = 0;
  for (const item of progressed) {
    sum += cardMasteryShare(item.box);
    counted += 1;
  }
  const total = Math.max(availableCount, counted);
  if (total <= 0) return 0;
  return Math.round((sum / total) * 100);
}

export function levelForXp(xp: number): {
  key: LevelKey;
  index: number;
  minXp: number;
  nextMinXp: number | null;
} {
  let current: (typeof LEVELS)[number] = LEVELS[0]!;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i]!;
    if (xp >= level.minXp) {
      current = level;
      index = i;
    }
  }
  const next = LEVELS[index + 1];
  return {
    key: current.key,
    index,
    minXp: current.minXp,
    nextMinXp: next?.minXp ?? null,
  };
}

export function computeStreak(
  days: Iterable<{ date: string; xp: number }>,
  goalXp: number,
  today: string,
): number {
  const byDate = new Map<string, number>();
  for (const day of days) {
    byDate.set(day.date, day.xp);
  }

  let cursor = today;
  const todayXp = byDate.get(today) ?? 0;
  if (todayXp < goalXp) {
    cursor = shiftDateString(today, -1);
  }

  let streak = 0;
  while ((byDate.get(cursor) ?? 0) >= goalXp) {
    streak += 1;
    cursor = shiftDateString(cursor, -1);
  }
  return streak;
}

export function isStreakMilestone(streak: number): boolean {
  return (CELEBRATIONS.streakMilestone.thresholds ?? []).includes(streak);
}

export type CelebrationEvent = {
  kind: CelebrationKind;
  intensity: CelebrationIntensity;
  achievementKey?: string;
  streakDays?: number;
};

export type CelebrationInput = {
  goalReachedNow?: boolean;
  streakMilestoneNow?: number | null;
  newAchievementKeys?: string[];
  perfectSession?: boolean;
  sessionAnswers?: number;
};

const INTENSITY_RANK: Record<CelebrationIntensity, number> = {
  none: 0,
  small: 1,
  medium: 2,
  large: 3,
};

export function resolveCelebrations(input: CelebrationInput): CelebrationEvent[] {
  const events: CelebrationEvent[] = [];

  if (
    CELEBRATIONS.achievement.enabled &&
    CELEBRATIONS.achievement.intensity !== "none"
  ) {
    for (const key of input.newAchievementKeys ?? []) {
      events.push({
        kind: "achievement",
        intensity: CELEBRATIONS.achievement.intensity,
        achievementKey: key,
      });
    }
  }

  if (
    input.streakMilestoneNow &&
    CELEBRATIONS.streakMilestone.enabled &&
    CELEBRATIONS.streakMilestone.intensity !== "none" &&
    isStreakMilestone(input.streakMilestoneNow)
  ) {
    events.push({
      kind: "streakMilestone",
      intensity: CELEBRATIONS.streakMilestone.intensity,
      streakDays: input.streakMilestoneNow,
    });
  }

  if (
    input.goalReachedNow &&
    CELEBRATIONS.dailyGoal.enabled &&
    CELEBRATIONS.dailyGoal.intensity !== "none"
  ) {
    events.push({
      kind: "dailyGoal",
      intensity: CELEBRATIONS.dailyGoal.intensity,
    });
  }

  const minCards = CELEBRATIONS.perfectSession.minCards ?? 0;
  if (
    input.perfectSession &&
    (input.sessionAnswers ?? 0) >= minCards &&
    CELEBRATIONS.perfectSession.enabled &&
    CELEBRATIONS.perfectSession.intensity !== "none"
  ) {
    events.push({
      kind: "perfectSession",
      intensity: CELEBRATIONS.perfectSession.intensity,
    });
  }

  return events.sort(
    (a, b) => INTENSITY_RANK[b.intensity] - INTENSITY_RANK[a.intensity],
  );
}

export function maxCelebrationIntensity(
  events: CelebrationEvent[],
): CelebrationIntensity {
  return events.reduce<CelebrationIntensity>(
    (max, event) =>
      INTENSITY_RANK[event.intensity] > INTENSITY_RANK[max]
        ? event.intensity
        : max,
    "none",
  );
}

export function parseByLang(value: unknown): Record<string, LangXpBreakdown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, LangXpBreakdown> = {};
  for (const [lang, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Partial<LangXpBreakdown>;
    result[lang] = {
      xp: Number(row.xp) || 0,
      answers: Number(row.answers) || 0,
      correct: Number(row.correct) || 0,
    };
  }
  return result;
}
