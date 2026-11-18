/**
 * The dashboard's "Finish setting up" card, end to end.
 *
 * The wizard keeps no progress of its own, so the card is derived from the
 * same `computeWizardProgress` scan the wizard resumes with: it names the
 * next step, links where `GET /setup/wizard` would redirect, and disappears
 * once nothing is outstanding. Five properties this holds the page to:
 *
 *   - Admins only. The wizard's last two steps are admin-gated and the reads
 *     behind the scan (`listApiKeys`, `listWebhookSubs`) are operator+, so an
 *     operator or viewer never sees the card and never triggers those calls.
 *   - An outage hides the card rather than mis-stating the next step — on
 *     every read the scan makes, not just the platform rows. The scan's own
 *     helpers swallow a failed read as "not done" (right for the wizard rail,
 *     wrong for a card that would then name the wrong step), so the dashboard
 *     has to fail the reads before the scan sees them.
 *   - "Skip for now" persists deployment-wide under the step it skipped, so
 *     it returns by itself once the next step is a different one — and can be
 *     undone from the dashboard for a while, like any other clear.
 *   - The `?wizard=complete` success panel needs the scan to agree that
 *     nothing is outstanding — "Setup complete" above "Finish setting up"
 *     is a contradiction the page must not render. When the scan cannot say,
 *     the page says that, rather than nothing.
 *   - A passthrough deployment has no data-store metrics to read, and that
 *     is not an outage: the card must still finish there.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'
import { flashOf } from '../helpers/flash'

const getVerticals = vi.fn()
const listAllPlatformRows = vi.fn()
const getCompanyInfo = vi.fn()
const listApiKeys = vi.fn()
const listWebhookSubs = vi.fn()
const listDashboardDismissals = vi.fn()
const dismissDashboardTasks = vi.fn()
const undismissDashboardTask = vi.fn()
const getDataStoreMetrics = vi.fn()
const listSyncJobs = vi.fn()
const listTenants = vi.fn()
const listRuntimeSettings = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getVerticals,
      listAllPlatformRows,
      getCompanyInfo,
      listApiKeys,
      listWebhookSubs,
      listDashboardDismissals,
      dismissDashboardTasks,
      undismissDashboardTask,
      getDataStoreMetrics,
      listSyncJobs,
      listTenants,
      listRuntimeSettings,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { invalidateLogoSettingsCache } = await import('../../src/core/routes/logo-config')

const SESSION_SECRET = 'dashboard-setup-resume-secret-long-enough'
let fastify: FastifyInstance
type Role = 'viewer' | 'operator' | 'admin'

/** What the real axios client rejects with: never a synchronous throw. */
const upstream = (status: number, message: string) =>
  Object.assign(new Error(message), { response: { status, data: { error: message } } })

/** Branding saved, one platform enabled, credentials still missing → step 5. */
function midSetup() {
  getCompanyInfo.mockResolvedValue({ name: 'ACME' })
  getVerticals.mockResolvedValue([{ name: 'accounting', status: 'up', adapterCount: 1 }])
  listAllPlatformRows.mockResolvedValue([
    { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: false },
  ])
}

/** Everything a database-mode deployment needs: nothing is outstanding. */
function complete() {
  midSetup()
  listAllPlatformRows.mockResolvedValue([
    { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
  ])
  listApiKeys.mockResolvedValue([{ id: 'k1' }])
}

/** A stored "Skip for now" on `step`, cleared `ageMs` ago. */
function skipped(step: string, ageMs = 0) {
  listDashboardDismissals.mockResolvedValue([
    {
      key: `wizard:${step}`,
      fingerprint: step,
      by: 'u1',
      createdAt: new Date(Date.now() - ageMs).toISOString(),
    },
  ])
}

beforeEach(async () => {
  getVerticals
    .mockReset()
    .mockResolvedValue([{ name: 'accounting', status: 'up', adapterCount: 0 }])
  listAllPlatformRows.mockReset().mockResolvedValue([])
  getCompanyInfo.mockReset().mockResolvedValue(null)
  listApiKeys.mockReset().mockResolvedValue([])
  listWebhookSubs.mockReset().mockResolvedValue([])
  listDashboardDismissals.mockReset().mockResolvedValue([])
  dismissDashboardTasks.mockReset().mockResolvedValue(undefined)
  undismissDashboardTask.mockReset().mockResolvedValue(undefined)
  getDataStoreMetrics.mockReset().mockResolvedValue({ mode: 'database' })
  // Answering (with nothing) says a sync engine exists, i.e. not passthrough.
  listSyncJobs.mockReset().mockResolvedValue([])
  listTenants.mockReset().mockResolvedValue([{ id: 'default', name: 'Default' }])
  listRuntimeSettings.mockReset().mockResolvedValue([])
  // The logo read is behind a module-level TTL cache; without this only the
  // first test in the file would see the call.
  invalidateLogoSettingsCache()
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

const session = (role: Role) =>
  fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }))
