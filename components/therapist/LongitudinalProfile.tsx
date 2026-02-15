'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { MoodBadge } from '@/components/journal'
import type { LongitudinalProfile } from '@/lib/longitudinal-profile'

interface LongitudinalProfileProps {
  profile: LongitudinalProfile
  patientName: string
}

export function LongitudinalProfileView({ profile, patientName }: LongitudinalProfileProps) {
  const { baseline, trends, themes, evidence, dataRange } = profile

  const hasData = baseline.sampleCount > 0

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Longitudinal Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-therapy-muted text-center py-8">
            Not enough shared entries to generate a profile yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-therapy-text">
            Longitudinal Profile
          </h2>
          <p className="text-sm text-therapy-muted mt-1">
            Structured summary across {baseline.sampleCount} shared{' '}
            {baseline.sampleCount === 1 ? 'entry' : 'entries'}
            {dataRange.earliest && dataRange.latest && (
              <> &middot; {formatDateShort(dataRange.earliest)} &ndash; {formatDateShort(dataRange.latest)}</>
            )}
          </p>
        </div>
        <span className="text-xs text-therapy-muted bg-sage-50 px-3 py-1 rounded-full">
          Quantified &middot; Not diagnostic
        </span>
      </div>

      {/* Section 1 — Baseline Metrics */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SectionNumber n={1} />
            <CardTitle>Baseline Metrics</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCell
              label="Mean Mood"
              value={baseline.meanMood}
              format="score"
              range="1–10"
            />
            <MetricCell
              label="Mood SD"
              value={baseline.moodStd}
              format="decimal"
              sublabel="variability"
            />
            <MetricCell
              label="Mean Anxiety"
              value={baseline.meanAnxiety}
              format="score"
              range="1–10"
            />
            <MetricCell
              label="Volatility"
              value={baseline.volatilityIndex}
              format="decimal"
              sublabel="MASD"
            />
          </div>

          {(baseline.meanPhq9 != null || baseline.meanGad7 != null) && (
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-therapy-border">
              <MetricCell
                label="PHQ-9-Aligned Estimate"
                value={baseline.meanPhq9}
                format="score"
                range="0–27"
                severity={phq9Severity(baseline.meanPhq9)}
              />
              <MetricCell
                label="GAD-7-Aligned Estimate"
                value={baseline.meanGad7}
                format="score"
                range="0–21"
                severity={gad7Severity(baseline.meanGad7)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Trend Indicators */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SectionNumber n={2} />
            <CardTitle>Trend Indicators</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <TrendCell
              label="7-Day Mood Slope"
              value={trends.slope7d}
              unit="pts/day"
            />
            <TrendCell
              label="14-Day Mood Slope"
              value={trends.slope14d}
              unit="pts/day"
            />
            <MetricCell
              label="Latest Z-Score"
              value={trends.latestZScore}
              format="zscore"
              sublabel="vs. patient baseline"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-therapy-border">
            <TrendCell
              label="7-Day Anxiety Slope"
              value={trends.anxietySlope7d}
              unit="pts/day"
              invertColor
            />
            <TrendCell
              label="14-Day Anxiety Slope"
              value={trends.anxietySlope14d}
              unit="pts/day"
              invertColor
            />
            <MetricCell
              label="Anxiety Z-Score"
              value={trends.latestAnxietyZScore}
              format="zscore"
              sublabel="vs. patient baseline"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 3 — Recurrent Themes */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SectionNumber n={3} />
            <CardTitle>Recurrent Themes</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Triggers */}
            <div>
              <h4 className="text-sm font-medium text-therapy-muted mb-3 uppercase tracking-wide">
                Frequent Triggers
              </h4>
              {themes.triggers.length > 0 ? (
                <div className="space-y-2">
                  {themes.triggers.map((t, i) => (
                    <FrequencyBar
                      key={t.label}
                      rank={i + 1}
                      label={t.label}
                      count={t.count}
                      percentage={t.percentage}
                      colorClass="bg-warm-300"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-therapy-muted">No triggers extracted</p>
              )}
            </div>

            {/* Symptom Clusters */}
            <div>
              <h4 className="text-sm font-medium text-therapy-muted mb-3 uppercase tracking-wide">
                Symptom Clusters
              </h4>
              {themes.symptomClusters.length > 0 ? (
                <div className="space-y-2">
                  {themes.symptomClusters.map((s, i) => (
                    <FrequencyBar
                      key={s.label}
                      rank={i + 1}
                      label={s.label}
                      count={s.count}
                      percentage={s.percentage}
                      colorClass="bg-calm-300"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-therapy-muted">No symptoms extracted</p>
              )}
            </div>
          </div>

          {/* Polarity + Indicators Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-therapy-border">
            <div className="text-center">
              <div className="text-xs text-therapy-muted mb-1 uppercase tracking-wide">
                Sentiment Trend
              </div>
              <SentimentPill trend={themes.sentimentTrend} slope={themes.sentimentSlope} />
            </div>
            <MetricCell
              label="Rumination"
              value={themes.ruminationCount}
              format="count"
              sublabel={themes.ruminationRate != null
                ? `${Math.round(themes.ruminationRate * 100)}% of entries`
                : undefined}
            />
            <MetricCell
              label="Hopelessness"
              value={themes.hopelessnessCount}
              format="count"
              sublabel={themes.hopelessnessRate != null
                ? `${Math.round(themes.hopelessnessRate * 100)}% of entries`
                : undefined}
              highlight={themes.hopelessnessCount > 0}
            />
            <MetricCell
              label="Entries"
              value={baseline.sampleCount}
              format="count"
              sublabel="total shared"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 4 — Evidence Snippets */}
      {evidence.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SectionNumber n={4} />
              <CardTitle>Evidence Snippets</CardTitle>
            </div>
            <p className="text-xs text-therapy-muted mt-1">
              Excerpts supporting extracted signals
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {evidence.map((snippet, i) => (
                <div
                  key={i}
                  className="border border-therapy-border rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-sage-600 bg-sage-50 px-2 py-0.5 rounded-full">
                      {snippet.signal}
                    </span>
                    <div className="flex items-center gap-2">
                      {snippet.moodScore != null && (
                        <MoodBadge value={snippet.moodScore} />
                      )}
                      <time className="text-xs text-therapy-muted">
                        {formatDateShort(snippet.date)}
                      </time>
                    </div>
                  </div>
                  <p className="text-sm font-serif text-therapy-text leading-relaxed italic border-l-2 border-sage-200 pl-3">
                    &ldquo;{snippet.excerpt}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────

function SectionNumber({ n }: { n: number }) {
  return (
    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sage-100 text-sage-700 text-xs font-semibold flex items-center justify-center">
      {n}
    </span>
  )
}

interface MetricCellProps {
  label: string
  value: number | null
  format: 'score' | 'decimal' | 'zscore' | 'count'
  range?: string
  sublabel?: string
  severity?: { label: string; color: string } | null
  highlight?: boolean
}

function MetricCell({ label, value, format, range, sublabel, severity, highlight }: MetricCellProps) {
  const displayValue = value != null ? formatValue(value, format) : '—'

  return (
    <div className="text-center">
      <div className="text-xs text-therapy-muted mb-1 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold ${highlight ? 'text-therapy-danger' : 'text-therapy-text'}`}>
        {displayValue}
      </div>
      {range && (
        <div className="text-xs text-therapy-muted mt-0.5">{range}</div>
      )}
      {sublabel && (
        <div className="text-xs text-therapy-muted mt-0.5">{sublabel}</div>
      )}
      {severity && (
        <span className={`inline-block text-xs mt-1 px-2 py-0.5 rounded-full ${severity.color}`}>
          {severity.label}
        </span>
      )}
    </div>
  )
}

interface TrendCellProps {
  label: string
  value: number | null
  unit: string
  invertColor?: boolean // for anxiety, where positive slope = worse
}

function TrendCell({ label, value, unit, invertColor }: TrendCellProps) {
  let arrow = ''
  let colorClass = 'text-therapy-text'

  if (value != null && Math.abs(value) > 0.01) {
    const isPositive = value > 0
    const isGood = invertColor ? !isPositive : isPositive
    arrow = isPositive ? '\u2191' : '\u2193' // ↑ or ↓
    colorClass = isGood ? 'text-sage-600' : 'text-therapy-danger'
  }

  return (
    <div className="text-center">
      <div className="text-xs text-therapy-muted mb-1 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold ${colorClass}`}>
        {value != null ? (
          <>
            {arrow && <span className="mr-1">{arrow}</span>}
            {Math.abs(value).toFixed(2)}
          </>
        ) : (
          '—'
        )}
      </div>
      <div className="text-xs text-therapy-muted mt-0.5">{unit}</div>
    </div>
  )
}

interface FrequencyBarProps {
  rank: number
  label: string
  count: number
  percentage: number
  colorClass: string
}

function FrequencyBar({ rank, label, count, percentage, colorClass }: FrequencyBarProps) {
  // Cap bar width at 100%
  const barWidth = Math.min(percentage, 100)

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-therapy-muted w-4 text-right flex-shrink-0">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm text-therapy-text truncate">{label}</span>
          <span className="text-xs text-therapy-muted ml-2 flex-shrink-0">
            {count}x ({percentage}%)
          </span>
        </div>
        <div className="w-full bg-sage-50 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${colorClass} transition-all duration-300`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    </div>
  )
}

interface SentimentPillProps {
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data'
  slope: number | null
}

function SentimentPill({ trend, slope }: SentimentPillProps) {
  const config = {
    improving: { label: 'Improving', bg: 'bg-sage-50', text: 'text-sage-700', arrow: '\u2191' },
    declining: { label: 'Declining', bg: 'bg-red-50', text: 'text-red-700', arrow: '\u2193' },
    stable: { label: 'Stable', bg: 'bg-warm-50', text: 'text-warm-700', arrow: '\u2192' },
    insufficient_data: { label: 'Insufficient data', bg: 'bg-sage-50', text: 'text-therapy-muted', arrow: '' },
  }

  const c = config[trend]

  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full ${c.bg} ${c.text}`}>
      {c.arrow && <span>{c.arrow}</span>}
      {c.label}
      {slope != null && trend !== 'insufficient_data' && (
        <span className="text-xs opacity-70 ml-1">({slope > 0 ? '+' : ''}{slope.toFixed(3)}/d)</span>
      )}
    </span>
  )
}

// ─── Formatting Helpers ──────────────────────────────────────

function formatValue(value: number, format: string): string {
  switch (format) {
    case 'score': return value.toFixed(1)
    case 'decimal': return value.toFixed(2)
    case 'zscore': return (value >= 0 ? '+' : '') + value.toFixed(2)
    case 'count': return String(value)
    default: return String(value)
  }
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function phq9Severity(score: number | null): { label: string; color: string } | null {
  if (score == null) return null
  if (score <= 4) return { label: 'Minimal', color: 'bg-sage-50 text-sage-700' }
  if (score <= 9) return { label: 'Mild', color: 'bg-warm-50 text-warm-700' }
  if (score <= 14) return { label: 'Moderate', color: 'bg-warm-100 text-warm-800' }
  if (score <= 19) return { label: 'Mod. Severe', color: 'bg-red-50 text-red-700' }
  return { label: 'Severe', color: 'bg-red-100 text-red-800' }
}

function gad7Severity(score: number | null): { label: string; color: string } | null {
  if (score == null) return null
  if (score <= 4) return { label: 'Minimal', color: 'bg-sage-50 text-sage-700' }
  if (score <= 9) return { label: 'Mild', color: 'bg-warm-50 text-warm-700' }
  if (score <= 14) return { label: 'Moderate', color: 'bg-warm-100 text-warm-800' }
  return { label: 'Severe', color: 'bg-red-100 text-red-800' }
}
