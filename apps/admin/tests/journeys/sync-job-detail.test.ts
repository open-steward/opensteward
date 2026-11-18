/**
 * Reading one sync job.
 *
 * The list answers "is anything stuck?" and nothing else: it truncates the
 * connection to eight characters, folds per-resource progress into one
 * "128 rows · 1/2 resources" total, and hides the failure reason in a `title`
 * attribute no one hovers. Everything the API already returns beyond that —
 * tenant, callback URL, when it started and finished, the top-level error, and
 * which resource actually failed — is what the detail page exists to show.
 *
 * These tests pin the server-rendered half. The detail page is a real page on
 * its own URL; the list marks its link `data-modal` and public/js/resource-modal.js
 * upgrades it to a dialog when JS is there. Whether the dialog opens is a
 * browser behaviour no journey test can reach — see resource-modal.test.ts.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockListSyncJobsPaged = vi.fn()
const mockGetDataStoreMetrics = vi.fn()
const mockGetSyncJob = vi.fn()
const mockCancelSyncJob = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listSyncJobsPaged: mockListSyncJobsPaged,
      getDataStoreMetrics: mockGetDataStoreMetrics,
      getSyncJob: mockGetSyncJob,
      cancelSyncJob: mockCancelSyncJob,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getCompanyInfo: async () => {
        return null
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'sync-job-detail-session-secret-long-enough'

const CONNECTION_ID = 'conn_9f8e7d6c-1111-4a2b-8c3d-000000000001'
const JOB = {
  id: 'job_7f3c1a2b4d5e6f70',
  vertical: 'accounting',
  connectionId: CONNECTION_ID,
  platform: 'fortnox',
  tenantId: 'acme',
  status: 'failed',
  progress: {
    invoices: { synced: 128, status: 'completed' },
    transactions: { synced: 4, status: 'failed', error: 'rate limited by fortnox' },
  },
  error: 'transactions: rate limited by fortnox',
  callbackUrl: 'https://app.acme.example/sync-callback',
  createdAt: '2026-01-15T09:30:00.000Z',
  startedAt: '2026-01-15T09:30:05.000Z',
  completedAt: '2026-01-15T09:31:35.000Z',
}
const DETAIL_URL = `/sync-jobs/${JOB.id}`
const CONNECTION_URL = `/connections/${JOB.vertical}/${JOB.connectionId}`

let fastify: FastifyInstance

function session(role: 'viewer' | 'operator' | 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }))
}
function csrf(c: string) {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}
function get(url: string, role: 'viewer' | 'operator' | 'admin' = 'admin') {
  return fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })
}
/** The table markup only, so a match in the metrics tile cannot pass for a cell. */
function tableOf(body: string) {
  return body.slice(body.indexOf('<table'), body.indexOf('</table>'))
}

