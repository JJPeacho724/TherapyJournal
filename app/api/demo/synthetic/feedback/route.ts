import { NextResponse } from 'next/server'
import { demoPModeGuard } from '@/lib/demo-mode'
import { getServiceClient } from '@/lib/synthetic/supabase-service'

export const dynamic = 'force-dynamic'

/** POST: Save a clinician feedback entry */
export async function POST(request: Request) {
  const guard = demoPModeGuard()
  if (guard) return guard

  try {
    const body = await request.json()
    const supabase = getServiceClient()

    const { error } = await supabase.from('clinician_feedback').insert({
      patient_id: body.patient_id,
      clinician_user_id: body.clinician_user_id || null,
      session_id: body.session_id || null,
      event_date: body.event_date || null,
      component: body.component,
      rating_useful: body.rating_useful ?? null,
      rating_clear: body.rating_clear ?? null,
      rating_risky: body.rating_risky ?? null,
      notes: body.notes || null,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to save feedback', details: String(error) },
      { status: 500 }
    )
  }
}

/** GET: Aggregate feedback for admin dashboard */
export async function GET() {
  const guard = demoPModeGuard()
  if (guard) return guard

  try {
    const supabase = getServiceClient()

    // Fetch all feedback with patient archetype info
    const { data, error } = await supabase
      .from('clinician_feedback')
      .select('*, synthetic_patients(archetype)')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data ?? []

    // Aggregate by component
    const byComponent = new Map<
      string,
      { useful: number[]; clear: number[]; risky: number[] }
    >()
    // Aggregate by archetype+component
    const byArchComp = new Map<
      string,
      { useful: number[]; clear: number[]; risky: number[] }
    >()

    for (const row of rows) {
      const comp = row.component
      const archetype = (row.synthetic_patients as any)?.archetype ?? 'unknown'

      // By component
      if (!byComponent.has(comp)) {
        byComponent.set(comp, { useful: [], clear: [], risky: [] })
      }
      const bc = byComponent.get(comp)!
      if (row.rating_useful != null) bc.useful.push(row.rating_useful)
      if (row.rating_clear != null) bc.clear.push(row.rating_clear)
      if (row.rating_risky != null) bc.risky.push(row.rating_risky)

      // By archetype+component
      const key = `${archetype}::${comp}`
      if (!byArchComp.has(key)) {
        byArchComp.set(key, { useful: [], clear: [], risky: [] })
      }
      const bac = byArchComp.get(key)!
      if (row.rating_useful != null) bac.useful.push(row.rating_useful)
      if (row.rating_clear != null) bac.clear.push(row.rating_clear)
      if (row.rating_risky != null) bac.risky.push(row.rating_risky)
    }

    const avg = (arr: number[]) =>
      arr.length > 0
        ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100
        : null

    const aggregates = Array.from(byComponent.entries()).map(([component, v]) => ({
      component,
      avgUseful: avg(v.useful),
      avgClear: avg(v.clear),
      avgRisky: avg(v.risky),
      count: Math.max(v.useful.length, v.clear.length, v.risky.length),
    }))

    const byArchetype = Array.from(byArchComp.entries()).map(([key, v]) => {
      const [archetype, component] = key.split('::')
      return {
        archetype,
        component,
        avgUseful: avg(v.useful),
        avgClear: avg(v.clear),
        avgRisky: avg(v.risky),
        count: Math.max(v.useful.length, v.clear.length, v.risky.length),
      }
    })

    return NextResponse.json({
      aggregates,
      byArchetype,
      recentFeedback: rows.slice(0, 50),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch feedback', details: String(error) },
      { status: 500 }
    )
  }
}
