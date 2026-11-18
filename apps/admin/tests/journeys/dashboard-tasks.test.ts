/**
 * The dashboard's "Needs attention" panel, end to end.
 *
 * What the operator sees is derived on every request from the connections
 * the dashboard already loads plus two best-effort sync-job reads; a row can
 * be cleared once (operator+, deployment-wide) and comes back if the
 * condition recurs. Three properties this holds the page to:
 *
 *   - An outage never reads as "nothing needs attention". A sync-job read
 *     that fails renders a line saying so; one that answers 404 (passthrough
 *     mode has no sync engine) renders nothing, because there is nothing.
 *   - Every write is gated on both hops. A viewer sees the rows read-only and
 *     is refused the POST before admin-api is asked; an operator cannot clear
 *     a platform row, which only an admin can fix.
 *   - The server decides what gets cleared. The form carries keys, but only
 *     keys the server re-derives are forwarded, with the server's fingerprint.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'
import { flashOf } from '../helpers/flash'

const listConnections = vi.fn()
const listSyncJobs = vi.fn()
const listDashboardDismissals = vi.fn()
const dismissDashboardTasks = vi.fn()
const undismissDashboardTask = vi.fn()
const createSyncJob = vi.fn()
const deleteConnection = vi.fn()
const getVerticals = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnections,
      listSyncJobs,
      listDashboardDismissals,
      dismissDashboardTasks,
      undismissDashboardTask,
      createSyncJob,
      deleteConnection,
      getVerticals,
      listTenants: async () => [{ id: 'acme', name: 'Acme Ltd' }],
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'dashboard-tasks-secret-long-enough-for-this'
let fastify: FastifyInstance
type Role = 'viewer' | 'operator' | 'admin'

const EXPIRED = {
  id: 'conn-expired-1',
  vertical: 'accounting',
  platform: 'fortnox',
  tenantId: 'acme',
  label: 'Acme Books',
  status: 'expired',
  expiresAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  lastRefreshAt: null,
  lastRefreshStatus: 'expired',
}
const PLATFORM_ERROR = {
  ...EXPIRED,
  id: 'conn-perr-1',
  platform: 'xero',
  label: null,
  status: 'platform_error',
  expiresAt: '2026-09-02T00:00:00.000Z',
}
const HEALTHY = { ...EXPIRED, id: 'conn-ok-1', label: 'Healthy Co', status: 'valid' }
const REFRESH_FAILING = {
  ...HEALTHY,
  id: 'conn-warn-1',
  label: 'Warn Co',
  expiresAt: '2026-09-06T00:00:00.000Z',
  lastRefreshAt: '2026-09-05T11:00:00.000Z',
  lastRefreshStatus: 'failed',
}
const ACCOUNTING_UP = { name: 'accounting', status: 'up', adapterCount: 1 }
const ACCOUNTING_DOWN = {
  name: 'accounting',
  status: 'down',
  adapterCount: 0,
  error: 'connect ECONNREFUSED',
}
const FAILED_JOB = {
  id: 'job-failed-1',
  vertical: 'accounting',
  platform: 'fortnox',
  connectionId: 'conn-ok-1',
  tenantId: 'acme',
  status: 'failed',
  progress: null,
  error: 'HTTP 500 from upstream',
  callbackUrl: null,
  createdAt: '2026-09-05T10:00:00.000Z',
  startedAt: null,
  completedAt: '2026-09-05T10:00:05.000Z',
}

function upstream(status: number, message: string): Error {
  return Object.assign(new Error(message), {
    name: 'AxiosError',
    isAxiosError: true,
    response: { status, data: { error: message } },
  })
}

beforeEach(async () => {
  listConnections.mockReset().mockResolvedValue([])
  listSyncJobs.mockReset().mockResolvedValue([])
  listDashboardDismissals.mockReset().mockResolvedValue([])
  dismissDashboardTasks.mockReset().mockResolvedValue(undefined)
  undismissDashboardTask.mockReset().mockResolvedValue(undefined)
  createSyncJob.mockReset().mockResolvedValue({ id: 'job-2' })
  deleteConnection.mockReset().mockResolvedValue(undefined)
  getVerticals.mockReset().mockResolvedValue([ACCOUNTING_UP])
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

const dashboard = (role: Role = 'admin') =>
  fastify.inject({ method: 'GET', url: '/', cookies: { session: session(role) } })

function post(url: string, role: Role, body: Record<string, string> = {}, withCsrf = true) {
  const c = session(role)
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: withCsrf ? { _csrf: csrf(c), ...body } : body,
  })
}

/** The fingerprints the panel renders for the fixtures — what a live form carries. */
const FP = {
  expired: '2026-09-01T00:00:00.000Z',
  platform: '2026-09-02T00:00:00.000Z',
  sync: '',
  // The expiry, not the failed attempt: a retry rewrites `lastRefreshAt`
  // every worker tick, and a clear that lasted one tick would be a snooze.
  refresh: '2026-09-06T00:00:00.000Z',
}