beforeEach(async () => {
  mockListSyncJobsPaged.mockReset()
  mockGetDataStoreMetrics.mockReset()
  mockGetSyncJob.mockReset()
  mockCancelSyncJob.mockReset()
  mockListSyncJobsPaged.mockResolvedValue({
    data: [JOB],
    meta: { page: 1, limit: 50, total: 1 },
  })
  mockGetDataStoreMetrics.mockResolvedValue(null)
  mockGetSyncJob.mockResolvedValue(JOB)
  mockCancelSyncJob.mockResolvedValue(JOB)
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

describe('Journey: an operator scans the sync-job list', () => {
  it('leads every row with the full sync id, copyable, the way /connections does', async () => {
    const res = await get('/sync-jobs')
    expect(res.statusCode).toBe(200)
    const table = tableOf(res.body)
    // Far left, both in the header and in the row. The header row is now
    // rendered by _table-head.ejs from the route's TableSpec (Plan 3 Part E),
    // so it carries a class and `scope="col"` — but Sync id is still the FIRST
    // cell of it, which is what this assertion is about. `indexOf` on the
    // header row's own slice, not on the whole table, so a later mention of
    // the words cannot stand in for the column's position.
    const headerRow = table.match(/<tr class="table__headers[^"]*">([\s\S]*?)<\/tr>/)
    expect(headerRow).not.toBeNull()
    expect(headerRow![1]).toContain('Sync id')
    expect(headerRow![1].indexOf('Sync id')).toBeLessThan(headerRow![1].indexOf('Vertical'))
    const firstCell = table.slice(table.indexOf('<tbody>')).match(/<td[\s\S]*?<\/td>/)![0]
    expect(firstCell).toContain(JOB.id)
    // Full value, not the eight-character stub the connection column uses: the
    // id is what `GET /api/sync-jobs/{id}` and the cancel call both need.
    expect(firstCell).toContain('class="mono"')
    expect(firstCell).toMatch(/<button[^>]*data-id="job_7f3c1a2b4d5e6f70"/)
  })

  it('links the sync id at its own page, as a modal', async () => {
    const res = await get('/sync-jobs')
    expect(res.body).toContain(`href="${DETAIL_URL}"`)
    expect(res.body).toMatch(new RegExp(`<a[^>]*href="${DETAIL_URL}"[^>]*\\sdata-modal(\\s|=|>)`))
  })

  it('links the connection cell at that connection, as a modal', async () => {
    const res = await get('/sync-jobs')
    const table = tableOf(res.body)
    // The job carries both halves of the connection route — `vertical` and
    // `connectionId` — so the link is complete without a second lookup.
    expect(table).toContain(`href="${CONNECTION_URL}"`)
    expect(table).toMatch(new RegExp(`<a[^>]*href="${CONNECTION_URL}"[^>]*\\sdata-modal(\\s|=|>)`))
  })
})

describe('Journey: an operator opens one sync job', () => {
  it('shows what the list had no room for', async () => {
    const res = await get(DETAIL_URL)
    expect(res.statusCode).toBe(200)
    expect(mockGetSyncJob).toHaveBeenCalledWith('jwt', JOB.id)
    const body = res.body
    expect(body).toContain(JOB.id)
    expect(body).toContain(JOB.connectionId)
    expect(body).toContain('acme')
    expect(body).toContain('https://app.acme.example/sync-callback')
    // The failure reason, in full, instead of a `title` attribute.
    expect(body).toContain('transactions: rate limited by fortnox')
    // Per-resource progress, not the folded total.
    expect(body).toContain('invoices')
    expect(body).toContain('rate limited by fortnox')
    expect(body).toContain('128')
  })

  it('says how long the job ran', async () => {
    const res = await get(DETAIL_URL)
    // 09:30:05 → 09:31:35. The list shows only the created timestamp, so a job
    // that took an hour and one that took a second read identically there.
    expect(res.body).toContain('1m 30s')
  })

  it('links back to the connection it synced', async () => {
    const res = await get(DETAIL_URL)
    expect(res.body).toContain(`href="${CONNECTION_URL}"`)
  })

  it('renders a full page, not a fragment, so the URL stands on its own', async () => {
    const res = await get(DETAIL_URL)
    expect(res.body).toContain('<!DOCTYPE html>')
    expect(res.body).toContain('class="sidebar__link"')
    // The modal lifts this region out of the response; without it the script
    // falls back to navigating.
    expect(res.body).toContain('<main class="app-content">')
    const main = res.body.slice(res.body.indexOf('<main class="app-content">'))
    expect(main).toContain(JOB.id)
  })

  it('renders a job that has not started, where most of the page is null', async () => {
    // The commonest state on this page and the one every optional field is
    // null in: no start, no finish, no progress, no tenant, no callback. An EJS
    // template only fails at render time, so this is the branch worth pinning.
    mockGetSyncJob.mockResolvedValue({
      ...JOB,
      status: 'pending',
      tenantId: null,
      progress: null,
      error: null,
      callbackUrl: null,
      startedAt: null,
      completedAt: null,
    })
    const res = await get(DETAIL_URL)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Still queued')
    expect(res.body).toContain('No per-resource progress recorded yet')
    expect(res.body).not.toContain('Sync failed')
  })

  it('404s on an unknown id rather than rendering an empty page', async () => {
    mockGetSyncJob.mockResolvedValue(null)
    const res = await get('/sync-jobs/job_gone')
    expect(res.statusCode).toBe(404)
    expect(res.body).toContain('Sync job not found')
  })
})

describe('Journey: the new page changes nothing about who may do what', () => {
  it('lets a viewer read it', async () => {
    expect((await get(DETAIL_URL, 'viewer')).statusCode).toBe(200)
  })

  it('sends an unauthenticated visitor to the login page', async () => {
    const res = await fastify.inject({ method: 'GET', url: DETAIL_URL })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/login')
  })

  it('offers a viewer no cancel button on a cancelable job', async () => {
    mockGetSyncJob.mockResolvedValue({ ...JOB, status: 'running', completedAt: null, error: null })
    const res = await get(DETAIL_URL, 'viewer')
    // Status first: without it this assertion also passes on a 404 page, which
    // contains no cancel form either and would prove nothing.
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(`/sync-jobs/${JOB.id}/cancel`)
  })

  it('offers an operator one, with its CSRF token', async () => {
    mockGetSyncJob.mockResolvedValue({ ...JOB, status: 'running', completedAt: null, error: null })
    const res = await get(DETAIL_URL, 'operator')
    expect(res.body).toContain(`action="/sync-jobs/${JOB.id}/cancel"`)
    expect(res.body).toMatch(/<input type="hidden" name="_csrf" value="[0-9a-f]{32}">/)
  })

  it('still refuses a viewer the cancel itself', async () => {
    const c = session('viewer')
    const res = await fastify.inject({
      method: 'POST',
      url: `${DETAIL_URL}/cancel`,
      cookies: { session: c },
      payload: { _csrf: csrf(c) },
    })
    expect(res.statusCode).toBe(403)
    expect(mockCancelSyncJob).not.toHaveBeenCalled()
  })
})

describe('Journey: the filter finds nothing', () => {
  // The empty state must guard its "match this filter" copy and its
  // Clear-filters action on whether a filter is ACTIVE, not on whether the
  // list came back empty — narrowing to zero must not read as "No sync jobs
  // yet" with no way back out, on a page whose whole job is narrowing a long
  // list.
  //
  // These two cases now reach that guard through `tableState.filters` (Plan 3
  // Part E replaced this page's hand-rolled `filterVertical`/`filterStatus`
  // with the shared TableSpec), and the URL below is deliberately the OLD
  // `?status=` rather than `?f_status=`: that is what pins the Status column's
  // `legacy` alias, i.e. that a bookmark made before the conversion still
  // narrows the list AND still reads as filtered. sync-jobs-sort-filter.test.ts
  // covers the new param names and the per-filter copy.
  beforeEach(() => {
    mockListSyncJobsPaged.mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0 } })
  })

  it('says the filter is what emptied the page, and offers a way out', async () => {
    const res = await get('/sync-jobs?status=failed')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('No sync jobs match this filter')
    expect(res.body).toMatch(/empty-state__actions[\s\S]*?Clear filters/)
  })

  it('still reads as "yet" when nothing is filtered', async () => {
    const res = await get('/sync-jobs')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('No sync jobs yet')
    expect(res.body).not.toContain('Clear filters')
  })
})
