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

test.describe('Error States', () => {
  test('empty journal entry cannot be saved', async ({ page }) => {
    await loginAsPatient(page)
    await page.goto('/journal/new')
    await page.click('text=Switch to free writing')
    const saveButton = page.locator('button:has-text("Save entry")')
    await expect(saveButton).toBeDisabled()
  })

  test('404 page renders for nonexistent routes', async ({ page }) => {
    await page.goto('/this-does-not-exist')
    await expect(page.locator('text=404').or(page.locator('text=not found').or(page.locator('text=Not Found')))).toBeVisible({ timeout: 10000 })
  })

  test('homepage loads as public route', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
  })
})
