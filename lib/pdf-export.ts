/**
 * PDF export utility — generates a patient progression report.
 *
 * Builds the PDF programmatically from data (not DOM screenshots)
 * for reliability across environments.
 */

import jsPDF from 'jspdf'

export interface PatientReportData {
  patientName: string
  dateRange: { start: string; end: string }
  clinicianName?: string
  moodTrend: Array<{ date: string; mood: number; anxiety: number }>
  phq9Trajectory: Array<{ date: string; score: number }>
  gad7Trajectory: Array<{ date: string; score: number }>
  symptomClusters: Array<{ symptom: string; count: number }>
  weeklySummaries: Array<{ weekLabel: string; summary: string }>
  totalEntries: number
  avgMood: number | null
  avgAnxiety: number | null
}

export function generatePatientReport(data: PatientReportData): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - 2 * margin
  let y = margin

  function addHeader() {
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text('CONFIDENTIAL — Patient Progression Report', margin, 10)
    doc.text(new Date().toLocaleDateString(), pageWidth - margin, 10, { align: 'right' })
  }

  function checkPageBreak(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      y = margin
      addHeader()
    }
  }

  addHeader()

  // Title
  doc.setFontSize(18)
  doc.setTextColor(30, 60, 40)
  doc.text('Patient Progression Report', margin, y)
  y += 10

  // Patient info
  doc.setFontSize(11)
  doc.setTextColor(80)
  doc.text(`Patient: ${data.patientName}`, margin, y)
  y += 6
  doc.text(`Period: ${data.dateRange.start} — ${data.dateRange.end}`, margin, y)
  y += 6
  if (data.clinicianName) {
    doc.text(`Clinician: ${data.clinicianName}`, margin, y)
    y += 6
  }
  doc.text(`Total entries: ${data.totalEntries}`, margin, y)
  y += 10

  // Separator
  doc.setDrawColor(200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // Summary Stats
  doc.setFontSize(13)
  doc.setTextColor(30, 60, 40)
  doc.text('Summary Statistics', margin, y)
  y += 8

  doc.setFontSize(10)
  doc.setTextColor(60)
  const avgMoodText = data.avgMood != null ? `${data.avgMood}/10` : 'N/A'
  const avgAnxText = data.avgAnxiety != null ? `${data.avgAnxiety}/10` : 'N/A'
  doc.text(`Average Mood: ${avgMoodText}`, margin, y)
  doc.text(`Average Anxiety: ${avgAnxText}`, margin + contentWidth / 2, y)
  y += 10

  // Mood Trend Table
  if (data.moodTrend.length > 0) {
    checkPageBreak(40)
    doc.setFontSize(13)
    doc.setTextColor(30, 60, 40)
    doc.text('Mood & Anxiety Trend', margin, y)
    y += 8

    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text('Date', margin, y)
    doc.text('Mood', margin + 45, y)
    doc.text('Anxiety', margin + 65, y)
    y += 4
    doc.line(margin, y, margin + 90, y)
    y += 4

    doc.setTextColor(60)
    const trendSlice = data.moodTrend.slice(-14)
    for (const point of trendSlice) {
      checkPageBreak(6)
      const dateStr = new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      doc.text(dateStr, margin, y)
      doc.text(String(point.mood), margin + 45, y)
      doc.text(String(point.anxiety), margin + 65, y)
      y += 5
    }
    y += 6
  }

  // Symptom Clusters
  if (data.symptomClusters.length > 0) {
    checkPageBreak(30)
    doc.setFontSize(13)
    doc.setTextColor(30, 60, 40)
    doc.text('Key Symptom Clusters', margin, y)
    y += 8

    doc.setFontSize(9)
    doc.setTextColor(60)
    for (const cluster of data.symptomClusters.slice(0, 8)) {
      checkPageBreak(6)
      doc.text(`• ${cluster.symptom} (${cluster.count} occurrences)`, margin + 4, y)
      y += 5
    }
    y += 6
  }

  // PHQ-9 Trajectory
  if (data.phq9Trajectory.length > 0) {
    checkPageBreak(30)
    doc.setFontSize(13)
    doc.setTextColor(30, 60, 40)
    doc.text('PHQ-9 Estimate Trajectory', margin, y)
    y += 8

    doc.setFontSize(9)
    doc.setTextColor(60)
    for (const point of data.phq9Trajectory.slice(-10)) {
      checkPageBreak(6)
      const dateStr = new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      doc.text(`${dateStr}: ${point.score}`, margin + 4, y)
      y += 5
    }
    y += 6
  }

  // Weekly Summaries
  if (data.weeklySummaries.length > 0) {
    checkPageBreak(20)
    doc.setFontSize(13)
    doc.setTextColor(30, 60, 40)
    doc.text('Weekly Summaries', margin, y)
    y += 8

    for (const week of data.weeklySummaries) {
      checkPageBreak(20)
      doc.setFontSize(10)
      doc.setTextColor(80)
      doc.text(week.weekLabel, margin, y)
      y += 5

      doc.setFontSize(9)
      doc.setTextColor(60)
      const lines = doc.splitTextToSize(week.summary, contentWidth - 10)
      doc.text(lines, margin + 4, y)
      y += lines.length * 4 + 6
    }
  }

  // Footer disclaimer
  checkPageBreak(20)
  y += 6
  doc.setDrawColor(200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6
  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text(
    'DISCLAIMER: AI-generated report for clinical decision support only. Does not replace clinical judgment.',
    margin,
    y
  )
  y += 4
  doc.text(`Generated: ${new Date().toISOString()}`, margin, y)

  return doc
}

export function downloadReport(data: PatientReportData) {
  const doc = generatePatientReport(data)
  const filename = `${data.patientName.replace(/\s+/g, '_')}_progression_${data.dateRange.end.replace(/\//g, '-')}.pdf`
  doc.save(filename)
}
