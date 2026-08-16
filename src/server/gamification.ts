import { CardType, Prisma, WorksheetStatus, type PrismaClient } from "@prisma/client";
import { ACHIEVEMENTS, ACHIEVEMENT_BY_KEY } from "~/lib/achievements";
import {
  CELEBRATIONS,
  COMEBACK_GAP_DAYS,
  CONJUGATION_PRO_MIN_BOX,
  DEFAULT_DAILY_GOAL_XP,
  LEECH_RECOVERY_BOX,
  LEECH_SUCCESS_RATE,
  LEECH_WRONG_THRESHOLD,
  XP,
  computeStreak,
  isStreakMilestone,
  levelForXp,
  localDateString,
  masteryPercent,
  parseByLang,
  shiftDateString,
  xpForAnswer,
  type LangXpBreakdown,
} from "~/lib/gamification-config";
import {
  getConjugationProfile,
  isValidTense,
} from "~/lib/conjugation-catalog";
import { conjugationCardKey } from "~/lib/leitner";
import { LANGUAGE_NAMES, TARGET_LANG_CODES } from "~/lib/languages";
import { SINGLE_USER_ID } from "~/lib/constants";
import type {
  GamificationResult,
  LanguageMastery,
  NewAchievement,
  WeekDayStatus,
} from "~/lib/gamification-types";

export type {
  GamificationResult,
  LanguageMastery,
  NewAchievement,
  WeekDayStatus,
};

type Db = PrismaClient | Prisma.TransactionClient;

export type ActivityItem = {
  targetLang: string;
  isCorrect: boolean;
  isTypo?: boolean;
};

export type RecordActivityInput = {
  items: ActivityItem[];
  worksheetCompleted?: boolean;
  worksheetTargetLang?: string;
  flags?: {
    leechRecovered?: boolean;
    conjugationPro?: boolean;
  };
};

const emptyResult = (dailyGoalXp: number): GamificationResult => ({
  xpEarned: 0,
  xpToday: 0,
  dailyGoalXp,
  goalReachedNow: false,
  streak: 0,
  longestStreak: 0,
  streakMilestoneNow: null,
  newAchievements: [],
  week: [],
});

export function wasLeech(wrongCount: number, correctCount: number): boolean {
  const total = wrongCount + correctCount;
  const successRate = total > 0 ? correctCount / total : 0;
  return wrongCount >= LEECH_WRONG_THRESHOLD && successRate < LEECH_SUCCESS_RATE;
}

export function leechRecovered(params: {
  wrongCount: number;
  correctCount: number;
  boxBefore: number;
  boxAfter: number;
}): boolean {
  return (
    wasLeech(params.wrongCount, params.correctCount) &&
    params.boxBefore < LEECH_RECOVERY_BOX &&
    params.boxAfter >= LEECH_RECOVERY_BOX
  );
}

export async function isConjugationPro(
  db: Db,
  userId: string,
  entryId: string,
  targetLang: string,
): Promise<boolean> {
  const profile = getConjugationProfile(targetLang);
  if (!profile) return false;

  const forms = await db.conjugationForm.findMany({
    where: { translation: { entryId, lang: targetLang } },
    select: { tenseKey: true },
  });
  const tenseKeys = [
    ...new Set(
      forms
        .map((form) => form.tenseKey)
        .filter((key) => isValidTense(targetLang, key)),
    ),
  ];
  if (tenseKeys.length === 0) return false;

  const progresses = await db.userProgress.findMany({
    where: {
      userId,
      entryId,
      targetLang,
      cardType: CardType.CONJUGATION,
    },
    select: { cardKey: true, box: true },
  });
  const byKey = new Map(progresses.map((row) => [row.cardKey, row.box]));
  return tenseKeys.every(
    (key) => (byKey.get(conjugationCardKey(key)) ?? 0) >= CONJUGATION_PRO_MIN_BOX,
  );
}

export async function getOrCreateSettings(db: Db, userId: string) {
  const existing = await db.gamificationSettings.findUnique({
    where: { userId },
  });
  if (existing) return existing;
  return db.gamificationSettings.create({
    data: {
      userId,
      dailyGoalXp: DEFAULT_DAILY_GOAL_XP,
      longestStreak: 0,
    },
  });
}