const clear = (role: Role, items: Array<{ key: string; fingerprint: string }>) =>
  post('/dashboard/tasks/dismiss', role, { items: JSON.stringify(items) })

describe('the panel is present exactly when something needs attention', () => {
  it('is absent when every connection is healthy and no sync failed', async () => {
    listConnections.mockResolvedValue([HEALTHY])
    const res = await dashboard()
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('Needs attention')
  })

  it('lists an expired connection with its pill, platform, logo, label and tenant', async () => {
    listConnections.mockResolvedValue([EXPIRED])
    const res = await dashboard()
    expect(res.body).toContain('Needs attention')
    expect(res.body).toContain('aria-labelledby="dashboard-tasks-heading"')
    expect(res.body).toContain('>Expired<')
    // The catalogue's display name, as on the vertical cards below — not the slug.
    expect(res.body).toContain('>Fo</span>Fortnox</span>')
    expect(res.body).not.toContain('>Fo</span>fortnox</span>')
    expect(res.body).toContain('Acme Books')
    // The _tenant partial: name and id.
    expect(res.body).toContain('Acme Ltd')
    expect(res.body).toContain('>acme</span>')
  })

  it('offers an admin Mint Connect Link and Delete on an expired connection', async () => {
    listConnections.mockResolvedValue([EXPIRED])
    const res = await dashboard()
    expect(res.body).toContain('href="/connect-links/new"')
    expect(res.body).toContain('Mint Connect Link')
    expect(res.body).toContain('action="/connections/accounting/conn-expired-1/delete"')
    expect(res.body).toContain('name="returnTo" value="dashboard"')
  })

  it('offers an admin Fix credentials on a platform row, and shows how many it broke', async () => {
    listConnections.mockResolvedValue([PLATFORM_ERROR, { ...PLATFORM_ERROR, id: 'conn-perr-2' }])
    const res = await dashboard()
    expect(res.body).toContain('href="/platforms/accounting/xero"')
    expect(res.body).toContain('aria-label="Fix credentials: Xero"')
    expect(res.body).toContain('Xero rejected the OAuth client credentials — 2 connections blocked')
    // One row, not one per connection.
    expect(res.body.match(/>Fix credentials</g)).toHaveLength(1)
  })

  it('offers Retry sync and Open job on a failed sync', async () => {
    listConnections.mockResolvedValue([HEALTHY])
    listSyncJobs.mockResolvedValue([FAILED_JOB])
    const res = await dashboard()
    expect(res.body).toContain('>Failed<')
    expect(res.body).toContain('HTTP 500 from upstream')
    expect(res.body).toContain('action="/connections/accounting/conn-ok-1/sync"')
    expect(res.body).toContain('href="/sync-jobs/job-failed-1" data-modal')
    expect(res.body).toContain('aria-label="Open job: Fortnox Healthy Co"')
    expect(res.body).toContain('aria-label="Retry sync: Fortnox Healthy Co"')
  })

  it('folds a failed sync into its expired connection and withholds Retry', async () => {
    listConnections.mockResolvedValue([EXPIRED])
    listSyncJobs.mockResolvedValue([{ ...FAILED_JOB, connectionId: EXPIRED.id }])
    const res = await dashboard()
    expect(res.body).toContain('href="/sync-jobs/job-failed-1" data-modal')
    expect(res.body).not.toContain('Retry sync')
    expect(res.body.match(/Mint Connect Link/g)).toHaveLength(1)
  })

  it('gives repeated buttons distinct accessible names', async () => {
    listConnections.mockResolvedValue([
      EXPIRED,
      { ...EXPIRED, id: 'conn-expired-2', label: 'Beta Books' },
    ])
    const res = await dashboard()
    expect(res.body).toContain('aria-label="Clear: Fortnox Acme Books"')
    expect(res.body).toContain('aria-label="Clear: Fortnox Beta Books"')
    expect(res.body).toContain('aria-label="Delete: Fortnox Acme Books"')
    expect(res.body).toContain('aria-label="Delete: Fortnox Beta Books"')
  })

  it('gives repeated Open job links distinct accessible names', async () => {
    listConnections.mockResolvedValue([HEALTHY, { ...HEALTHY, id: 'conn-ok-2', label: 'Beta Co' }])
    listSyncJobs.mockResolvedValue([
      FAILED_JOB,
      { ...FAILED_JOB, id: 'job-failed-2', connectionId: 'conn-ok-2' },
    ])
    const res = await dashboard()
    expect(res.body).toContain('aria-label="Open job: Fortnox Healthy Co"')
    expect(res.body).toContain('aria-label="Open job: Fortnox Beta Co"')
  })

  it('replaces the old alert blocks, keeping the card badge', async () => {
    listConnections.mockResolvedValue([PLATFORM_ERROR])
    const res = await dashboard()
    expect(res.body).not.toContain('View affected connections')
    expect(res.body).not.toContain('need re-authorization.')
  })

  it('asks for the failed jobs and the recent jobs, 200 each', async () => {
    await dashboard()
    expect(listSyncJobs).toHaveBeenCalledWith('jwt', { status: 'failed', limit: 200 })
    expect(listSyncJobs).toHaveBeenCalledWith('jwt', { limit: 200 })
  })

  it('tells the browser not to cache the page, so Back does not re-show a cleared row', async () => {
    const res = await dashboard()
    expect(res.headers['cache-control']).toBe('no-store')
  })
})

