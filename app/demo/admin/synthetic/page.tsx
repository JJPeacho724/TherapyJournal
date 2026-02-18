'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SyntheticPatient } from '@/types/synthetic'
import { ARCHETYPE_LABELS, type Archetype } from '@/types/synthetic'

const ARCHETYPE_COLORS: Record<Archetype, string> = {
  gradual_improver: 'bg-green-100 text-green-800',
  volatile_stabilizer: 'bg-amber-100 text-amber-800',
  hidden_deteriorator: 'bg-red-100 text-red-800',
  flat_non_responder: 'bg-gray-100 text-gray-800',
  early_dropout: 'bg-purple-100 text-purple-800',
  relapse_then_recover: 'bg-blue-100 text-blue-800',
}

export default function SyntheticAdminPage() {
  const [patients, setPatients] = useState<SyntheticPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [patientsPerArchetype, setPatientsPerArchetype] = useState(2)
  const [days, setDays] = useState(45)
  const [message, setMessage] = useState<string | null>(null)

  const fetchPatients = useCallback(async () => {
    try {
      const res = await fetch('/api/demo/synthetic/patients')
      const data = await res.json()
      setPatients(data.patients ?? [])
    } catch {
      setPatients([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  const handleGenerate = async () => {
    setGenerating(true)
    setMessage(null)
    try {
      const res = await fetch('/api/demo/synthetic/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientsPerArchetype, days }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(
          `Generated ${data.patientsCreated} patients with ${data.entriesCreated} entries.`
        )
        await fetchPatients()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (e) {
      setMessage(`Error: ${String(e)}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Delete all synthetic data? This cannot be undone.')) return
    setResetting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/demo/synthetic/reset', { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setMessage('All synthetic data has been deleted.')
        await fetchPatients()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (e) {
      setMessage(`Error: ${String(e)}`)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Synthetic Cohort Generator</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate synthetic patient data for workflow validation. All data is
          deterministic and reproducible.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Generate Cohort</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Patients per archetype
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={patientsPerArchetype}
              onChange={(e) => setPatientsPerArchetype(Number(e.target.value))}
              className="w-24 border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Days per patient</label>
            <input
              type="number"
              min={30}
              max={60}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-24 border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {generating ? 'Generating...' : 'Generate Cohort'}
          </button>
          <button
            onClick={handleReset}
            disabled={resetting || patients.length === 0}
            className="px-5 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition"
          >
            {resetting ? 'Resetting...' : 'Reset All Synthetic Data'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Total patients: 6 archetypes x {patientsPerArchetype} ={' '}
          {6 * patientsPerArchetype}. Total entries:{' '}
          ~{6 * patientsPerArchetype * days}.
        </p>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.startsWith('Error')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}
        >
          {message}
        </div>
      )}

      {/* Patient list */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            Synthetic Patients ({patients.length})
          </h2>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : patients.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            No synthetic patients yet. Click &quot;Generate Cohort&quot; to create some.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {patients.map((p) => (
              <div
                key={p.id}
                className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-800 text-sm">{p.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      ARCHETYPE_COLORS[p.archetype as Archetype] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {ARCHETYPE_LABELS[p.archetype as Archetype] ?? p.archetype}
                  </span>
                  <span className="text-xs text-gray-400">
                    {p.days_generated} days
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/demo/clinician/patients/${p.id}`}
                    className="text-xs px-3 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 transition"
                  >
                    Clinician View
                  </a>
                  <a
                    href={`/demo/patient/${p.id}`}
                    className="text-xs px-3 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 transition"
                  >
                    Patient View
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
