import Link from 'next/link'
import type { JournalEntry } from '@/types'

interface JournalCardProps {
  entry: JournalEntry
  showMood?: boolean
}

const moodDescriptions = [
  'Very difficult', 'Difficult', 'Challenging', 'Below average',
  'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Wonderful'
]

export function JournalCard({ entry }: JournalCardProps) {
  const date = new Date(entry.created_at)
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  // Get excerpt (first 120 chars, ending at word boundary)
  let excerpt = entry.content.substring(0, 150)
  const lastSpace = excerpt.lastIndexOf(' ')
  if (lastSpace > 80) {
    excerpt = excerpt.substring(0, lastSpace)
  }
  if (entry.content.length > excerpt.length) {
    excerpt = excerpt.trim() + '...'
  }

  const moodScore = entry.ai_extraction?.mood_score
  const moodDesc = moodScore ? moodDescriptions[Math.min(Math.max(moodScore - 1, 0), 9)] : null

  return (
    <Link href={`/journal/${entry.id}`}>
      <article className="group bg-white rounded-2xl border border-sage-100 p-5 hover:shadow-soft transition-all duration-200">
        {/* Date & Status */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <time className="text-sm text-therapy-muted">
              {formattedDate} at {formattedTime}
            </time>
            {entry.is_draft && (
              <span className="px-2 py-0.5 text-xs bg-warm-100 text-warm-600 rounded-full">
                Draft
              </span>
            )}
            {entry.shared_with_therapist && (
              <span className="px-2 py-0.5 text-xs bg-sage-100 text-sage-600 rounded-full">
                Shared
              </span>
            )}
          </div>
          {moodDesc && (
            <span className="text-xs text-therapy-muted">
              Felt {moodDesc.toLowerCase()}
            </span>
          )}
        </div>

        {/* Content Excerpt */}
        <p className="text-therapy-text text-sm leading-relaxed font-serif">
          {excerpt}
        </p>

        {/* Feelings tags - subtle */}
        {entry.ai_extraction?.emotions && entry.ai_extraction.emotions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {entry.ai_extraction.emotions.slice(0, 3).map((emotion) => (
              <span
                key={emotion}
                className="px-2 py-0.5 text-xs bg-sage-50 text-sage-600 rounded-full"
              >
                {emotion}
              </span>
            ))}
            {entry.ai_extraction.emotions.length > 3 && (
              <span className="text-xs text-therapy-muted">
                +{entry.ai_extraction.emotions.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Subtle hover state */}
        <div className="mt-3 text-xs text-sage-500 opacity-0 group-hover:opacity-100 transition-opacity">
          Read more
        </div>
      </article>
    </Link>
  )
}
