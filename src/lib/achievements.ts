export type AchievementCategory =
  | "streak"
  | "diligence"
  | "mastery"
  | "session"
  | "recovery"
  | "worksheet"
  | "conjugation"
  | "comeback";

export type AchievementIcon =
  | "flame"
  | "zap"
  | "trophy"
  | "sparkles"
  | "shield"
  | "notebook"
  | "bookOpen"
  | "rotateCcw";

export type AchievementDefinition = {
  key: string;
  category: AchievementCategory;
  icon: AchievementIcon;
  threshold?: number;
};

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { key: "streak_3", category: "streak", icon: "flame", threshold: 3 },
  { key: "streak_7", category: "streak", icon: "flame", threshold: 7 },
  { key: "streak_30", category: "streak", icon: "flame", threshold: 30 },
  { key: "streak_100", category: "streak", icon: "flame", threshold: 100 },
  { key: "answers_100", category: "diligence", icon: "zap", threshold: 100 },
  { key: "answers_500", category: "diligence", icon: "zap", threshold: 500 },
  { key: "answers_2500", category: "diligence", icon: "zap", threshold: 2500 },
  { key: "box6_10", category: "mastery", icon: "trophy", threshold: 10 },
  { key: "box6_50", category: "mastery", icon: "trophy", threshold: 50 },
  { key: "box6_150", category: "mastery", icon: "trophy", threshold: 150 },
  { key: "perfect_session", category: "session", icon: "sparkles", threshold: 10 },
  { key: "leech_slayer", category: "recovery", icon: "shield" },
  { key: "worksheet_1", category: "worksheet", icon: "notebook", threshold: 1 },
  { key: "worksheet_10", category: "worksheet", icon: "notebook", threshold: 10 },
  { key: "conjugation_pro", category: "conjugation", icon: "bookOpen" },
  { key: "comeback", category: "comeback", icon: "rotateCcw" },
] as const;

export const ACHIEVEMENT_BY_KEY = Object.fromEntries(
  ACHIEVEMENTS.map((achievement) => [achievement.key, achievement]),
) as Record<string, AchievementDefinition>;

export function achievementKeys(): string[] {
  return ACHIEVEMENTS.map((achievement) => achievement.key);
}