/** The "Needs attention" panel alone — the vertical cards below it render a
 *  `Down` badge of their own, and the admin sidebar links to /settings/system
 *  on every page, so an assertion on the whole body proves nothing about a
 *  row. */
function panelOf(body: string): string {
  const start = body.indexOf('<section class="card tasks"')
  expect(start).toBeGreaterThan(-1)
  return body.slice(start, body.indexOf('</section>', start))
}

describe('a vertical that is down is a row nobody can clear', () => {
  it('names the vertical, with a Down pill, above every other row and outside the cap', async () => {
    getVerticals.mockResolvedValue([ACCOUNTING_DOWN, { ...ACCOUNTING_UP, name: 'crm' }])
    listConnections.mockResolvedValue([EXPIRED])
    const res = await dashboard()
    expect(res.statusCode).toBe(200)
    const panel = panelOf(res.body)
    expect(panel).toContain('Needs attention')
    expect(panel).toContain('Accounting is not answering')
    expect(panel).not.toContain('CRM is not answering')
    expect(panel).toContain('>Down<')
    expect(panel.indexOf('>Down<')).toBeLessThan(panel.indexOf('Accounting is not answering'))
    expect(panel.indexOf('Accounting is not answering')).toBeLessThan(panel.indexOf('Acme Books'))
  })

  it('offers an admin the System page; an operator a note saying so; nobody a Clear', async () => {
    getVerticals.mockResolvedValue([ACCOUNTING_DOWN])
    const admin = panelOf((await dashboard('admin')).body)
    expect(admin).toContain('href="/settings/system"')
    expect(admin).toContain('aria-label="Open System page: Accounting vertical"')
    // The one diagnostic the health check produced, in the row itself.
    expect(admin).toContain('(connect ECONNREFUSED)')
    expect(admin).not.toContain('vertical:down:accounting')
    expect(admin).not.toContain('Clear all')
    expect(admin).not.toContain('Needs an admin')
    // /settings/system is admin-only: an operator is not sent to a 403, and
    // is told who can act rather than shown an empty cell.
    const operator = panelOf((await dashboard('operator')).body)
    expect(operator).toContain('Accounting is not answering')
    expect(operator).not.toContain('href="/settings/system"')
    expect(operator).not.toContain('Open System page')
    expect(operator).toContain('Needs an admin')
    expect(operator).not.toContain('vertical:down:accounting')
  })

  it('does not tell a viewer that clearing needs the operator role when no role could clear the row', async () => {
    getVerticals.mockResolvedValue([ACCOUNTING_DOWN])
    const viewer = panelOf((await dashboard('viewer')).body)
    expect(viewer).toContain('Accounting is not answering')
    expect(viewer).not.toContain('clearing needs the operator role')
    // ...but does once a row exists that an operator could clear.
    listConnections.mockResolvedValue([EXPIRED])
    expect(panelOf((await dashboard('viewer')).body)).toContain(
      'Read-only — clearing needs the operator role.',
    )
  })

  it('says its connections could not be checked, rather than implying none are expired', async () => {
    // admin-api's aggregator answers `[]` for a backend that is down; the
    // page must not read that as "no expired connections". Nor may it claim
    // none are listed: /health and the connection list are separate requests,
    // and the second can succeed while the first timed out.
    getVerticals.mockResolvedValue([ACCOUNTING_DOWN, { ...ACCOUNTING_UP, name: 'crm' }])
    listConnections.mockResolvedValue([EXPIRED])
    const res = await dashboard()
    expect(res.body).toContain(
      "Couldn't check Accounting connections — that vertical is down, so its connections and syncs may be missing from this list.",
    )
    expect(res.body).not.toContain('none of its connections')
  })

  it('pluralises the line when more than one vertical is down', async () => {
    getVerticals.mockResolvedValue([
      ACCOUNTING_DOWN,
      { ...ACCOUNTING_DOWN, name: 'crm' },
      { ...ACCOUNTING_UP, name: 'payments' },
    ])
    const res = await dashboard()
    expect(res.body).toContain(
      "Couldn't check Accounting and CRM connections — those verticals are down, so their connections and syncs may be missing from this list.",
    )
  })

  it('collapses to one row when every vertical is down: that is the integration server, not nine outages', async () => {
    // Aggregator.healthCheck makes one /health call and marks every vertical
    // down together, so this is the only shape a real outage ever takes.
    getVerticals.mockResolvedValue([
      ACCOUNTING_DOWN,
      { ...ACCOUNTING_DOWN, name: 'crm' },
      { ...ACCOUNTING_DOWN, name: 'payments' },
    ])
    const res = await dashboard()
    const panel = panelOf(res.body)
    expect(panel).toContain('Integration server')
    expect(panel).toContain('is not answering')
    expect(panel).not.toContain('Accounting is not answering')
    expect(panel).not.toContain('CRM is not answering')
    expect(panel.match(/>Down</g)).toHaveLength(1)
    expect(panel).toContain('aria-label="Open System page: Integration server"')
    expect(panel).toContain(
      "Couldn't check any connections — the integration server is not answering",
    )
    expect(panel).not.toContain('Accounting, CRM and Payments')
    // The badge counts one row, not three.
    expect(panel).toContain('<span class="badge badge--warning">1</span>')
  })

  it('refuses a clear that names the key, before admin-api is asked', async () => {
    getVerticals.mockResolvedValue([ACCOUNTING_DOWN])
    for (const key of ['vertical:down:accounting', 'vertical:down:all']) {
      const res = await clear('admin', [{ key, fingerprint: '' }])
      expect(res.statusCode, key).toBe(400)
    }
    expect(dismissDashboardTasks).not.toHaveBeenCalled()
  })
})

