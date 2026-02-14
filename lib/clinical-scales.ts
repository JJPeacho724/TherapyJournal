export type PHQ9Severity = 'minimal' | 'mild' | 'moderate' | 'moderately_severe' | 'severe'
export type GAD7Severity = 'minimal' | 'mild' | 'moderate' | 'severe'

export function interpretPHQ9(score: number): PHQ9Severity {
  if (score <= 4) return 'minimal'
  if (score <= 9) return 'mild'
  if (score <= 14) return 'moderate'
  if (score <= 19) return 'moderately_severe'
  return 'severe'
}

export function interpretGAD7(score: number): GAD7Severity {
  if (score <= 4) return 'minimal'
  if (score <= 9) return 'mild'
  if (score <= 14) return 'moderate'
  return 'severe'
}

export function getReliableChangeIndex(
  score1: number,
  score2: number,
  scale: 'phq9' | 'gad7'
): { changed: boolean; direction: 'improved' | 'worsened' | 'stable' } {
  const threshold = scale === 'phq9' ? 6 : 4
  const diff = score2 - score1 // positive means worse (higher symptom score)

  if (Math.abs(diff) < threshold) {
    return { changed: false, direction: 'stable' }
  }

  if (diff <= -threshold) {
    return { changed: true, direction: 'improved' }
  }

  return { changed: true, direction: 'worsened' }
}





