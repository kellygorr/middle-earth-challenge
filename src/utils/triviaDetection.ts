import { TriviaUnlock } from '../types';
import { calculateMapPosition, isWithinRadius } from './mapCalculations';
import triviaData from '../constants/trivia.json';

/**
 * Detect which trivia points should be unlocked based on current position
 * 
 * @param totalMiles Total miles traveled
 * @param unlockedTrivia Already unlocked trivia IDs
 * @returns Array of trivia IDs that should be newly unlocked
 */
export const detectTriviaUnlocks = (
  totalMiles: number,
  unlockedTrivia: string[]
): string[] => {
  const position = calculateMapPosition(totalMiles);
  const newlyUnlocked: string[] = [];

  for (const trivia of triviaData) {
    // Skip if already unlocked
    if (unlockedTrivia.includes(trivia.id)) {
      continue;
    }

    // Check if current position is within trigger radius
    if (
      isWithinRadius(
        position.x,
        position.y,
        trivia.x,
        trivia.y,
        trivia.triggerRadius
      )
    ) {
      newlyUnlocked.push(trivia.id);
    }
  }

  return newlyUnlocked;
};

/**
 * Get trivia data by ID
 */
export const getTriviaById = (triviaId: string) => {
  return triviaData.find((t) => t.id === triviaId);
};

/**
 * Sort trivia by approximate miles (for display purposes)
 */
export const sortTriviaByMiles = () => {
  return [...triviaData].sort((a, b) => a.approximateMiles - b.approximateMiles);
};