describe('a failing refresh is an early warning', () => {
  it('lists a still-working connection whose last refresh failed, with its expiry', async () => {
    listConnections.mockResolvedValue([REFRESH_FAILING])
    const res = await dashboard()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Needs attention')
    expect(res.body).toContain('Warn Co')
    expect(res.body).toContain('Refresh failing')
    expect(res.body).toContain('last token refresh failed')
    expect(res.body).toContain('2026-09-06 00:00 UTC')
  })

  it('links everyone to the connection, and an operator to a new Connect Link and a Clear', async () => {
    listConnections.mockResolvedValue([REFRESH_FAILING])
    const viewer = await dashboard('viewer')
    expect(viewer.body).toContain('href="/connections/accounting/conn-warn-1"')
    expect(viewer.body).not.toContain('Mint Connect Link')
    expect(viewer.body).not.toContain('refresh:failing:conn-warn-1')
    const operator = await dashboard('operator')
    expect(operator.body).toContain('href="/connections/accounting/conn-warn-1"')
    expect(operator.body).toContain('Mint Connect Link')
    expect(operator.body).toContain('aria-label="Clear: Fortnox Warn Co"')
    expect(operator.body).toContain(
      `value="${JSON.stringify([{ key: 'refresh:failing:conn-warn-1', fingerprint: FP.refresh }]).replace(/"/g, '&#34;')}"`,
    )
  })

  it('clears through admin-api with the fingerprint of the expiry, which a failed retry does not move', async () => {
    listConnections.mockResolvedValue([REFRESH_FAILING])
    const res = await clear('operator', [
      { key: 'refresh:failing:conn-warn-1', fingerprint: FP.refresh },
    ])
    expect(res.statusCode).toBe(302)
    expect(dismissDashboardTasks).toHaveBeenCalledWith('jwt', [
      { key: 'refresh:failing:conn-warn-1', fingerprint: FP.refresh },
    ])
  })

  it('keeps a clear through a failed retry, which moves only lastRefreshAt', async () => {
    // The keep-alive worker retries every tick and stamps `lastRefreshAt` on
    // each failure; a clear keyed on that would last one tick.
    listConnections.mockResolvedValue([
      { ...REFRESH_FAILING, lastRefreshAt: '2026-09-05T11:15:00.000Z' },
    ])
    listDashboardDismissals.mockResolvedValue([
      { key: 'refresh:failing:conn-warn-1', fingerprint: FP.refresh, by: 'u2', createdAt: 0 },
    ])
    const res = await dashboard('operator')
    expect(res.body).not.toContain('last token refresh failed')
  })

  it('hides the cleared row and offers Undo for it', async () => {
    listConnections.mockResolvedValue([REFRESH_FAILING])
    listDashboardDismissals.mockResolvedValue([
      {
        key: 'refresh:failing:conn-warn-1',
        fingerprint: FP.refresh,
        by: 'u2',
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ])
    const res = await dashboard('operator')
    expect(res.body).not.toContain('last token refresh failed')
    expect(res.body).toContain('Cleared recently')
    expect(res.body).toContain('aria-label="Undo clear: Fortnox Warn Co"')
    const undo = await post('/dashboard/tasks/undismiss', 'operator', {
      key: 'refresh:failing:conn-warn-1',
    })
    expect(undo.statusCode).toBe(302)
    expect(undismissDashboardTask).toHaveBeenCalledWith('jwt', 'refresh:failing:conn-warn-1')
  })
})

describe('an outage is not emptiness', () => {
  it('says the sync-job check did not run when the read fails', async () => {
    listSyncJobs.mockRejectedValue(upstream(503, 'Service Unavailable'))
    const res = await dashboard()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Needs attention')
    expect(res.body).toContain('check sync jobs')
    expect(res.body).toContain('href="/sync-jobs"')
  })

  it('treats a 404 as a deployment with no sync engine: no line, no panel', async () => {
    listSyncJobs.mockRejectedValue(upstream(404, 'Not Found'))
    const res = await dashboard()
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('check sync jobs')
    expect(res.body).not.toContain('Needs attention')
  })

  it('shows every row and warns when the clears could not be read', async () => {
    listConnections.mockResolvedValue([EXPIRED])
    listDashboardDismissals.mockRejectedValue(new Error('connect ECONNREFUSED'))
    const res = await dashboard()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Acme Books')
    expect(res.body).toContain('Cleared items may reappear')
  })
})

describe('a viewer reads the panel and changes nothing', () => {
  beforeEach(() => {
    listConnections.mockResolvedValue([EXPIRED, PLATFORM_ERROR])
    listSyncJobs.mockResolvedValue([{ ...FAILED_JOB, connectionId: 'conn-ok-1' }])
  })

  it('sees every row, with no actions and a line saying why', async () => {
    const res = await dashboard('viewer')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Acme Books')
    expect(res.body).toContain('Xero')
    expect(res.body).toContain('Read-only — clearing needs the operator role.')
    expect(res.body).not.toContain('/dashboard/tasks/dismiss')
    expect(res.body).not.toContain('Mint Connect Link')
    expect(res.body).not.toContain('Retry sync')
    expect(res.body).not.toContain('href="/platforms')
    // Read links stay: a viewer can open the job.
    expect(res.body).toContain('href="/sync-jobs/job-failed-1" data-modal')
  })

  it('is refused the clear before admin-api is asked', async () => {
    const res = await clear('viewer', [
      { key: 'conn:expired:conn-expired-1', fingerprint: FP.expired },
    ])
    expect(res.statusCode).toBe(403)
    expect(dismissDashboardTasks).not.toHaveBeenCalled()
  })

  it('is refused the undo before admin-api is asked', async () => {
    const res = await post('/dashboard/tasks/undismiss', 'viewer', {
      key: 'conn:expired:conn-expired-1',
    })
    expect(res.statusCode).toBe(403)
    expect(undismissDashboardTask).not.toHaveBeenCalled()
  })
})

describe('an operator clears connection and sync rows, not platform rows', () => {
  beforeEach(() => {
    listConnections.mockResolvedValue([EXPIRED, PLATFORM_ERROR, HEALTHY])
    listSyncJobs.mockResolvedValue([FAILED_JOB])
  })

  it('sees Clear on the rows it may clear and "Needs an admin" on the platform row', async () => {
    const res = await dashboard('operator')
    expect(res.body).toContain('aria-label="Clear: Fortnox Acme Books"')
    expect(res.body).toContain('aria-label="Clear: Fortnox Healthy Co"')
    expect(res.body).not.toContain('aria-label="Clear: Xero')
    expect(res.body).toContain('Needs an admin')
    expect(res.body).not.toContain('Fix credentials')
    expect(res.body).not.toContain('href="/platforms')
  })

  it('clears the row the form named, with the fingerprint the server derived', async () => {
    const res = await clear('operator', [
      { key: 'conn:expired:conn-expired-1', fingerprint: FP.expired },
    ])
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/')
    expect(dismissDashboardTasks).toHaveBeenCalledWith('jwt', [
      { key: 'conn:expired:conn-expired-1', fingerprint: FP.expired },
    ])
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'success' })
    expect(flashOf(fastify, res)[0]!.body).toContain('Cleared')
  })

  it('drops a row whose fingerprint moved since the page was loaded, rather than clearing what the operator never saw', async () => {
    // A stale page carries the old fingerprint. The condition has since
    // changed (re-expired, or a third connection joined a platform failure);
    // clearing it now would hide the newer breakage under the old decision.
    const res = await clear('operator', [
      { key: 'conn:expired:conn-expired-1', fingerprint: '2026-08-01T00:00:00.000Z' },
    ])
    expect(res.statusCode).toBe(302)
    expect(dismissDashboardTasks).not.toHaveBeenCalled()
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'warning' })
    expect(flashOf(fastify, res)[0]!.body).toContain('changed since it was loaded')
  })

  it('forwards only keys that are live tasks — the table is not a write sink', async () => {
    await clear('operator', [
      { key: 'conn:expired:conn-expired-1', fingerprint: FP.expired },
      { key: 'conn:expired:no-such-connection', fingerprint: '' },
      { key: 'sync:failed:job-failed-1', fingerprint: FP.sync },
    ])
    expect(dismissDashboardTasks).toHaveBeenCalledWith('jwt', [
      { key: 'conn:expired:conn-expired-1', fingerprint: FP.expired },
      { key: 'sync:failed:job-failed-1', fingerprint: FP.sync },
    ])
  })

  it('drops a platform key from an operator batch rather than 403ing the whole clear', async () => {
    await clear('operator', [
      { key: 'platform:creds:accounting/xero', fingerprint: FP.platform },
      { key: 'conn:expired:conn-expired-1', fingerprint: FP.expired },
    ])
    expect(dismissDashboardTasks).toHaveBeenCalledWith('jwt', [
      { key: 'conn:expired:conn-expired-1', fingerprint: FP.expired },
    ])
  })

  it('says so, and asks admin-api nothing, when nothing in the batch is live', async () => {
    const res = await clear('operator', [
      { key: 'platform:creds:accounting/xero', fingerprint: FP.platform },
    ])
    expect(res.statusCode).toBe(302)
    expect(dismissDashboardTasks).not.toHaveBeenCalled()
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'warning' })
  })

  it('refuses a malformed batch without asking admin-api', async () => {
    for (const items of [
      '{not json',
      JSON.stringify([{ key: 'conn:expired:conn-expired-1' }]),
      JSON.stringify([{ key: 'conn:expired:conn-expired-1', fingerprint: 7 }]),
    ]) {
      const res = await post('/dashboard/tasks/dismiss', 'operator', { items })
      expect(res.statusCode).toBe(400)
    }
    expect(dismissDashboardTasks).not.toHaveBeenCalled()
  })

  it('needs a CSRF token', async () => {
    const res = await post(
      '/dashboard/tasks/dismiss',
      'operator',
      { items: JSON.stringify([{ key: 'conn:expired:conn-expired-1', fingerprint: FP.expired }]) },
      false,
    )
    expect(res.statusCode).toBe(403)
    expect(dismissDashboardTasks).not.toHaveBeenCalled()
  })

  it('does not report a clear that failed upstream as done', async () => {
    dismissDashboardTasks.mockRejectedValue(upstream(500, 'boom'))
    const res = await clear('operator', [
      { key: 'conn:expired:conn-expired-1', fingerprint: FP.expired },
    ])
    expect(res.statusCode).not.toBe(302)
    expect(flashOf(fastify, res).some((f) => f.tone === 'success')).toBe(false)
  })
})

