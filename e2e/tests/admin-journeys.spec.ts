/**
 * Credential-gated admin journeys — the operator's day-to-day, driven
 * through a real browser. Skip (never fail) until OS_E2E_ADMIN_USER /
 * OS_E2E_ADMIN_PASSWORD name a login on the target stack.
 *
 * Everything minted here is labelled `(e2e)` and revoked/cleaned in the same
 * test, so repeated runs leave no residue in the deployment.
 */
import { test, expect, type Page } from '@playwright/test'
import { API_URL } from '../playwright.config'
import { stackAvailable, adminCredentials } from './helpers'

test.beforeEach(async () => {
  test.skip(!(await stackAvailable()), 'no running stack — start docker compose first')
  test.skip(!adminCredentials(), 'set OS_E2E_ADMIN_USER / OS_E2E_ADMIN_PASSWORD to run admin journeys')
})

async function login(page: Page): Promise<void> {
  const creds = adminCredentials()!
  await page.goto('/login')
  await page.fill('input[name="username"]', creds.user)
  await page.fill('input[name="password"]', creds.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

test('wrong password is refused; the right one reaches the console', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="username"]', adminCredentials()!.user)
  await page.fill('input[name="password"]', 'definitely-wrong-password')
  await page.click('button[type="submit"]')
  await expect(page.locator('body')).toContainText(/invalid|incorrect|failed/i)

  await login(page)
  await expect(page.locator('body')).not.toContainText(/invalid credentials/i)
})

test('mint a test API key, see the plaintext once, revoke it', async ({ page }) => {
  await login(page)
  await page.goto('/api-keys/new')
  await page.fill('input[name="label"]', 'e2e-probe (e2e)')
  await page.check('input[name="mode"][value="test"]')
  await page.click('button[type="submit"]:has-text("Mint")')

  // The plaintext appears exactly once, on this response.
  const plaintext = await page.locator('.code-copy code').first().textContent()
  expect(plaintext).toMatch(/^osk_test_/)

  // ...and the key actually authenticates the sandbox.
  const res = await fetch(`${API_URL}/test/v1/connections`, {
    headers: { authorization: `Bearer ${plaintext!.trim()}` },
  })
  expect(res.status).toBe(200)

  // Clean up: revoke the key we just minted (first Revoke button on its row).
  const row = page.locator('tr', { hasText: 'e2e-probe (e2e)' }).first()
  page.once('dialog', (d) => void d.accept())
  await row.locator('form[action$="/revoke"] button').click()
  await page.waitForLoadState('networkidle')
  const after = await fetch(`${API_URL}/test/v1/connections`, {
    headers: { authorization: `Bearer ${plaintext!.trim()}` },
  })
  expect(after.status).toBe(401)
})

test('mint a connect link and open its landing page like a customer would', async ({
  page,
  context,
}) => {
  await login(page)
  await page.goto('/connect-links/new')
  // Self-register mode needs no customer email and no pinned adapter.
  await page.selectOption('select[name="linkMode"]', 'self-register')
  await page.fill('input[name="label"]', 'e2e connect probe (e2e)')
  await page.click('button[type="submit"]:has-text("Create link")')

  // The list page shows the freshly minted URL in the success banner.
  await expect(page.locator('#link-url')).toBeVisible()
  const url = await page.locator('#link-url').inputValue()
  expect(url).toContain('/connect/')

  // Open it in a fresh, unauthenticated page — the customer's seat. This
  // executes the landing page's client-side script for real.
  const customer = await context.newPage()
  await customer.goto(url)
  await expect(customer.locator('body')).not.toHaveText('')
  await expect(customer.locator('body')).not.toContainText(/UNAUTHENTICATED|error"/)

  // Clean up: revoke the link so reruns don't accumulate active sessions.
  await page.goto('/connect-links')
  const row = page.locator('tr', { hasText: 'e2e connect probe (e2e)' }).first()
  const revoke = row.locator('form[action*="/revoke"] button')
  if (await revoke.count()) {
    page.once('dialog', (d) => void d.accept())
    await revoke.click()
  }
})
