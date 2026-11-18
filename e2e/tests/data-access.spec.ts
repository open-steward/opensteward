/**
 * The data viewer and native dashboards, end to end: browse the stored
 * records of a connection, open one, check personal data is masked, draw a
 * built-in dashboard, and export CSV — all through a real browser session,
 * so the strict per-route CSP and the pages' external scripts run for real.
 *
 * Tier 2 (admin login). Skips, never fails, when:
 *   - no stack is listening, or no admin login is configured;
 *   - the stack runs DATA_STORE_MODE=passthrough (nothing is stored);
 *   - no connection in the login's scope has stored records yet.
 *
 * The `/test/v1` sandbox keeps its fixtures in `sandbox_resources`, apart
 * from the `resources` table the data viewer reads, so a sandbox key cannot
 * seed this journey. Connect any platform on the target stack and let its
 * first sync finish, or name a connection with stored records in
 * OS_E2E_DATA_CONNECTION_ID. Nothing here writes: the journey only reads and
 * exports (the export is audited as `data.export`), and never reveals PII.
 */
import { test, expect, type Page } from '@playwright/test'
import { stackAvailable, adminCredentials } from './helpers'

const PINNED_CONNECTION = process.env.OS_E2E_DATA_CONNECTION_ID ?? ''

test.beforeEach(async () => {
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

/**
 * The `/data/connections/:id?type=…` href of a resource type with stored
 * records, from the `/data` overview — the pinned connection's when
 * OS_E2E_DATA_CONNECTION_ID is set. Skips the test when there is none.
 */
async function connectionWithRecords(page: Page): Promise<string> {
  const res = await page.goto('/data')
  expect(res?.status()).toBe(200)
  test.skip(
    (await page.locator('body').textContent())?.includes('DATA_STORE_MODE=passthrough') ?? false,
    'the stack runs DATA_STORE_MODE=passthrough — nothing is stored to browse',
  )
  const table = page.locator('table[data-data-connections]')
  test.skip(
    (await table.count()) === 0,
    'no connection in scope has stored records — connect a platform and let it sync, ' +
      'or set OS_E2E_DATA_CONNECTION_ID',
  )
  const prefix = PINNED_CONNECTION
    ? `/data/connections/${encodeURIComponent(PINNED_CONNECTION)}?type=`
    : '/data/connections/'
  // Each resource-type badge reads "<type> · <count>"; take one with records.
  const badges = table.locator(`a.badge[href^="${prefix}"]`)
  const n = await badges.count()
  for (let i = 0; i < n; i++) {
    const badge = badges.nth(i)
    const count = Number(((await badge.textContent()) ?? '').split('·').pop()?.replace(/\D/g, ''))
    if (count > 0) return (await badge.getAttribute('href'))!
  }
  test.skip(
    true,
    `no resource type with stored records${PINNED_CONNECTION ? ` on ${PINNED_CONNECTION}` : ''}`,
  )
  return ''
}

test('the data pages are served under the strict CSP', async ({ page }) => {
  await login(page)
  const res = await page.goto('/data')
  expect(res?.status()).toBe(200)
  const csp = res!.headers()['content-security-policy'] ?? ''
  expect(csp).toContain("script-src 'self'")
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
})

test('browse a connection, open a record, see personal data masked', async ({ page }) => {
  await login(page)
  const href = await connectionWithRecords(page)

  await page.goto(href)
  const rows = page.locator('table[data-data-records] tbody tr')
  await expect(rows.first()).toBeVisible()
  const recordLink = rows.first().locator('a[href*="/records/"]').first()
  const recordHref = await recordLink.getAttribute('href')
  expect(recordHref).toBeTruthy()

  // Open the record as its own page (the list opens it in a modal).
  const res = await page.goto(recordHref!)
  expect(res?.status()).toBe(200)
  expect(res!.headers()['cache-control'] ?? '').toContain('no-store')
  await expect(page.locator('body')).toContainText('Masked by field classification')
  await expect(page.locator('[data-pii-revealed]')).toHaveCount(0)

  // Every top-level field classified as PII carries a masked value, never
  // the stored one: `j***@example.com`, `***-**12`, `J*** D***`, `[REDACTED]`
  // or an HMAC token.
  const data = JSON.parse(
    (await page.locator('script[data-json-view-source]').textContent()) ?? '{}',
  ) as Record<string, unknown>
  const classes = JSON.parse(
    (await page.locator('script[data-json-view-classes]').textContent()) ?? '{}',
  ) as Record<string, string>
  for (const [path, cls] of Object.entries(classes)) {
    if (cls !== 'pii' || path.includes('.') || path.includes('[')) continue
    const value = data[path]
    if (typeof value !== 'string' || value === '') continue
    expect(value, `PII field ${path} is not masked`).toMatch(/\*|^\[REDACTED\]$|^[0-9a-f]{16,}$/)
  }
})

test('the built-in data overview dashboard draws its charts', async ({ page }) => {
  await login(page)
  await connectionWithRecords(page)

  await page.goto('/dashboards')
  await expect(page.locator('[data-dashboards-builtin]')).toBeVisible()
  const res = await page.goto(`/dashboards/${encodeURIComponent('builtin:overview')}`)
  expect(res?.status()).toBe(200)

  const widgets = page.locator('[data-dashboard] [data-widget]')
  await expect(widgets.first()).toBeVisible()
  // Every widget leaves its loading state (dashboard.js fetched its metric).
  await expect(
    page.locator('[data-dashboard] [data-widget-state]', { hasText: 'Loading…' }),
  ).toHaveCount(0, {
    timeout: 15_000,
  })
  // With stored records, "Stored records per vertical" is drawn by ECharts
  // (SVG renderer) and the freshness table has rows.
  await expect(
    page.locator('[data-metric-id="system.records_per_vertical"] .dash-widget__chart svg'),
  ).toBeVisible()
  await expect(
    page.locator('[data-metric-id="system.data_freshness"] table tbody tr').first(),
  ).toBeVisible()
})

test('export a resource type as CSV', async ({ page }) => {
  await login(page)
  const href = await connectionWithRecords(page)
  await page.goto(href)
  const form = page.locator('form[data-data-export]')
  test.skip((await form.count()) === 0, 'this login lacks data:export')

  // The form is a plain GET to /data/connections/:id/export with the page's
  // type, search and filters as hidden fields; request it with the session.
  const action = (await form.getAttribute('action'))!
  const params = new URLSearchParams()
  for (const input of await form.locator('input[type="hidden"]').all()) {
    params.set((await input.getAttribute('name'))!, (await input.getAttribute('value')) ?? '')
  }
  params.set('format', 'csv')
  const res = await page.request.get(`${action}?${params.toString()}`)
  expect(res.status()).toBe(200)
  const headers = res.headers()
  expect(headers['content-type']).toMatch(/^text\/csv/)
  expect(headers['content-disposition']).toMatch(/^attachment; filename="[\w.-]+\.csv"$/)
  expect(headers['cache-control']).toContain('no-store')
  const body = await res.text()
  expect(body.split('\r\n')[0]).toMatch(/\S/)
})