describe('an admin clears everything, including platform rows', () => {
  beforeEach(() => {
    listConnections.mockResolvedValue([EXPIRED, PLATFORM_ERROR])
  })

  it('sees a Clear on the platform row and can clear it', async () => {
    const page = await dashboard('admin')
    expect(page.body).toContain('aria-label="Clear: Xero credentials"')
    await clear('admin', [{ key: 'platform:creds:accounting/xero', fingerprint: FP.platform }])
    expect(dismissDashboardTasks).toHaveBeenCalledWith('jwt', [
      { key: 'platform:creds:accounting/xero', fingerprint: FP.platform },
    ])
  })

  it('offers Clear all, carrying every clearable row', async () => {
    const page = await dashboard('admin')
    expect(page.body).toContain('Clear all')
    const encoded = /name="items" value="([^"]+)"/g
    const batches = [...page.body.matchAll(encoded)].map((m) =>
      JSON.parse(m[1]!.replace(/&quot;/g, '"').replace(/&#34;/g, '"')),
    )
    const all = batches.find((b) => b.length === 2)
    expect(all).toEqual([
      { key: 'platform:creds:accounting/xero', fingerprint: '2026-09-02T00:00:00.000Z' },
      { key: 'conn:expired:conn-expired-1', fingerprint: '2026-09-01T00:00:00.000Z' },
    ])
  })
})