const csrf = (cookie: string) =>
  createHmac('sha256', SESSION_SECRET).update(cookie).digest('hex').slice(0, 32)

const dashboard = (role: Role = 'admin', url = '/') =>
  fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })

function post(role: Role, url: string, body: Record<string, string> = {}, withCsrf = true) {
  const c = session(role)
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: withCsrf ? { _csrf: csrf(c), ...body } : body,
  })
}
const skip = (role: Role, body: Record<string, string> = {}, withCsrf = true) =>
  post(role, '/dashboard/setup/skip', body, withCsrf)

const CARD = 'Finish setting up'
const COMPLETE = 'Setup complete'
const UNCONFIRMED = 'confirm setup is finished'
const SKIPPED = 'Setup reminder hidden'

describe('who sees the card', () => {
  for (const role of ['viewer', 'operator'] as const) {
    it(`never shows it to a ${role}, and asks admin-api nothing on their behalf`, async () => {
      midSetup()
      const res = await dashboard(role)
      expect(res.statusCode).toBe(200)
      expect(res.body).not.toContain(CARD)
      // The two operator-gated reads the scan makes. (getCompanyInfo is not
      // in the list: the layout's branding hook calls it on every page.)
      expect(listApiKeys).not.toHaveBeenCalled()
      expect(listWebhookSubs).not.toHaveBeenCalled()
    })
  }

  it('shows an admin the next step, numbered, with the wizard link', async () => {
    midSetup()
    const res = await dashboard('admin')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(CARD)
    expect(res.body).toContain('next: <strong>Credentials</strong> (step 5 of 8)')
    expect(res.body).toContain('href="/setup/wizard/configure"')
    expect(res.body).toContain('>Continue setup<')
    expect(res.body).toContain('action="/dashboard/setup/skip"')
    expect(res.body).toContain('name="step" value="configure"')
  })

  it('links a fresh deployment to step 1 without bouncing it back out', async () => {
    // `GET /setup/wizard` redirects to the first incomplete step; when that
    // step IS step 1 there is nowhere to redirect, so the link carries the
    // same escape hatch the rail uses.
    const res = await dashboard('admin')
    expect(res.body).toContain('next: <strong>Data store</strong> (step 1 of 8)')
    expect(res.body).toContain('href="/setup/wizard?stay=1"')
  })

  it('is gone once nothing is outstanding', async () => {
    complete()
    const res = await dashboard('admin')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(CARD)
  })

  it('counts webhooks as outstanding only in external mode', async () => {
    complete()
    getDataStoreMetrics.mockResolvedValue({ mode: 'external' })
    const res = await dashboard('admin')
    expect(res.body).toContain('next: <strong>Webhooks</strong> (step 8 of 8)')
  })

  it('reuses the verticals and platform rows the dashboard fetched, and skips the rail-only reads', async () => {
    // Logos and tenants never decide the next step: the scan must not pay
    // for the tenant list at all, and the one logo-settings read is the
    // dashboard's own (for the adapter tiles), not a second one for the rail.
    midSetup()
    await dashboard('admin')
    expect(getVerticals).toHaveBeenCalledTimes(1)
    expect(listAllPlatformRows).toHaveBeenCalledTimes(1)
    expect(listTenants).not.toHaveBeenCalled()
    expect(listRuntimeSettings).toHaveBeenCalledTimes(1)
    expect(getDataStoreMetrics).toHaveBeenCalledTimes(1)
  })
})

