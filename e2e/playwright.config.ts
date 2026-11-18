/**
 * Browser-driven end-to-end suite. Runs against an ALREADY-RUNNING stack
 * (`docker compose up` or the dev servers) — it starts nothing itself, so a
 * test failure is always about the product, never about orchestration.
 *
 * Everything is opt-in by environment:
 *
 *   OS_E2E_ADMIN_URL        admin console      (default http://localhost:3000)
 *   OS_E2E_API_URL          integration-server (default http://localhost:3010)
 *   OS_E2E_DOCS_URL         docs-server        (default http://localhost:3003)
 *   OS_E2E_ADMIN_USER       admin console login — gates the admin journeys
 *   OS_E2E_ADMIN_PASSWORD   (specs skip, not fail, when unset)
 *
 * Specs that need nothing but a running stack (the public connect surface,
 * health, docs pages) run with zero configuration. Specs that sign in skip
 * until the two credential variables exist. Nothing in this suite ever
 * touches a production account: point it at a local or staging stack.
 */
import { defineConfig } from '@playwright/test'

export const ADMIN_URL = process.env.OS_E2E_ADMIN_URL ?? 'http://localhost:3000'
export const API_URL = process.env.OS_E2E_API_URL ?? 'http://localhost:3010'
export const DOCS_URL = process.env.OS_E2E_DOCS_URL ?? 'http://localhost:3003'

export default defineConfig({
  testDir: './tests',
  // One worker: the journeys share a deployment, and admin sessions are
  // stateful. Wall-clock is not the constraint at this suite's size.
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: ADMIN_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
})