describe('a clear hides the row and can be undone', () => {
  const CLEARED = {
    key: 'conn:expired:conn-expired-1',
    fingerprint: '2026-09-01T00:00:00.000Z',
    by: 'u1',
    // ISO, as admin-api serialises every `createdAt` — not epoch ms.
    createdAt: new Date(Date.now() - 30_000).toISOString(),
  }

  beforeEach(() => {
    listConnections.mockResolvedValue([EXPIRED])
  })

  it('hides a cleared row and offers Undo for it', async () => {
    listDashboardDismissals.mockResolvedValue([CLEARED])
    const res = await dashboard('operator')
    expect(res.body).not.toContain('Mint Connect Link')
    expect(res.body).toContain('action="/dashboard/tasks/undismiss"')
    expect(res.body).toContain('name="key" value="conn:expired:conn-expired-1"')
    expect(res.body).toContain('aria-label="Undo clear: Fortnox Acme Books"')
    // Within the window is up to 15 minutes, on another replica by someone
    // else: "recently", never "just now".
    expect(res.body).toContain('Cleared recently: Fortnox <strong>Acme Books</strong>')
    expect(res.body).not.toContain('just now')
    expect(res.body).not.toContain('undo needs the')
  })

  it('tells a viewer which role the Undo needs, instead of a line with no button', async () => {
    listDashboardDismissals.mockResolvedValue([CLEARED])
    const res = await dashboard('viewer')
    expect(res.body).toContain('Cleared recently: Fortnox <strong>Acme Books</strong>')
    expect(res.body).toContain('undo needs the operator role')
    expect(res.body).not.toContain('/dashboard/tasks/undismiss')
  })

  it('tells an operator a cleared platform row needs an admin to undo', async () => {
    listConnections.mockResolvedValue([PLATFORM_ERROR])
    listDashboardDismissals.mockResolvedValue([
      { ...CLEARED, key: 'platform:creds:accounting/xero', fingerprint: FP.platform },
    ])
    const res = await dashboard('operator')
    expect(res.body).toContain('Cleared recently: Xero credentials')
    expect(res.body).toContain('undo needs the admin role')
    expect(res.body).not.toContain('/dashboard/tasks/undismiss')
  })

  it('treats an undo of a clear that is already gone as done, not as an error page', async () => {
    // Two operators press Undo on the same deployment-wide strip; the second
    // gets admin-api's 404. The row is visible either way, which is the point.
    undismissDashboardTask.mockRejectedValue(upstream(404, 'Dashboard task was not cleared'))
    const res = await post('/dashboard/tasks/undismiss', 'operator', { key: CLEARED.key })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/')
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'warning' })
    expect(flashOf(fastify, res)[0]!.body).toContain('Already restored')
  })

  it('does not offer Undo for an old clear', async () => {
    listDashboardDismissals.mockResolvedValue([
      { ...CLEARED, createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    ])
    const res = await dashboard('operator')
    expect(res.body).not.toContain('/dashboard/tasks/undismiss')
    expect(res.body).not.toContain('Needs attention')
  })

  it('re-surfaces a row whose fingerprint moved since the clear', async () => {
    listDashboardDismissals.mockResolvedValue([
      { ...CLEARED, fingerprint: '2026-08-01T00:00:00.000Z' },
    ])
    const res = await dashboard('operator')
    expect(res.body).toContain('Mint Connect Link')
  })

  it('undoes through admin-api and comes back to the dashboard', async () => {
    const res = await post('/dashboard/tasks/undismiss', 'operator', { key: CLEARED.key })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/')
    expect(undismissDashboardTask).toHaveBeenCalledWith('jwt', CLEARED.key)
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'success' })
  })

  it('refuses an operator the undo of a platform clear, before admin-api is asked', async () => {
    const res = await post('/dashboard/tasks/undismiss', 'operator', {
      key: 'platform:creds:accounting/xero',
    })
    expect(res.statusCode).toBe(403)
    expect(undismissDashboardTask).not.toHaveBeenCalled()
  })

  it('refuses a key that is not a task key', async () => {
    const res = await post('/dashboard/tasks/undismiss', 'operator', { key: 'settings.secret' })
    expect(res.statusCode).toBe(400)
    expect(undismissDashboardTask).not.toHaveBeenCalled()
  })

  it('does not report an undo that failed upstream as done', async () => {
    undismissDashboardTask.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/dashboard/tasks/undismiss', 'operator', { key: CLEARED.key })
    expect(res.statusCode).not.toBe(302)
  })
})

describe('row actions return to the dashboard', () => {
  it('Retry sync comes back to / when pressed from the panel', async () => {
    const res = await post('/connections/accounting/conn-ok-1/sync', 'operator', {
      returnTo: 'dashboard',
    })
    expect(createSyncJob).toHaveBeenCalledWith('jwt', 'conn-ok-1')
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/')
  })

  it('Delete comes back to / when pressed from the panel', async () => {
    const res = await post('/connections/accounting/conn-expired-1/delete', 'operator', {
      returnTo: 'dashboard',
    })
    expect(deleteConnection).toHaveBeenCalledWith('jwt', 'accounting', 'conn-expired-1')
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/')
  })

  it('Delete still returns to the list by default', async () => {
    const res = await post('/connections/accounting/conn-expired-1/delete', 'operator')
    expect(res.headers.location).toBe('/connections')
  })
})