function mergeByLang(
  current: Record<string, LangXpBreakdown>,
  lang: string,
  delta: LangXpBreakdown,
): Record<string, LangXpBreakdown> {
  const prev = current[lang] ?? { xp: 0, answers: 0, correct: 0 };
  return {
    ...current,
    [lang]: {
      xp: prev.xp + delta.xp,
      answers: prev.answers + delta.answers,
      correct: prev.correct + delta.correct,
    },
  };
}

async function loadRecentDays(db: Db, userId: string, today: string, days: number) {
  const from = shiftDateString(today, -(days - 1));
  return db.dailyActivity.findMany({
    where: { userId, date: { gte: from } },
    orderBy: { date: "asc" },
  });
}

function buildWeek(
  rows: Array<{ date: string; xp: number }>,
  today: string,
  goalXp: number,
): WeekDayStatus[] {
  const byDate = new Map(rows.map((row) => [row.date, row.xp]));
  const week: WeekDayStatus[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = shiftDateString(today, -i);
    const xp = byDate.get(date) ?? 0;
    week.push({ date, xp, goalMet: xp >= goalXp });
  }
  return week;
}

async function unlockAchievements(
  db: Db,
  userId: string,
  keys: string[],
  extra?: { targetLang?: string },
): Promise<NewAchievement[]> {
  const unique = [...new Set(keys)].filter((key) => ACHIEVEMENT_BY_KEY[key]);
  if (unique.length === 0) return [];

  const already = await db.unlockedAchievement.findMany({
    where: { userId, key: { in: unique } },
    select: { key: true },
  });
  const have = new Set(already.map((row) => row.key));
  const fresh = unique.filter((key) => !have.has(key));
  if (fresh.length === 0) return [];

  await db.unlockedAchievement.createMany({
    data: fresh.map((key) => ({
      userId,
      key,
      targetLang: extra?.targetLang,
    })),
  });
  return fresh.map((key) => ({ key }));
}

async function evaluateProgressAchievements(
  db: Db,
  userId: string,
  input: {
    streak: number;
    flags?: RecordActivityInput["flags"];
    worksheetCompleted?: boolean;
    today: string;
    hadPriorActivity: boolean;
    lastActivityDate: string | null;
  },
): Promise<string[]> {
  const keys: string[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (achievement.category === "streak" && achievement.threshold) {
      if (input.streak >= achievement.threshold) keys.push(achievement.key);
    }
  }

  const [answers, box6, worksheets] = await Promise.all([
    db.dailyActivity.aggregate({
      where: { userId },
      _sum: { answersCount: true },
    }),
    db.userProgress.count({
      where: { userId, box: 6 },
    }),
    db.worksheet.count({
      where: { status: WorksheetStatus.COMPLETED },
    }),
  ]);

  const totalAnswers = answers._sum.answersCount ?? 0;
  for (const achievement of ACHIEVEMENTS) {
    if (achievement.category === "diligence" && achievement.threshold) {
      if (totalAnswers >= achievement.threshold) keys.push(achievement.key);
    }
    if (achievement.category === "mastery" && achievement.threshold) {
      if (box6 >= achievement.threshold) keys.push(achievement.key);
    }
    if (achievement.category === "worksheet" && achievement.threshold) {
      if (worksheets >= achievement.threshold) keys.push(achievement.key);
    }
  }

  if (input.flags?.leechRecovered) keys.push("leech_slayer");
  if (input.flags?.conjugationPro) keys.push("conjugation_pro");

  if (input.hadPriorActivity && input.lastActivityDate) {
    const gapStart = shiftDateString(input.today, -COMEBACK_GAP_DAYS);
    if (input.lastActivityDate <= gapStart) keys.push("comeback");
  }

  return keys;
}

