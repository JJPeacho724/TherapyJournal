'use client'

import { useState } from 'react'
import {
  FEEDBACK_COMPONENTS,
  FEEDBACK_COMPONENT_LABELS,
  type FeedbackComponent,
} from '@/types/synthetic'

interface FeedbackPanelProps {
  patientId: string
}

interface FeedbackEntry {
  component: FeedbackComponent
  useful: number
  clear: number
  risky: number
  notes: string
}

const DEFAULT_ENTRY = (component: FeedbackComponent): FeedbackEntry => ({
  component,
  useful: 3,
  clear: 3,
  risky: 1,
  notes: '',
})

export function FeedbackPanel({ patientId }: FeedbackPanelProps) {
  const [entries, setEntries] = useState<Record<FeedbackComponent, FeedbackEntry>>(
    () => {
      const init: any = {}
      for (const c of FEEDBACK_COMPONENTS) {
        init[c] = DEFAULT_ENTRY(c)
      }
      return init
    }
  )
  const [saving, setSaving] = useState<FeedbackComponent | null>(null)
  const [saved, setSaved] = useState<Set<FeedbackComponent>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const updateEntry = (
    component: FeedbackComponent,
    field: keyof FeedbackEntry,
    value: any
  ) => {
    setEntries((prev) => ({
      ...prev,
      [component]: { ...prev[component], [field]: value },
    }))
  }

  const submitFeedback = async (component: FeedbackComponent) => {
    setSaving(component)
    setError(null)

    const entry = entries[component]
    try {
      const res = await fetch('/api/demo/synthetic/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          component,
          rating_useful: entry.useful,
          rating_clear: entry.clear,
          rating_risky: entry.risky,
          notes: entry.notes || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      setSaved((prev) => new Set(prev).add(component))
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">Feedback</h3>
      <p className="text-sm text-gray-500">
        Rate each component for usefulness, clarity, and whether it could be
        misinterpreted as risky (higher = more concern).
      </p>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {FEEDBACK_COMPONENTS.map((component) => {
        const entry = entries[component]
        const isSaved = saved.has(component)
        const isSaving = saving === component

        return (
          <div
            key={component}
            className={`border rounded-lg p-4 transition ${
              isSaved ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'
            }`}
          >
            <h4 className="font-medium text-gray-700 mb-3">
              {FEEDBACK_COMPONENT_LABELS[component]}
              {isSaved && (
                <span className="ml-2 text-green-600 text-sm font-normal">Saved</span>
              )}
            </h4>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <RatingSlider
                label="Useful"
                value={entry.useful}
                onChange={(v) => updateEntry(component, 'useful', v)}
              />
              <RatingSlider
                label="Clear"
                value={entry.clear}
                onChange={(v) => updateEntry(component, 'clear', v)}
              />
              <RatingSlider
                label="Risky"
                value={entry.risky}
                onChange={(v) => updateEntry(component, 'risky', v)}
              />
            </div>
            <textarea
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm resize-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
              rows={2}
              placeholder="Optional notes..."
              value={entry.notes}
              onChange={(e) => updateEntry(component, 'notes', e.target.value)}
            />
            <button
              onClick={() => submitFeedback(component)}
              disabled={isSaving}
              className="mt-2 px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {isSaving ? 'Saving...' : isSaved ? 'Update' : 'Submit'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function RatingSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">
        {label}: {value}/5
      </label>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
      />
      <div className="flex justify-between text-[10px] text-gray-400 px-0.5">
        <span>1</span>
        <span>5</span>
      </div>
    </div>
  )
}
