'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'

interface ExportButtonProps {
  patientName: string
  dateRange: { start: string; end: string }
  clinicianName?: string
  moodTrend: Array<{ date: string; mood: number; anxiety: number }>
  phq9Trajectory?: Array<{ date: string; score: number }>
  gad7Trajectory?: Array<{ date: string; score: number }>
  symptomClusters: Array<{ symptom: string; count: number }>
  weeklySummaries?: Array<{ weekLabel: string; summary: string }>
  totalEntries: number
  avgMood: number | null
  avgAnxiety: number | null
}

export function ExportButton(props: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const { downloadReport } = await import('@/lib/pdf-export')
      downloadReport({
        ...props,
        phq9Trajectory: props.phq9Trajectory ?? [],
        gad7Trajectory: props.gad7Trajectory ?? [],
        weeklySummaries: props.weeklySummaries ?? [],
      })
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} loading={exporting} disabled={exporting}>
      <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      Export PDF
    </Button>
  )
}
