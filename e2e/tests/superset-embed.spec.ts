/**
 * Embedded Superset, end to end: the dashboards page lists the registered
 * Superset dashboards, and opening one frames Superset's /embedded/<uuid>
 * page with a guest token the console minted.
 *
 * Gated three ways — skip (never fail) without a running stack, without an
 * admin login, and without OS_E2E_SUPERSET_URL (the browser-facing Superset
 * URL of a stack started with the `analytics` compose profile and the
 * superset-bootstrap job run; see docs/deployment/superset.md).
 */
import { test, expect, type Page } from '@playwright/test'
import { stackAvailable, adminCredentials } from './helpers'

const SUPERSET_URL = (process.env.OS_E2E_SUPERSET_URL ?? '').replace(/\/+$/, '')

test.beforeEach(async () => {
  test.skip(!SUPERSET_URL, 'set OS_E2E_SUPERSET_URL to run the embedded Superset journey')
  test.skip(!(await stackAvailable()), 'no running stack — start docker compose first')
  test.skip(
    !adminCredentials(),
    'set OS_E2E_ADMIN_USER / OS_E2E_ADMIN_PASSWORD to run admin journeys',
  )
})

async function login(page: Page): Promise<void> {
  const creds = adminCredentials()!
  await page.goto('/login')
  await page.fill('input[name="username"]', creds.user)
  await page.fill('input[name="password"]', creds.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

test('a registered Superset dashboard opens embedded, with a guest token', async ({ page }) => {
  await login(page)
  await page.goto('/dashboards')
  const section = page.locator('[data-dashboards-superset]')
  await expect(section).toBeVisible()
  const card = section.locator('a[href^="/dashboards/superset/"]').first()
  await expect(card).toBeVisible()

  const token = page.waitForResponse(
    (r) =>
      /\/dashboards\/superset\/[^/]+\/guest-token$/.test(r.url()) &&
      r.request().method() === 'POST',
  )
  await card.click()
  const res = await token
  expect(res.status()).toBe(200)
  expect(typeof (await res.json()).token).toBe('string')

  const frame = page.locator('[data-superset-mount] iframe')
  await expect(frame).toHaveAttribute(
    'src',
    new RegExp(`^${SUPERSET_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/embedded/`),
  )
  const csp = (await page.request.get(page.url())).headers()['content-security-policy'] ?? ''
  expect(csp).toContain(`frame-src ${new URL(SUPERSET_URL).origin}`)
})
