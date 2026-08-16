export type WeekDayStatus = {
  date: string;
  xp: number;
  goalMet: boolean;
};

export type NewAchievement = {
  key: string;
};

export type GamificationResult = {
  xpEarned: number;
  xpToday: number;
  dailyGoalXp: number;
  goalReachedNow: boolean;
  streak: number;
  longestStreak: number;
  streakMilestoneNow: number | null;
  newAchievements: NewAchievement[];
  week: WeekDayStatus[];
};

export type LanguageMastery = {
  language: string;
  languageName: string;
  masteryPercent: number;
  levelKey: string;
  levelIndex: number;
  xp: number;
  nextLevelXp: number | null;
};
