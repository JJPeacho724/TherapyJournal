'use client'

interface MoodSelectorProps {
  value: number | null
  onChange: (value: number) => void
  label?: string
  showLabels?: boolean
}

const moodEmojis = ['😢', '😞', '😔', '😕', '😐', '🙂', '😊', '😄', '😁', '🤩']
const moodLabels = [
  'Very difficult',
  'Difficult',
  'Challenging',
  'Below average',
  'Okay',
  'Decent',
  'Good',
  'Great',
  'Excellent',
  'Wonderful'
]
const moodColors = [
  'bg-red-50 border-red-200 text-red-500',
  'bg-red-50 border-red-200 text-red-400',
  'bg-orange-50 border-orange-200 text-orange-500',
  'bg-orange-50 border-orange-200 text-orange-400',
  'bg-yellow-50 border-yellow-200 text-yellow-500',
  'bg-lime-50 border-lime-200 text-lime-500',
  'bg-green-50 border-green-200 text-green-500',
  'bg-emerald-50 border-emerald-200 text-emerald-500',
  'bg-teal-50 border-teal-200 text-teal-500',
  'bg-cyan-50 border-cyan-200 text-cyan-500',
]

export function MoodSelector({ value, onChange, label = 'How are you feeling?', showLabels = true }: MoodSelectorProps) {
  const handleSelect = (mood: number) => {
    // Guard against accidental double-fires (pointer + click)
    if (value === mood) return
    onChange(mood)
  }

  return (
    <div>
      {label && (
        <label className="block text-sm text-therapy-muted text-center mb-4">
          {label}
        </label>
      )}

      <div className="flex flex-wrap gap-2 justify-center">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((mood) => (
          <button
            key={mood}
            type="button"
            aria-label={`Mood ${mood} out of 10`}
            aria-pressed={value === mood}
            onPointerDown={(e) => {
              // Improves reliability on touch devices & prevents focus/drag quirks
              e.preventDefault()
              handleSelect(mood)
            }}
            onClick={() => handleSelect(mood)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleSelect(mood)
              }
            }}
            className={`
              w-11 h-11 rounded-xl border-2 flex items-center justify-center
              text-lg transition-all duration-200 hover:scale-105
              ${value === mood
                ? `${moodColors[mood - 1]} scale-105 shadow-sm ring-2 ring-sage-300 ring-offset-2`
                : 'bg-white border-sage-200 hover:border-sage-300'
              }
            `}
            style={{ touchAction: 'manipulation' }}
            title={moodLabels[mood - 1]}
          >
            {moodEmojis[mood - 1]}
          </button>
        ))}
      </div>

      {showLabels && value && (
        <p className="text-center mt-4 text-sm text-therapy-muted">
          {moodLabels[value - 1]}
        </p>
      )}
    </div>
  )
}

// Compact version for inline use
interface MoodBadgeProps {
  value: number
  size?: 'sm' | 'md'
}

export function MoodBadge({ value, size = 'md' }: MoodBadgeProps) {
  const emoji = moodEmojis[Math.min(Math.max(value - 1, 0), 9)]
  const colorClass = moodColors[Math.min(Math.max(value - 1, 0), 9)]
  const label = moodLabels[Math.min(Math.max(value - 1, 0), 9)]

  return (
    <span
      className={`
        inline-flex items-center justify-center rounded-lg border
        ${colorClass}
        ${size === 'sm' ? 'w-7 h-7 text-sm' : 'w-9 h-9 text-lg'}
      `}
      title={label}
    >
      {emoji}
    </span>
  )
}