export async function backfillDailyActivityIfNeeded(
  db: Db,
  userId: string,
): Promise<void> {
  const existing = await db.dailyActivity.count({ where: { userId } });
  if (existing > 0) return;

  const logs = await db.reviewLog.findMany({
    where: { userProgress: { userId } },
    select: {
      createdAt: true,
      isCorrect: true,
      typo: true,
      targetLang: true,
    },
  });
  const worksheetAnswers = await db.worksheetAnswer.findMany({
    select: {
      checkedAt: true,
      autoCorrect: true,
      isTypo: true,
      manualOverride: true,
      question: { select: { worksheet: { select: { targetLang: true } } } },
    },
  });

  if (logs.length === 0 && worksheetAnswers.length === 0) return;

  type Acc = {
    xp: number;
    answers: number;
    correct: number;
    byLang: Record<string, LangXpBreakdown>;
  };
  const byDate = new Map<string, Acc>();

  const add = (
    date: string,
    lang: string,
    isCorrect: boolean,
    isTypo: boolean,
  ) => {
    const xp = xpForAnswer(isCorrect, isTypo);
    const current = byDate.get(date) ?? {
      xp: 0,
      answers: 0,
      correct: 0,
      byLang: {},
    };
    current.xp += xp;
    current.answers += 1;
    if (isCorrect) current.correct += 1;
    current.byLang = mergeByLang(current.byLang, lang, {
      xp,
      answers: 1,
      correct: isCorrect ? 1 : 0,
    });
    byDate.set(date, current);
  };

  for (const log of logs) {
    add(
      localDateString(log.createdAt),
      log.targetLang,
      log.isCorrect,
      log.typo,
    );
  }

  for (const answer of worksheetAnswers) {
    const isCorrect =
      answer.manualOverride === true
        ? true
        : answer.manualOverride === false
          ? false
          : answer.autoCorrect;
    add(
      localDateString(answer.checkedAt),
      answer.question.worksheet.targetLang,
      isCorrect,
      answer.isTypo,
    );
  }

  const completed = await db.worksheet.findMany({
    where: { status: WorksheetStatus.COMPLETED, completedAt: { not: null } },
    select: { completedAt: true, targetLang: true },
  });
  for (const worksheet of completed) {
    if (!worksheet.completedAt) continue;
    const date = localDateString(worksheet.completedAt);
    const current = byDate.get(date) ?? {
      xp: 0,
      answers: 0,
      correct: 0,
      byLang: {},
    };
    current.xp += XP.worksheetComplete;
    current.byLang = mergeByLang(current.byLang, worksheet.targetLang, {
      xp: XP.worksheetComplete,
      answers: 0,
      correct: 0,
    });
    byDate.set(date, current);
  }

  if (byDate.size === 0) return;

  await db.dailyActivity.createMany({
    data: [...byDate.entries()].map(([date, acc]) => ({
      userId,
      date,
      xp: acc.xp,
      answersCount: acc.answers,
      correctCount: acc.correct,
      byLang: acc.byLang as Prisma.InputJsonValue,
    })),
  });
}