describe('hidden, not wrong, on an outage', () => {
  it('when the platform rows cannot be read', async () => {
    // Without the rows the scan would read "no platform enabled" and send a
    // finished deployment back to step 4.
    complete()
    listAllPlatformRows.mockRejectedValue(upstream(503, 'admin-api down'))
    const res = await dashboard('admin')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(CARD)
  })

  it('when the API-key read fails on a finished deployment (would say step 7)', async () => {
    complete()
    listApiKeys.mockRejectedValue(upstream(503, 'admin-api down'))
    const res = await dashboard('admin')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(CARD)
    expect(res.body).not.toContain('API key</strong>')
  })

  it('when the company record cannot be read (would say step 2)', async () => {
    midSetup()
    getCompanyInfo.mockRejectedValue(upstream(503, 'admin-api down'))
    const res = await dashboard('admin')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(CARD)
    expect(res.body).not.toContain('Branding</strong>')
  })

  it('when the webhook read fails in external mode (would say step 8, or nothing)', async () => {
    complete()
    getDataStoreMetrics.mockResolvedValue({ mode: 'external' })
    listWebhookSubs.mockRejectedValue(upstream(503, 'admin-api down'))
    const res = await dashboard('admin')
    expect(res.body).not.toContain(CARD)
    expect(res.body).not.toContain('Webhooks</strong>')
  })

  it('even when a read throws synchronously, and the dashboard still renders', async () => {
    midSetup()
    listApiKeys.mockImplementation(() => {
      throw new TypeError('not a promise')
    })
    const res = await dashboard('admin')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(CARD)
    expect(res.body).toContain('<h1 class="page-header__title">Status</h1>')
  })
})

describe('the data-store mode', () => {
  // The admin-api client answers `null` for the metrics both when
  // integration-server is unreachable and when it runs in passthrough mode,
  // where there is no data store to have metrics. The sync-jobs read tells
  // the two apart: passthrough has no sync engine and answers 404.

  it('is not needed while an earlier step is outstanding', async () => {
    midSetup()
    getDataStoreMetrics.mockResolvedValue(null)
    const res = await dashboard('admin')
    expect(res.body).toContain('next: <strong>Credentials</strong> (step 5 of 8)')
  })

  it('reads as passthrough when the sync engine answers 404, and the card finishes', async () => {
    complete()
    getDataStoreMetrics.mockResolvedValue(null)
    listSyncJobs.mockRejectedValue(upstream(404, 'Not Found'))
    const res = await dashboard('admin', '/?wizard=complete')
    expect(res.body).not.toContain(CARD)
    expect(res.body).toContain(COMPLETE)
  })

  it('is unknown on an outage with a sync engine present: no card, and no "Setup complete"', async () => {
    // External mode with no webhook subscription looks exactly like this
    // from the dashboard, so neither claim can be made.
    complete()
    getDataStoreMetrics.mockResolvedValue(null)
    const res = await dashboard('admin', '/?wizard=complete')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(CARD)
    expect(res.body).not.toContain(COMPLETE)
    expect(res.body).toContain(UNCONFIRMED)
  })
})

