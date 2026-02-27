import { describe, it, expect } from 'vitest'
import { interpretPHQ9, interpretGAD7, getReliableChangeIndex } from '@/lib/clinical-scales'

describe('interpretPHQ9', () => {
  it('classifies 0-4 as minimal', () => {
    expect(interpretPHQ9(0)).toBe('minimal')
    expect(interpretPHQ9(4)).toBe('minimal')
  })

  it('classifies 5-9 as mild', () => {
    expect(interpretPHQ9(5)).toBe('mild')
    expect(interpretPHQ9(9)).toBe('mild')
  })

  it('classifies 10-14 as moderate', () => {
    expect(interpretPHQ9(10)).toBe('moderate')
    expect(interpretPHQ9(14)).toBe('moderate')
  })

  it('classifies 15-19 as moderately severe', () => {
    expect(interpretPHQ9(15)).toBe('moderately_severe')
    expect(interpretPHQ9(19)).toBe('moderately_severe')
  })

  it('classifies 20-27 as severe', () => {
    expect(interpretPHQ9(20)).toBe('severe')
    expect(interpretPHQ9(27)).toBe('severe')
  })

  it('handles boundary values correctly', () => {
    expect(interpretPHQ9(4)).toBe('minimal')
    expect(interpretPHQ9(5)).toBe('mild')
    expect(interpretPHQ9(9)).toBe('mild')
    expect(interpretPHQ9(10)).toBe('moderate')
    expect(interpretPHQ9(14)).toBe('moderate')
    expect(interpretPHQ9(15)).toBe('moderately_severe')
    expect(interpretPHQ9(19)).toBe('moderately_severe')
    expect(interpretPHQ9(20)).toBe('severe')
  })
})

describe('interpretGAD7', () => {
  it('classifies 0-4 as minimal', () => {
    expect(interpretGAD7(0)).toBe('minimal')
    expect(interpretGAD7(4)).toBe('minimal')
  })

  it('classifies 5-9 as mild', () => {
    expect(interpretGAD7(5)).toBe('mild')
    expect(interpretGAD7(9)).toBe('mild')
  })

  it('classifies 10-14 as moderate', () => {
    expect(interpretGAD7(10)).toBe('moderate')
    expect(interpretGAD7(14)).toBe('moderate')
  })

  it('classifies 15-21 as severe', () => {
    expect(interpretGAD7(15)).toBe('severe')
    expect(interpretGAD7(21)).toBe('severe')
  })

  it('handles boundary values correctly', () => {
    expect(interpretGAD7(4)).toBe('minimal')
    expect(interpretGAD7(5)).toBe('mild')
    expect(interpretGAD7(9)).toBe('mild')
    expect(interpretGAD7(10)).toBe('moderate')
    expect(interpretGAD7(14)).toBe('moderate')
    expect(interpretGAD7(15)).toBe('severe')
  })
})

describe('getReliableChangeIndex', () => {
  describe('PHQ-9 (threshold = 6)', () => {
    it('detects improvement when score drops by >= 6', () => {
      const result = getReliableChangeIndex(15, 8, 'phq9')
      expect(result).toEqual({ changed: true, direction: 'improved' })
    })

    it('detects worsening when score rises by >= 6', () => {
      const result = getReliableChangeIndex(8, 15, 'phq9')
      expect(result).toEqual({ changed: true, direction: 'worsened' })
    })

    it('returns stable for changes < 6', () => {
      const result = getReliableChangeIndex(10, 14, 'phq9')
      expect(result).toEqual({ changed: false, direction: 'stable' })
    })

    it('returns stable for no change', () => {
      const result = getReliableChangeIndex(10, 10, 'phq9')
      expect(result).toEqual({ changed: false, direction: 'stable' })
    })

    it('handles exact threshold boundary', () => {
      expect(getReliableChangeIndex(12, 6, 'phq9')).toEqual({ changed: true, direction: 'improved' })
      expect(getReliableChangeIndex(10, 15, 'phq9')).toEqual({ changed: false, direction: 'stable' })
      expect(getReliableChangeIndex(10, 16, 'phq9')).toEqual({ changed: true, direction: 'worsened' })
    })
  })

  describe('GAD-7 (threshold = 4)', () => {
    it('detects improvement when score drops by >= 4', () => {
      const result = getReliableChangeIndex(12, 7, 'gad7')
      expect(result).toEqual({ changed: true, direction: 'improved' })
    })

    it('detects worsening when score rises by >= 4', () => {
      const result = getReliableChangeIndex(5, 10, 'gad7')
      expect(result).toEqual({ changed: true, direction: 'worsened' })
    })

    it('returns stable for changes < 4', () => {
      const result = getReliableChangeIndex(8, 10, 'gad7')
      expect(result).toEqual({ changed: false, direction: 'stable' })
    })

    it('handles exact threshold boundary', () => {
      expect(getReliableChangeIndex(8, 4, 'gad7')).toEqual({ changed: true, direction: 'improved' })
      expect(getReliableChangeIndex(8, 11, 'gad7')).toEqual({ changed: false, direction: 'stable' })
      expect(getReliableChangeIndex(8, 12, 'gad7')).toEqual({ changed: true, direction: 'worsened' })
    })
  })
})