export async function recordActivity(
  db: Db,
  userId: string,
  input: RecordActivityInput,
): Promise<GamificationResult> {
  await backfillDailyActivityIfNeeded(db, userId);
  const settings = await getOrCreateSettings(db, userId);
  const today = localDateString();

  if (input.items.length === 0 && !input.worksheetCompleted) {
    const recent = await loadRecentDays(db, userId, today, 120);
    const streak = computeStreak(recent, settings.dailyGoalXp, today);
    return {
      ...emptyResult(settings.dailyGoalXp),
      xpToday: recent.find((row) => row.date === today)?.xp ?? 0,
      streak,
      longestStreak: Math.max(settings.longestStreak, streak),
      week: buildWeek(recent, today, settings.dailyGoalXp),
    };
  }

  let xpEarned = 0;
  let answers = 0;
  let correct = 0;
  let byLangDelta: Record<string, LangXpBreakdown> = {};

  for (const item of input.items) {
    const xp = xpForAnswer(item.isCorrect, item.isTypo);
    xpEarned += xp;
    answers += 1;
    if (item.isCorrect) correct += 1;
    byLangDelta = mergeByLang(byLangDelta, item.targetLang, {
      xp,
      answers: 1,
      correct: item.isCorrect ? 1 : 0,
    });
  }

  if (input.worksheetCompleted) {
    const lang = input.worksheetTargetLang ?? "und";
    xpEarned += XP.worksheetComplete;
    byLangDelta = mergeByLang(byLangDelta, lang, {
      xp: XP.worksheetComplete,
      answers: 0,
      correct: 0,
    });
  }

  const existing = await db.dailyActivity.findUnique({
    where: { userId_date: { userId, date: today } },
  });
  const xpBefore = existing?.xp ?? 0;
  const mergedByLang = { ...parseByLang(existing?.byLang) };
  for (const [lang, delta] of Object.entries(byLangDelta)) {
    mergedByLang[lang] = {
      xp: (mergedByLang[lang]?.xp ?? 0) + delta.xp,
      answers: (mergedByLang[lang]?.answers ?? 0) + delta.answers,
      correct: (mergedByLang[lang]?.correct ?? 0) + delta.correct,
    };
  }

  const updated = await db.dailyActivity.upsert({
    where: { userId_date: { userId, date: today } },
    create: {
      userId,
      date: today,
      xp: xpEarned,
      answersCount: answers,
      correctCount: correct,
      byLang: mergedByLang as Prisma.InputJsonValue,
    },
    update: {
      xp: { increment: xpEarned },
      answersCount: { increment: answers },
      correctCount: { increment: correct },
      byLang: mergedByLang as Prisma.InputJsonValue,
    },
  });

  const recent = await db.dailyActivity.findMany({
    where: { userId },
    orderBy: { date: "asc" },
    select: { date: true, xp: true },
  });
  const streak = computeStreak(recent, settings.dailyGoalXp, today);
  const longestStreak = Math.max(settings.longestStreak, streak);
  if (longestStreak !== settings.longestStreak) {
    await db.gamificationSettings.update({
      where: { id: settings.id },
      data: { longestStreak },
    });
  }

  const goalReachedNow =
    xpBefore < settings.dailyGoalXp && updated.xp >= settings.dailyGoalXp;
  const streakMilestoneNow =
    goalReachedNow && isStreakMilestone(streak) ? streak : null;

  const priorDays = recent.filter((row) => row.date < today);
  const lastActivityDate = priorDays.at(-1)?.date ?? null;

  const candidateKeys = await evaluateProgressAchievements(db, userId, {
    streak,
    flags: input.flags,
    worksheetCompleted: input.worksheetCompleted,
    today,
    hadPriorActivity: priorDays.length > 0,
    lastActivityDate,
  });
  const newAchievements = await unlockAchievements(db, userId, candidateKeys);

  return {
    xpEarned,
    xpToday: updated.xp,
    dailyGoalXp: settings.dailyGoalXp,
    goalReachedNow,
    streak,
    longestStreak,
    streakMilestoneNow,
    newAchievements,
    week: buildWeek(recent, today, settings.dailyGoalXp),
  };
}

export async function reportPerfectSession(
  db: Db,
  userId: string,
  input: { answers: number; correct: number },
): Promise<GamificationResult> {
  await backfillDailyActivityIfNeeded(db, userId);
  const settings = await getOrCreateSettings(db, userId);
  const today = localDateString();
  const recent = await db.dailyActivity.findMany({
    where: { userId },
    orderBy: { date: "asc" },
    select: { date: true, xp: true },
  });
  const streak = computeStreak(recent, settings.dailyGoalXp, today);
  const todayRow = recent.find((row) => row.date === today);
  const minCards = CELEBRATIONS.perfectSession.minCards ?? 10;
  const perfect =
    input.answers >= minCards && input.correct === input.answers && input.answers > 0;
  const newAchievements = perfect
    ? await unlockAchievements(db, userId, ["perfect_session"])
    : [];

  return {
    xpEarned: 0,
    xpToday: todayRow?.xp ?? 0,
    dailyGoalXp: settings.dailyGoalXp,
    goalReachedNow: false,
    streak,
    longestStreak: Math.max(settings.longestStreak, streak),
    streakMilestoneNow: null,
    newAchievements,
    week: buildWeek(recent, today, settings.dailyGoalXp),
  };
}

