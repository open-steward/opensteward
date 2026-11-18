/**
 * actaSIGN signer / document / audit-trail lists.
 *
 * Source: the actaSIGN OpenAPI 3.0.3 document (info.version 3.64.0) served
 * at https://my.actasign.ch/api-docs/ (swagger-ui-init.js). Its servers list
 * "https://web.actasign.ch/api" as "Production service", and it has no list
 * operation for requests, tasks, assets or audit events:
 *
 * - GET /v2/requests/{requestUid} "Retrieve any request in the tenant"
 *   returns `RemoteCompactRequest` with `portfolioUid` and `steps[].tasks[]`.
 * - GET /v2/requests/{requestUid}/tasks/{taskUid} "Retrieve any task in the
 *   tenant" returns `RemoteTaskResponse` (recipients + lifecycle dates).
 * - GET /v2/portfolios/{portfolioUid} "Retrieve a portfolio with its assets".
 * - GET /requests/{request_uid}/protocol "Download request audit protocol PDF"
 *   is the only audit surface, and it answers `application/pdf`.
 *
 * None of these documents a paging parameter, so tasks and assets are paged
 * locally over the whole embedded array.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ActasignClient } from '../../../../../../src/verticals/docsign/adapters/actasign/client'
import { ActasignAdapter } from '../../../../../../src/verticals/docsign/adapters/actasign'
import { TASK_READ_CONCURRENCY } from '../../../../../../src/verticals/docsign/adapters/actasign/constants'

const CREDS = { accessToken: 'tok' } as Credentials
const adapter = new ActasignAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
const REQ = 'lq0kp480rgm1uiibo6ud1y83'
const PF = 'pf0kp480rgm1uiibo6ud1y83'
const PROD = 'https://web.actasign.ch/api'

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

const tuid = (i: number) => `task${i}`
const auid = (i: number) => `asset${i}`

/**
 * Fake of the three documented GETs. It answers only documented paths on the
 * production base, rejects any query parameter (none is documented), and
 * records every call.
 */
function mockApi(opts: { tasks?: number; assets?: number; stepsOf?: number } = {}) {
  const nTasks = opts.tasks ?? 0
  const nAssets = opts.assets ?? 0
  const per = opts.stepsOf ?? 2
  const steps: Array<{ stepUid: string; tasks: Array<Record<string, unknown>> }> = []
  for (let i = 0; i < nTasks; i++) {
    if (i % per === 0) steps.push({ stepUid: `step${steps.length}`, tasks: [] })
    steps[steps.length - 1]!.tasks.push({ taskUid: tuid(i), status: 'ready', taskType: 'ses' })
  }
  const calls: string[] = []
  const get = vi.spyOn(ActasignClient.prototype, 'get').mockImplementation(async function (
    this: ActasignClient,
    path: string,
    params?: Record<string, unknown>,
  ) {
    if (this.baseURL !== PROD) throw new Error(`wrong base ${this.baseURL}`)
    if (params !== undefined) throw new Error(`${path} documents no query params`)
    calls.push(path)
    if (path === `/v2/requests/${REQ}`) {
      return { requestUid: REQ, portfolioUid: PF, status: 'active', steps } as never
    }
    const m = /^\/v2\/requests\/([^/]+)\/tasks\/([^/]+)$/.exec(path)
    if (m && m[1] === REQ) {
      return {
        requestUid: REQ,
        taskUid: m[2],
        status: 'active',
        taskType: 'ses',
        recipients: { people: [{ email: `${m[2]}@example.com`, fullname: m[2] }] },
        assigned: '2026-01-02T10:00:00Z',
      } as never
    }
    if (path === `/v2/portfolios/${PF}`) {
      return {
        portfolioUid: PF,
        status: 'active',
        assets: Array.from({ length: nAssets }, (_, i) => ({
          assetUid: auid(i),
          context: 'document',
          filename: `f${i}.pdf`,
          mediaType: 'application/pdf',
        })),
      } as never
    }
    throw new Error(`undocumented path ${path}`)
  })
  return { get, calls }
}

const L = 2
const N = 2 * L + 1

describe('ActasignAdapter.listSigners reads tasks from GET /v2/requests/{requestUid}', () => {
  it('pages N = 2L+1 tasks across steps locally: every id once, exact hasMore', async () => {
    const { calls } = mockApi({ tasks: N })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, REQ, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => tuid(i)))
    expect(more).toEqual([true, true, false])
    // Detail is read only for the tasks on the served page.
    expect(calls.filter((c) => c.includes('/tasks/'))).toHaveLength(N)
  })

  it('reads recipients and status from the per-task endpoint', async () => {
    mockApi({ tasks: 1 })
    const [s] = await adapter.listSigners(CREDS, REQ, withPageSink({ page: 1, limit: 5 }))
    expect(s!.id).toBe(`${REQ}:task0`)
    expect(s!.email).toBe('task0@example.com')
    expect(s!.status).toBe('sent')
  })

  it('never calls the fabricated signing-processes path', async () => {
    const { calls } = mockApi({ tasks: 3 })
    await adapter.listSigners(CREDS, REQ, withPageSink({ page: 1, limit: 10 }))
    expect(calls.every((c) => c.startsWith('/v2/requests/'))).toBe(true)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockApi({ tasks: N })
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter.listSigners(CREDS, REQ, params), params, 'actasign')
    expect(env.data.map((r) => r.externalId)).toEqual([tuid(2), tuid(3)])
    expect(env.meta.hasMore).toBe(true)
  })

  it('getSigner reads back a listed id', async () => {
    mockApi({ tasks: 1 })
    const s = await adapter.getSigner(CREDS, `${REQ}:task0`)
    expect(s.externalId).toBe('task0')
    await expect(adapter.getSigner(CREDS, 'task0')).rejects.toThrow(/requestUid/)
  })
})

