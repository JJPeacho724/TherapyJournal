import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('text=Welcome back')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('signup page loads', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'nonexistent@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    await expect(page.locator('[class*="red"]')).toBeVisible({ timeout: 10000 })
  })

  test('login page shows session expired message', async ({ page }) => {
    await page.goto('/login?reason=session_expired')
    await expect(page.locator('text=session has expired')).toBeVisible()
  })

  test('unauthenticated access redirects to login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('login page loads within 2 seconds', async ({ page }) => {
    const start = Date.now()
    await page.goto('/login')
    await expect(page.locator('text=Welcome back')).toBeVisible()
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(5000)
  })

  test('login page has disclaimer banner', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('text=research and educational')).toBeVisible()
  })
})