export async function getGamificationStatus(db: PrismaClient, userId: string) {
  await backfillDailyActivityIfNeeded(db, userId);
  const settings = await getOrCreateSettings(db, userId);
  const today = localDateString();
  const recent = await db.dailyActivity.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });
  const streak = computeStreak(recent, settings.dailyGoalXp, today);
  const todayRow = recent.find((row) => row.date === today);
  const xpByLang: Record<string, number> = {};
  for (const row of recent) {
    for (const [lang, breakdown] of Object.entries(parseByLang(row.byLang))) {
      xpByLang[lang] = (xpByLang[lang] ?? 0) + breakdown.xp;
    }
  }

  const langs = [...TARGET_LANG_CODES];
  const progresses = await db.userProgress.findMany({
    where: { userId, targetLang: { in: langs } },
    select: {
      entryId: true,
      targetLang: true,
      box: true,
      cardType: true,
      cardKey: true,
    },
  });
  const translations = await db.translation.findMany({
    where: { lang: { in: langs } },
    select: { entryId: true, lang: true },
  });
  const conjugationForms = await db.conjugationForm.findMany({
    where: { translation: { lang: { in: langs } } },
    select: {
      tenseKey: true,
      translation: { select: { entryId: true, lang: true } },
    },
  });

  const languages: LanguageMastery[] = langs.map((lang) => {
    const vocabAvailable = translations
      .filter((row) => row.lang === lang)
      .map((row) => row.entryId);
    const vocabProgressed = progresses.filter(
      (row) => row.targetLang === lang && row.cardType === CardType.VOCAB,
    );
    const conjAvailable = new Set<string>();
    for (const form of conjugationForms) {
      if (form.translation.lang !== lang) continue;
      if (!isValidTense(lang, form.tenseKey)) continue;
      conjAvailable.add(
        `${form.translation.entryId}:${conjugationCardKey(form.tenseKey)}`,
      );
    }
    const conjProgressed = progresses.filter(
      (row) => row.targetLang === lang && row.cardType === CardType.CONJUGATION,
    );
    const combinedAvailable = vocabAvailable.length + conjAvailable.size;
    const combinedProgressed = [
      ...vocabProgressed.map((row) => ({ box: row.box })),
      ...conjProgressed.map((row) => ({ box: row.box })),
    ];
    const xp = xpByLang[lang] ?? 0;
    const level = levelForXp(xp);
    return {
      language: lang,
      languageName: LANGUAGE_NAMES[lang] ?? lang,
      masteryPercent: masteryPercent(combinedProgressed, combinedAvailable),
      levelKey: level.key,
      levelIndex: level.index,
      xp,
      nextLevelXp: level.nextMinXp,
    };
  });

  return {
    xpToday: todayRow?.xp ?? 0,
    dailyGoalXp: settings.dailyGoalXp,
    goalMet: (todayRow?.xp ?? 0) >= settings.dailyGoalXp,
    streak,
    longestStreak: Math.max(settings.longestStreak, streak),
    week: buildWeek(recent, today, settings.dailyGoalXp),
    languages,
  };
}

export async function getAchievementStatus(db: PrismaClient, userId: string) {
  await backfillDailyActivityIfNeeded(db, userId);
  const [unlocked, answers, box6, worksheets, settings] = await Promise.all([
    db.unlockedAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: "desc" },
    }),
    db.dailyActivity.aggregate({
      where: { userId },
      _sum: { answersCount: true },
    }),
    db.userProgress.count({ where: { userId, box: 6 } }),
    db.worksheet.count({ where: { status: WorksheetStatus.COMPLETED } }),
    getOrCreateSettings(db, userId),
  ]);
  const today = localDateString();
  const recent = await db.dailyActivity.findMany({
    where: { userId },
    select: { date: true, xp: true },
  });
  const streak = computeStreak(recent, settings.dailyGoalXp, today);
  const unlockedByKey = new Map(unlocked.map((row) => [row.key, row]));
  const totalAnswers = answers._sum.answersCount ?? 0;

  return ACHIEVEMENTS.map((achievement) => {
    const row = unlockedByKey.get(achievement.key);
    let current = 0;
    let target = achievement.threshold ?? 1;
    if (achievement.category === "streak") current = streak;
    else if (achievement.category === "diligence") current = totalAnswers;
    else if (achievement.category === "mastery") current = box6;
    else if (achievement.category === "worksheet") current = worksheets;
    else if (row) current = target;
    return {
      key: achievement.key,
      category: achievement.category,
      icon: achievement.icon,
      threshold: achievement.threshold,
      unlocked: Boolean(row),
      unlockedAt: row?.unlockedAt ?? null,
      current: Math.min(current, target),
      target,
    };
  });
}

export async function resetGamification(db: PrismaClient, userId = SINGLE_USER_ID) {
  await db.unlockedAchievement.deleteMany({ where: { userId } });
  await db.dailyActivity.deleteMany({ where: { userId } });
  await db.gamificationSettings.updateMany({
    where: { userId },
    data: { longestStreak: 0 },
  });
}
