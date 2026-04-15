import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, type Page } from '@playwright/test'

/**
 * Live capture from a running app + seeded demo cohort (optional).
 *   npm run seed:cohort
 *   npm run screenshots:readme:live
 *
 * Default README images are generated without a server via:
 *   npm run screenshots:readme
 */
const OUT_DIR = path.join(process.cwd(), 'docs', 'images', 'walkthrough')

const PATIENT_EMAIL = 'demo.patient1@therapyjournal.local'
const PATIENT_PASSWORD = 'DemoPatient1!'
const THERAPIST_EMAIL = 'demo.clinician1@therapyjournal.local'
const THERAPIST_PASSWORD = 'DemoClinician1!'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.waitForSelector('text=Welcome back', { timeout: 30000 })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForLoadState('networkidle')
}

test.describe.configure({ mode: 'serial' })

test('capture README walkthrough screenshots (live app)', async ({ browser }) => {
  await fs.promises.mkdir(OUT_DIR, { recursive: true })

  const viewport = { width: 1280, height: 800 }

  const patientCtx = await browser.newContext({ viewport })
  const patientPage = await patientCtx.newPage()

  await patientPage.goto('/login')
  await patientPage.waitForSelector('text=Welcome back', { timeout: 30000 })
  await patientPage.screenshot({
    path: path.join(OUT_DIR, '01-login.png'),
    fullPage: true,
  })

  await login(patientPage, PATIENT_EMAIL, PATIENT_PASSWORD)
  await patientPage.waitForURL(/\/dashboard/, { timeout: 30000 })
  await patientPage.waitForTimeout(800)
  await patientPage.screenshot({
    path: path.join(OUT_DIR, '02-patient-dashboard.png'),
    fullPage: true,
  })

  await patientPage.goto('/journal/new')
  await patientPage.waitForSelector('text=How are you feeling', { timeout: 30000 })
  await patientPage.screenshot({
    path: path.join(OUT_DIR, '03-journal-new-entry.png'),
    fullPage: true,
  })

  await patientPage.goto('/dashboard/insights')
  await patientPage.waitForSelector('main', { timeout: 30000 })
  await patientPage.waitForTimeout(500)
  await patientPage.screenshot({
    path: path.join(OUT_DIR, '04-patient-insights.png'),
    fullPage: true,
  })

  await patientCtx.close()

  const therapistCtx = await browser.newContext({ viewport })
  const therapistPage = await therapistCtx.newPage()

  await login(therapistPage, THERAPIST_EMAIL, THERAPIST_PASSWORD)
  await therapistPage.waitForURL(/\/therapist/, { timeout: 30000 })
  await therapistPage.waitForTimeout(800)
  await therapistPage.screenshot({
    path: path.join(OUT_DIR, '05-therapist-dashboard.png'),
    fullPage: true,
  })

  await therapistPage.goto('/therapist/patients')
  await therapistPage.waitForSelector('main', { timeout: 30000 })
  await therapistPage.waitForTimeout(500)
  await therapistPage.screenshot({
    path: path.join(OUT_DIR, '06-therapist-patient-list.png'),
    fullPage: true,
  })

  const firstPatient = therapistPage.locator('a[href*="/therapist/patients/"]').first()
  await firstPatient.waitFor({ state: 'visible', timeout: 15000 })
  await firstPatient.click()
  await therapistPage.waitForURL(/\/therapist\/patients\/[^/]+/, { timeout: 30000 })
  await therapistPage.waitForTimeout(800)
  await therapistPage.screenshot({
    path: path.join(OUT_DIR, '07-therapist-patient-detail.png'),
    fullPage: true,
  })

  await therapistCtx.close()
})
