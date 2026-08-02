/**
 * Normalize text for comparison
 * - Trim whitespace
 * - Convert to lowercase
 * - Collapse multiple spaces to single space
 * - Remove diacritics (optional)
 * - Remove optional "to" prefix for English verbs
 */
export function normalizeText(text: string, removeDiacritics = true): string {
  let normalized = text.trim().toLowerCase();
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ");
  
  // Remove optional "to" prefix for English verbs (e.g., "to run" -> "run")
  // This makes "run" and "to run" equivalent
  normalized = normalized.replace(/^to\s+/, "");
  
  if (removeDiacritics) {
    normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  
  return normalized;
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Create a 2D array for dynamic programming
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) {
    dp[i]![0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    dp[0]![j] = j;
  }
  
  // Fill the dp table
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,      // deletion
        dp[i]![j - 1]! + 1,      // insertion
        dp[i - 1]![j - 1]! + cost // substitution
      );
    }
  }
  
  return dp[len1]![len2]!;
}

/**
 * Check if user answer matches expected answer
 * Returns: { isCorrect, isTypo, distance }
 */
export function matchAnswer(params: {
  userAnswer: string;
  expected: string;
  variants?: string[];
}): {
  isCorrect: boolean;
  isTypo: boolean;
  distance: number;
  matchedVariant?: string;
} {
  const { userAnswer, expected, variants = [] } = params;
  
  // Normalize both answers
  const normalizedUser = normalizeText(userAnswer);
  const normalizedExpected = normalizeText(expected);
  
  // Exact match (after normalization)
  if (normalizedUser === normalizedExpected) {
    return { isCorrect: true, isTypo: false, distance: 0 };
  }
  
  // Check variants
  for (const variant of variants) {
    const normalizedVariant = normalizeText(variant);
    if (normalizedUser === normalizedVariant) {
      return {
        isCorrect: true,
        isTypo: false,
        distance: 0,
        matchedVariant: variant,
      };
    }
  }
  
  // Calculate Levenshtein distance
  const distance = levenshteinDistance(normalizedUser, normalizedExpected);
  
  // Determine threshold based on word length
  const threshold = normalizedExpected.length < 6 ? 1 : 2;
  
  // Fuzzy match: accept if distance is within threshold
  if (distance <= threshold) {
    return { isCorrect: true, isTypo: true, distance };
  }
  
  // Check fuzzy match against variants
  for (const variant of variants) {
    const normalizedVariant = normalizeText(variant);
    const variantDistance = levenshteinDistance(normalizedUser, normalizedVariant);
    const variantThreshold = normalizedVariant.length < 6 ? 1 : 2;
    
    if (variantDistance <= variantThreshold) {
      return {
        isCorrect: true,
        isTypo: true,
        distance: variantDistance,
        matchedVariant: variant,
      };
    }
  }
  
  // No match
  return { isCorrect: false, isTypo: false, distance };
}

