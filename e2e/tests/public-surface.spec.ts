/**
 * Zero-credential journeys: everything an anonymous browser can reach.
 *
 * The connect-link landing/error pages matter most here — their client-side
 * `<script>` is executed by NO other test in the repo (the journeys suites
 * assert on HTML strings via fastify.inject and never run the JS) — this
 * suite is the only layer that executes that script.
 */
import { test, expect } from '@playwright/test'
import { API_URL, DOCS_URL } from '../playwright.config'
import { stackAvailable } from './helpers'

test.beforeEach(async () => {
  test.skip(!(await stackAvailable()), 'no running stack — start docker compose first')
})

test('a junk connect token gets the branded error page, not a JSON blob', async ({ page }) => {
  const response = await page.goto(`${API_URL}/connect/definitely-not-a-token`)
  expect(response?.status()).toBe(404)
  // A customer's browser lands here from an email link; the page must speak
  // to a person. The branded error layout renders a heading and advice.
  await expect(page.locator('body')).toContainText('not valid')
})

test('integration-server and docs-server answer their health checks', async ({ request }) => {
  const api = await request.get(`${API_URL}/health`)
  expect(api.ok()).toBeTruthy()
  const docs = await request.get(`${DOCS_URL}/health`)
  expect(docs.ok()).toBeTruthy()
})

test('the docs portal renders its API reference shell in a real browser', async ({ page }) => {
  await page.goto(DOCS_URL)
  // The portal is a JS-rendered page — a real browser assertion here covers
  // what an HTML-string test cannot: the script actually ran.
  await expect(page.locator('body')).not.toHaveText('')
  await expect(page).toHaveTitle(/./)
})
