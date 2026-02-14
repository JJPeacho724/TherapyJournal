'use client'

import Link from 'next/link'
import type { ThemeItem, WhenFeltBetter, RecentThought } from '@/lib/wellness-utils'
import { formatRelativeDate } from '@/lib/wellness-utils'

// What came up this week - displays themes without counts
interface ThemesCardProps {
  themes: ThemeItem[]
}

export function ThemesCard({ themes }: ThemesCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-sage-100 p-5 hover:shadow-soft transition-shadow">
      <h3 className="text-sm font-medium text-therapy-muted mb-3">What came up this week</h3>
      {themes.length > 0 ? (
        <div className="space-y-2">
          {themes.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-therapy-text"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-sage-400" />
              <span className="text-sm">{item.theme}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-therapy-muted/60">
          Your themes will appear as you journal
        </p>
      )}
    </div>
  )
}

// When you felt better - time of day and sleep in words
interface BetterTimesCardProps {
  data: WhenFeltBetter
}

export function BetterTimesCard({ data }: BetterTimesCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-sage-100 p-5 hover:shadow-soft transition-shadow">
      <h3 className="text-sm font-medium text-therapy-muted mb-3">When you felt better</h3>
      <div className="space-y-2">
        <p className="text-sm text-therapy-text">{data.timeDescription}</p>
        {data.sleepDescription && (
          <p className="text-sm text-therapy-muted/80">{data.sleepDescription}</p>
        )}
      </div>
    </div>
  )
}

// Recent thoughts - journal snippets without scores
interface RecentThoughtsCardProps {
  thoughts: RecentThought[]
}

export function RecentThoughtsCard({ thoughts }: RecentThoughtsCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-sage-100 p-5 hover:shadow-soft transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-therapy-muted">Recent thoughts</h3>
        <Link
          href="/journal"
          className="text-xs text-sage-600 hover:text-sage-700 hover:underline"
        >
          See all
        </Link>
      </div>
      {thoughts.length > 0 ? (
        <div className="space-y-3">
          {thoughts.map((thought, i) => (
            <div key={i} className="group">
              <p className="text-sm text-therapy-text leading-relaxed">
                {thought.snippet}
              </p>
              <p className="text-xs text-therapy-muted/60 mt-1">
                {formatRelativeDate(thought.date)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-therapy-muted/60">
          Your recent entries will appear here
        </p>
      )}
    </div>
  )
}

// Weekly narrative headline component
interface NarrativeHeaderProps {
  headline: string
  subtext?: string
}

export function NarrativeHeader({ headline, subtext }: NarrativeHeaderProps) {
  return (
    <div className="text-center max-w-xl mx-auto mb-8">
      <h2 className="text-xl md:text-2xl font-normal text-therapy-text leading-relaxed">
        {headline}
      </h2>
      {subtext && (
        <p className="text-sm text-therapy-muted mt-2">{subtext}</p>
      )}
    </div>
  )
}
