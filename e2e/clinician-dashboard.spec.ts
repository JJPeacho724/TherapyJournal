import { test, expect } from '@playwright/test'

const CLINICIAN_EMAIL = 'demo.clinician1@therapyjournal.local'
const CLINICIAN_PASSWORD = 'DemoClinician1!'

async function loginAsClinician(page: any) {
  await page.goto('/login')
  await page.fill('input[type="email"]', CLINICIAN_EMAIL)
  await page.fill('input[type="password"]', CLINICIAN_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/therapist/, { timeout: 15000 })
}

test.describe('Clinician Dashboard', () => {
  test('therapist dashboard loads after login', async ({ page }) => {
    await loginAsClinician(page)
    expect(page.url()).toContain('/therapist')
  })

  test('patient list is visible on therapist dashboard', async ({ page }) => {
    await loginAsClinician(page)
    await page.goto('/therapist/patients')
    await page.waitForSelector('[class*="patient"], a[href*="/patients/"]', { timeout: 15000 })
  })

  test('clinical decision banner appears on patient detail', async ({ page }) => {
    await loginAsClinician(page)
    await page.goto('/therapist/patients')
    const patientLink = page.locator('a[href*="/patients/"]').first()
    if (await patientLink.isVisible()) {
      await patientLink.click()
      await expect(page.locator('text=clinical decision support')).toBeVisible({ timeout: 10000 })
    }
  })
})