describe('Skip for now', () => {
  it('persists the skipped step under its own key and hides the card', async () => {
    midSetup()
    const res = await skip('admin', { step: 'configure' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/')
    expect(dismissDashboardTasks).toHaveBeenCalledWith('jwt', [
      { key: 'wizard:configure', fingerprint: 'configure' },
    ])
    const flash = flashOf(fastify, res)
    expect(flash.map((m) => m.tone)).toEqual(['success'])
    // A deployment-wide write next to "Continue setup" needs a way back.
    expect(flash[0].body).toContain('Undo')

    skipped('configure')
    const after = await dashboard('admin')
    expect(after.body).not.toContain(CARD)
  })

  it('offers Undo on the dashboard for a while after the skip', async () => {
    midSetup()
    skipped('configure')
    const res = await dashboard('admin')
    expect(res.body).toContain(SKIPPED)
    expect(res.body).toContain('action="/dashboard/tasks/undismiss"')
    expect(res.body).toContain('name="key" value="wizard:configure"')
  })

  it('stops offering Undo once the skip is old', async () => {
    midSetup()
    skipped('configure', 60 * 60 * 1000)
    const res = await dashboard('admin')
    expect(res.body).not.toContain(SKIPPED)
    expect(res.body).not.toContain(CARD)
  })

  it('undoes the skip through the panel’s Undo route, admin only', async () => {
    const res = await post('admin', '/dashboard/tasks/undismiss', { key: 'wizard:configure' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/')
    expect(undismissDashboardTask).toHaveBeenCalledWith('jwt', 'wizard:configure')
    expect(flashOf(fastify, res).map((m) => m.tone)).toEqual(['success'])

    undismissDashboardTask.mockClear()
    const op = await post('operator', '/dashboard/tasks/undismiss', { key: 'wizard:configure' })
    expect(op.statusCode).toBe(403)
    expect(undismissDashboardTask).not.toHaveBeenCalled()
  })

  it('comes back by itself once the next step is a different one', async () => {
    midSetup()
    skipped('platforms')
    const res = await dashboard('admin')
    expect(res.body).toContain('next: <strong>Credentials</strong> (step 5 of 8)')
  })

  it('shows the card when the skips cannot be read — a reminder, not a lie', async () => {
    midSetup()
    listDashboardDismissals.mockRejectedValue(new Error('admin-api down'))
    const res = await dashboard('admin')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(CARD)
  })

  for (const role of ['viewer', 'operator'] as const) {
    it(`refuses a ${role} before admin-api is asked`, async () => {
      const res = await skip(role, { step: 'configure' })
      expect(res.statusCode).toBe(403)
      expect(dismissDashboardTasks).not.toHaveBeenCalled()
    })
  }

  it('refuses a step that is not one of the wizard’s', async () => {
    const res = await skip('admin', { step: '../etc' })
    expect(res.statusCode).toBe(400)
    expect(dismissDashboardTasks).not.toHaveBeenCalled()
  })

  it('needs the CSRF token', async () => {
    const res = await skip('admin', { step: 'configure' }, false)
    expect(res.statusCode).toBe(403)
    expect(dismissDashboardTasks).not.toHaveBeenCalled()
  })
})

describe('the ?wizard=complete success panel', () => {
  it('renders when the scan agrees nothing is outstanding', async () => {
    complete()
    const res = await dashboard('admin', '/?wizard=complete')
    expect(res.body).toContain(COMPLETE)
    expect(res.body).not.toContain(CARD)
    expect(res.body).not.toContain(UNCONFIRMED)
  })

  it('does not claim completion above a card that says otherwise', async () => {
    // Step 8's Skip-for-now links here whatever the state of steps 1-7.
    midSetup()
    const res = await dashboard('admin', '/?wizard=complete')
    expect(res.body).not.toContain(COMPLETE)
    expect(res.body).toContain(CARD)
  })

  it('shows the card past a skip, rather than acknowledging nothing at all', async () => {
    // Skipped at step 5, then walked the wizard by the rail and pressed
    // Finish on step 8: the skip must not leave this page silent.
    midSetup()
    skipped('configure')
    const res = await dashboard('admin', '/?wizard=complete')
    expect(res.body).not.toContain(COMPLETE)
    expect(res.body).toContain(CARD)
  })

  it('says so when the scan could not run, rather than nothing', async () => {
    complete()
    listAllPlatformRows.mockRejectedValue(upstream(503, 'admin-api down'))
    const res = await dashboard('admin', '/?wizard=complete')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(COMPLETE)
    expect(res.body).not.toContain(CARD)
    expect(res.body).toContain(UNCONFIRMED)
    expect(res.body).toContain('href="/setup/wizard')
  })
})
