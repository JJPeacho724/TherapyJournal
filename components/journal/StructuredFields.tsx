'use client'

interface StructuredFieldsProps {
  values: {
    sleep_hours: number | null
    sleep_quality: number | null
    medication_taken: boolean | null
    medication_notes: string | null
    energy_level: number | null
  }
  onChange: (values: StructuredFieldsProps['values']) => void
}

export function StructuredFields({ values, onChange }: StructuredFieldsProps) {
  const updateField = <K extends keyof StructuredFieldsProps['values']>(
    field: K,
    value: StructuredFieldsProps['values'][K]
  ) => {
    onChange({ ...values, [field]: value })
  }

  return (
    <div className="space-y-5">
      {/* Sleep Section */}
      <div className="bg-white rounded-xl p-4 border border-sage-100">
        <h4 className="text-sm text-therapy-muted mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-sage-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          How did you sleep?
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-therapy-muted mb-1">Hours</label>
            <input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={values.sleep_hours ?? ''}
              onChange={(e) => updateField('sleep_hours', e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg border border-sage-200 bg-white text-sm focus:ring-2 focus:ring-sage-300 focus:border-transparent"
              placeholder="7.5"
            />
          </div>
          <div>
            <label className="block text-xs text-therapy-muted mb-1">Quality</label>
            <input
              type="range"
              min="1"
              max="10"
              value={values.sleep_quality ?? 5}
              onChange={(e) => updateField('sleep_quality', parseInt(e.target.value))}
              className="w-full accent-sage-500"
            />
            <div className="flex justify-between text-xs text-therapy-muted mt-1">
              <span>Poor</span>
              <span>{values.sleep_quality ?? '-'}</span>
              <span>Great</span>
            </div>
          </div>
        </div>
      </div>

      {/* Energy Level */}
      <div className="bg-white rounded-xl p-4 border border-sage-100">
        <h4 className="text-sm text-therapy-muted mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-sage-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          How's your energy?
        </h4>

        <div>
          <input
            type="range"
            min="1"
            max="10"
            value={values.energy_level ?? 5}
            onChange={(e) => updateField('energy_level', parseInt(e.target.value))}
            className="w-full accent-sage-500"
          />
          <div className="flex justify-between text-xs text-therapy-muted mt-1">
            <span>Low</span>
            <span>{values.energy_level ?? '-'}</span>
            <span>High</span>
          </div>
        </div>
      </div>

      {/* Medication Section */}
      <div className="bg-white rounded-xl p-4 border border-sage-100">
        <h4 className="text-sm text-therapy-muted mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-sage-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          Medication (if applicable)
        </h4>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-therapy-muted">Taken today?</span>
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => updateField('medication_taken', true)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  values.medication_taken === true
                    ? 'bg-sage-100 text-sage-700'
                    : 'bg-sage-50 text-therapy-muted hover:bg-sage-100'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => updateField('medication_taken', false)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  values.medication_taken === false
                    ? 'bg-sage-100 text-sage-700'
                    : 'bg-sage-50 text-therapy-muted hover:bg-sage-100'
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => updateField('medication_taken', null)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  values.medication_taken === null
                    ? 'bg-sage-100 text-sage-700'
                    : 'bg-sage-50 text-therapy-muted hover:bg-sage-100'
                }`}
              >
                N/A
              </button>
            </div>
          </div>

          <div>
            <input
              type="text"
              value={values.medication_notes ?? ''}
              onChange={(e) => updateField('medication_notes', e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-sage-200 bg-white text-sm focus:ring-2 focus:ring-sage-300 focus:border-transparent"
              placeholder="Any notes..."
            />
          </div>
        </div>
      </div>
    </div>
  )
}
