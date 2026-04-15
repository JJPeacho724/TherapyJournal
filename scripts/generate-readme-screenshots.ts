/**
 * Generates README walkthrough PNGs into docs/images/walkthrough/
 * using Playwright + static HTML styled to match the app palette.
 *
 * Run: npm run screenshots:readme
 * (No Next.js or Supabase required.)
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright'

const OUT = path.join(process.cwd(), 'docs', 'images', 'walkthrough')

const bg = '#faf9f7'
const text = '#3d3d3d'
const muted = '#8a8a8a'
const card = '#ffffff'
const border = '#e8e5e0'
const accent = '#6b8f71'
const sage = '#7d917d'

const baseStyle = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: ${bg};
    color: ${text};
    font-size: 15px;
    line-height: 1.5;
  }
  .nav {
    position: fixed; top: 0; left: 0; right: 0; height: 56px;
    background: ${card}; border-bottom: 1px solid ${border};
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px;
    font-size: 14px;
  }
  .logo { display: flex; align-items: center; gap: 10px; font-weight: 600; }
  .logo-mark {
    width: 40px; height: 40px; border-radius: 16px;
    background: linear-gradient(135deg, ${sage}, #4d5d4d);
    color: white; display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .wrap { max-width: 880px; margin: 0 auto; padding: 88px 24px 48px; }
  .card {
    background: ${card}; border: 1px solid ${border}; border-radius: 16px;
    padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 12px 20px; border-radius: 12px; border: none; cursor: default;
    font-weight: 500; font-size: 14px;
  }
  .btn-primary { background: ${accent}; color: white; }
  .btn-secondary { background: #f3efe9; color: ${text}; }
  .muted { color: ${muted}; font-size: 14px; }
  h1 { font-size: 24px; font-weight: 500; margin: 0 0 8px; }
  h2 { font-size: 18px; font-weight: 500; margin: 0 0 12px; }
  input {
    width: 100%; padding: 12px 14px; border: 1px solid ${border};
    border-radius: 10px; font-size: 15px; margin-top: 6px;
  }
  .label { font-size: 13px; color: ${muted}; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #e3e7e3; font-size: 12px; color: #4d5d4d; }
  .chart {
    height: 180px; border-radius: 12px;
    background: linear-gradient(180deg, #e8f0e9 0%, transparent 100%);
    border: 1px dashed ${border}; position: relative; overflow: hidden;
  }
  .chart::after {
    content: ''; position: absolute; bottom: 24px; left: 24px; right: 24px; height: 80px;
    border-bottom: 2px solid ${accent}; opacity: 0.5;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 80'%3E%3Cpath d='M0,60 Q80,20 160,45 T320,30 L400,10' fill='none' stroke='%236b8f71' stroke-width='2'/%3E%3C/svg%3E") bottom / 100% no-repeat;
  }
  .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
  .list-item {
    padding: 14px 16px; border: 1px solid ${border}; border-radius: 12px; margin-bottom: 10px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .banner {
    padding: 12px 16px; border-radius: 12px; background: #fdf6f0; border: 1px solid #e6ddd2;
    font-size: 13px; color: #70584c; margin-bottom: 20px;
  }
`

function page(html: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head><body>${html}</body></html>`
}

const shots: { name: string; html: string }[] = [
  {
    name: '01-login',
    html: page(`
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;">
        <div style="text-align:center;margin-bottom:40px;">
          <div class="logo" style="justify-content:center;margin-bottom:12px;">
            <div class="logo-mark">TJ</div>
          </div>
          <div style="font-weight:500;margin-bottom:4px;">Therapy Journal</div>
          <h1>Welcome back</h1>
          <p class="muted">Good to see you again</p>
        </div>
        <div class="card" style="width:100%;max-width:380px;">
          <div class="label">Email</div>
          <input type="text" value="you@example.com" readonly style="margin-bottom:16px;" />
          <div class="label">Password</div>
          <input type="password" value="••••••••" readonly />
          <button class="btn btn-primary" style="width:100%;margin-top:20px;">Sign in</button>
        </div>
        <p class="muted" style="margin-top:32px;max-width:420px;text-align:center;font-size:12px;">
          For research and educational purposes. Not a substitute for professional care.
        </p>
      </div>
    `),
  },
  {
    name: '02-patient-dashboard',
    html: page(`
      <div class="nav">
        <div class="logo"><div class="logo-mark">TJ</div> Therapy Journal</div>
        <span class="muted">Patient</span>
      </div>
      <div class="wrap">
        <p class="muted" style="text-align:center;margin-bottom:8px;">Hi, Alex</p>
        <h2 style="text-align:center;font-size:20px;margin-bottom:24px;">Your week at a glance</h2>
        <div class="card" style="margin-bottom:20px;">
          <p class="muted" style="margin-bottom:8px;">How your days felt overall</p>
          <div class="chart"></div>
        </div>
        <div class="grid2" style="margin-bottom:20px;">
          <div class="card"><h2>Themes</h2><p class="muted">Sleep, work stress, connection</p></div>
          <div class="card"><h2>Better moments</h2><p class="muted">Evenings after a short walk</p></div>
        </div>
        <div class="row">
          <button class="btn btn-primary" style="flex:1;">Write something</button>
          <button class="btn btn-secondary" style="flex:1;">View details</button>
        </div>
      </div>
    `),
  },
  {
    name: '03-journal-new-entry',
    html: page(`
      <div class="nav">
        <div class="logo"><div class="logo-mark">TJ</div> Therapy Journal</div>
        <span class="muted">New entry</span>
      </div>
      <div class="wrap">
        <h1>How are you feeling?</h1>
        <p class="muted" style="margin-bottom:20px;">Choose a mood or switch to free writing.</p>
        <div class="row" style="margin-bottom:24px;">
          ${['Calm', 'Low', 'Anxious', 'Hopeful', 'Tired', 'Okay']
            .map((m) => `<button class="btn btn-secondary" style="border-radius:999px;">${m}</button>`)
            .join('')}
        </div>
        <div class="card">
          <p class="label">Today's note</p>
          <textarea readonly style="width:100%;min-height:140px;border:1px solid ${border};border-radius:10px;padding:14px;font-size:15px;font-family:inherit;resize:none;">
Today I noticed I was ruminating less after journaling. I still feel tired, but naming it helped.
          </textarea>
          <p class="muted" style="margin-top:10px;font-size:13px;">142 / 5,000 characters</p>
        </div>
        <div class="row" style="margin-top:20px;">
          <button class="btn btn-primary">Save entry</button>
        </div>
      </div>
    `),
  },
  {
    name: '04-patient-insights',
    html: page(`
      <div class="nav">
        <div class="logo"><div class="logo-mark">TJ</div> Therapy Journal</div>
        <span class="muted">Insights</span>
      </div>
      <div class="wrap">
        <h1>Details & patterns</h1>
        <p class="muted" style="margin-bottom:24px;">AI-assisted summaries — not a diagnosis.</p>
        <div class="card" style="margin-bottom:16px;">
          <p class="pill" style="margin-bottom:12px;">AI output</p>
          <h2>Mood over time</h2>
          <div class="chart" style="height:160px;"></div>
        </div>
        <div class="grid2">
          <div class="card"><h2>Symptoms</h2><p class="muted">Tension, fatigue (example)</p></div>
          <div class="card"><h2>Sleep vs mood</h2><p class="muted">Slight correlation this week</p></div>
        </div>
      </div>
    `),
  },
  {
    name: '05-therapist-dashboard',
    html: page(`
      <div class="nav">
        <div class="logo"><div class="logo-mark">TJ</div> Therapy Journal</div>
        <span class="muted">Therapist</span>
      </div>
      <div class="wrap">
        <h1>Dashboard</h1>
        <p class="muted" style="margin-bottom:20px;">Patients you're connected with</p>
        <div class="banner">Crisis alerts appear here when flagged language is detected (example UI).</div>
        <div class="card">
          <div class="list-item"><span><strong>Alex M.</strong><br/><span class="muted">Last entry · 2d ago</span></span><span class="pill">Stable</span></div>
          <div class="list-item"><span><strong>Jordan P.</strong><br/><span class="muted">Last entry · today</span></span><span class="pill">Watch</span></div>
        </div>
      </div>
    `),
  },
  {
    name: '06-therapist-patient-list',
    html: page(`
      <div class="nav">
        <div class="logo"><div class="logo-mark">TJ</div> Therapy Journal</div>
        <span class="muted">Patients</span>
      </div>
      <div class="wrap">
        <h1>All patients</h1>
        <p class="muted" style="margin-bottom:20px;">Open a patient to see shared entries and trends.</p>
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="list-item" style="margin:0;border:none;border-bottom:1px solid ${border};border-radius:0;">
            <span>Alex M.</span><span class="muted">→</span>
          </div>
          <div class="list-item" style="margin:0;border:none;border-radius:0;">
            <span>Jordan P.</span><span class="muted">→</span>
          </div>
        </div>
      </div>
    `),
  },
  {
    name: '07-therapist-patient-detail',
    html: page(`
      <div class="nav">
        <div class="logo"><div class="logo-mark">TJ</div> Therapy Journal</div>
        <span class="muted">Patient</span>
      </div>
      <div class="wrap">
        <p class="muted" style="margin-bottom:4px;">Shared with you</p>
        <h1>Alex M.</h1>
        <div class="banner" style="margin-top:16px;">
          Clinical decision support — review entries in context; not a substitute for judgment.
        </div>
        <div class="card" style="margin-bottom:16px;">
          <h2>Trend</h2>
          <div class="chart" style="height:140px;"></div>
        </div>
        <div class="card">
          <h2>Recent shared entries</h2>
          <p class="muted" style="margin:12px 0 0;">“I felt overwhelmed at work, but talking it through in my entry helped…”</p>
          <p class="muted" style="font-size:13px;margin-top:8px;">Mar 12 · shared</p>
        </div>
      </div>
    `),
  },
]

async function main() {
  await fs.promises.mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  for (const { name, html } of shots) {
    await page.setContent(html, { waitUntil: 'load' })
    await page.screenshot({
      path: path.join(OUT, `${name}.png`),
      fullPage: true,
    })
  }

  await browser.close()
  console.log(`Wrote ${shots.length} screenshots to ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
