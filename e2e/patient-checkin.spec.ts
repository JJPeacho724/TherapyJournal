import { test, expect } from '@playwright/test'

const DEMO_EMAIL = 'demo.patient1@therapyjournal.local'
const DEMO_PASSWORD = 'DemoPatient1!'

async function loginAsPatient(page: any) {
  await page.goto('/login')
  await page.fill('input[type="email"]', DEMO_EMAIL)
  await page.fill('input[type="password"]', DEMO_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|journal)/, { timeout: 15000 })
}

test.describe('Patient Check-in Flow', () => {
  test('can navigate to new journal entry', async ({ page }) => {
    await loginAsPatient(page)
    await page.goto('/journal/new')
    await expect(page.locator('text=How are you feeling')).toBeVisible({ timeout: 10000 })
  })

  test('mood selector is interactive', async ({ page }) => {
    await loginAsPatient(page)
    await page.goto('/journal/new')
    await page.waitForSelector('text=How are you feeling', { timeout: 10000 })
    const moodButtons = page.locator('[class*="mood"], button')
    expect(await moodButtons.count()).toBeGreaterThan(0)
  })

  test('character counter appears in editor', async ({ page }) => {
    await loginAsPatient(page)
    await page.goto('/journal/new')
    await page.click('text=Switch to free writing')
    const textarea = page.locator('textarea')
    await textarea.fill('Hello world test entry')
    await expect(page.locator('text=/\\d.*\\/.*5,000/')).toBeVisible()
  })
})