describe('ActasignAdapter.listDocuments reads assets from GET /v2/portfolios/{portfolioUid}', () => {
  it('pages N = 2L+1 assets locally: every id once, exact hasMore', async () => {
    const { calls } = mockApi({ assets: N })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listDocuments(CREDS, REQ, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => auid(i)))
    expect(more).toEqual([true, true, false])
    expect(new Set(calls)).toEqual(new Set([`/v2/requests/${REQ}`, `/v2/portfolios/${PF}`]))
  })

  it('order is the position in the portfolio', async () => {
    mockApi({ assets: N })
    const rows = await adapter.listDocuments(CREDS, REQ, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.order)).toEqual([2, 3])
  })

  it('getDocument reads back a listed id', async () => {
    mockApi({ assets: 3 })
    const d = await adapter.getDocument(CREDS, `${REQ}:${auid(1)}`)
    expect(d.name).toBe('f1.pdf')
    await expect(adapter.getDocument(CREDS, `${REQ}:nope`)).rejects.toThrow(/not found/)
  })
})

describe('ActasignAdapter audit trail is refused', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get } = mockApi()
    const post = vi.spyOn(ActasignClient.prototype, 'post')
    await expect(adapter.listAuditTrailEntries(CREDS, REQ, {})).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get } = mockApi()
    await expect(adapter.getAuditTrailEntry(CREDS, `${REQ}:0`)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('ActasignAdapter throws rather than invent, and sends only well-formed paths', () => {
  it('listSigners throws when the request lists a task without taskUid', async () => {
    const { calls } = mockApi({ tasks: 3 })
    vi.spyOn(ActasignClient.prototype, 'get').mockImplementationOnce(
      async () =>
        ({
          requestUid: REQ,
          portfolioUid: PF,
          steps: [{ stepUid: 'step0', tasks: [{ taskUid: tuid(0) }, {}] }],
        }) as never,
    )
    await expect(
      adapter.listSigners(CREDS, REQ, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/without taskUid/)
    expect(calls.filter((c) => c.includes('/tasks/'))).toHaveLength(0)
  })

  it('listDocuments and getDocument throw when the request has no portfolioUid, without calling /v2/portfolios', async () => {
    const { calls } = mockApi({ assets: 3 })
    const get = vi.spyOn(ActasignClient.prototype, 'get')
    get.mockImplementation(async (path: string) => {
      calls.push(path)
      if (path === `/v2/requests/${REQ}`) return { requestUid: REQ, steps: [] } as never
      throw new Error(`unexpected ${path}`)
    })
    await expect(
      adapter.listDocuments(CREDS, REQ, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/no portfolioUid/)
    await expect(adapter.getDocument(CREDS, `${REQ}:${auid(0)}`)).rejects.toThrow(/no portfolioUid/)
    expect(calls.some((c) => c.startsWith('/v2/portfolios/'))).toBe(false)
  })

  it('getSigner and getDocument reject an id with an extra segment and send nothing', async () => {
    const { get } = mockApi({ tasks: 1, assets: 1 })
    await expect(adapter.getSigner(CREDS, `${REQ}:task0:x`)).rejects.toThrow(/requestUid/)
    await expect(adapter.getDocument(CREDS, `${REQ}:${auid(0)}:x`)).rejects.toThrow(/requestUid/)
    expect(get).not.toHaveBeenCalled()
  })

  it('path-escapes the requestUid and taskUid', async () => {
    const paths: string[] = []
    vi.spyOn(ActasignClient.prototype, 'get').mockImplementation(async (path: string) => {
      paths.push(path)
      if (!path.includes('/tasks/')) {
        return { requestUid: 'a/b', steps: [{ tasks: [{ taskUid: 't?1' }] }] } as never
      }
      return {
        requestUid: 'a/b',
        taskUid: 't?1',
        taskType: 'ses',
        recipients: { people: [{ email: 'x@example.com' }] },
      } as never
    })
    await adapter.listSigners(CREDS, 'a/b', withPageSink({ page: 1, limit: 10 }))
    expect(paths).toEqual(['/v2/requests/a%2Fb', '/v2/requests/a%2Fb/tasks/t%3F1'])
  })
})

describe('ActasignAdapter.listSigners bounds its per-task reads', () => {
  it('never has more than TASK_READ_CONCURRENCY task reads in flight', async () => {
    const n = TASK_READ_CONCURRENCY * 3 + 1
    const steps = [{ tasks: Array.from({ length: n }, (_, i) => ({ taskUid: tuid(i) })) }]
    let inFlight = 0
    let peak = 0
    vi.spyOn(ActasignClient.prototype, 'get').mockImplementation(async (path: string) => {
      const m = /\/tasks\/(.+)$/.exec(path)
      if (!m) return { requestUid: REQ, steps } as never
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      return {
        requestUid: REQ,
        taskUid: m[1],
        taskType: 'ses',
        recipients: { people: [{ email: `${m[1]}@example.com` }] },
      } as never
    })
    const rows = await adapter.listSigners(CREDS, REQ, withPageSink({ page: 1, limit: n }))
    expect(rows.map((r) => r.externalId)).toEqual(Array.from({ length: n }, (_, i) => tuid(i)))
    expect(peak).toBe(TASK_READ_CONCURRENCY)
  })
})
