/**
 * Vitally list paging: 1-based `page` + caller's `limit` → the `from` cursor
 * chain and `limit`, with `hasMore` from the body's `next`.
 *
 * From each resource's REST reference (users, accounts, conversations,
 * organizations, notes, tasks), e.g. https://docs.vitally.io/en/articles/9880855-rest-api-tasks:
 *
 *   "(optional) The number of items to return. The max/default is 100 ...
 *    (optional) The cursor returned from a previous request ...
 *    https://{subdomain}.rest.vitally.io/resources/tasks?limit=10&from=cursor"
 *
 * and the overview (9880649): "The next property will be null when the end is
 * reached and there are no more pages." The overview also says to send
 * `sortBy=createdAt` on every request of a crawl, `from` requests included.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { VitallyAdapter } from '../../../../../../src/verticals/crm/adapters/vitally/index'

const CREDS = { accessToken: 'vitally_test', extra: { subdomain: 'acme' } }
/** Documented: "The max/default is 100". */
const MAX = 100

type Method =
  'listContacts' | 'listCompanies' | 'listDeals' | 'listPipelines' | 'listNotes' | 'listActivities'

const CASES: { method: Method; path: string }[] = [
  { method: 'listContacts', path: '/resources/users' },
  { method: 'listCompanies', path: '/resources/accounts' },
  { method: 'listDeals', path: '/resources/conversations' },
  { method: 'listPipelines', path: '/resources/organizations' },
  { method: 'listNotes', path: '/resources/notes' },
  { method: 'listActivities', path: '/resources/tasks' },
]

const DOCUMENTED = new Set(['from', 'limit', 'sortBy'])

/**
 * A fake Vitally that honours ONLY `from` (an opaque cursor from a previous
 * `next`), `limit` (1..100, 100 when absent) and `sortBy`. Cursors are bound
 * to the token, host and path that minted them. Anything else is refused.
 */
function fakeVitally(total: number) {
  const sent: { token: string; url: URL }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const token = new Headers(init?.headers).get('authorization') ?? ''
    if ((init?.method ?? 'GET') !== 'GET' || !CASES.some((c) => c.path === url.pathname)) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    for (const k of url.searchParams.keys()) {
      if (!DOCUMENTED.has(k)) return new Response(`unknown param ${k}`, { status: 400 })
    }
    sent.push({ token, url })
    const rawLimit = url.searchParams.get('limit')
    const limit = rawLimit === null ? MAX : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      return new Response(`limit must be 1..${MAX}`, { status: 400 })
    }
    const from = url.searchParams.get('from')
    let offset = 0
    if (from !== null) {
      const [ct, ch, cp, co] = Buffer.from(from, 'base64').toString().split('|')
      if (ct !== token || ch !== url.host || cp !== url.pathname) {
        return new Response('cursor from another connection or collection', { status: 400 })
      }
      offset = Number(co)
    }
    const results = Array.from(
      { length: Math.max(0, Math.min(limit, total - offset)) },
      (_, i) => ({
        id: String(offset + i + 1),
        name: `r${offset + i + 1}`,
        note: 'n',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    )
    const end = offset + limit
    const next =
      end < total
        ? Buffer.from(`${token}|${url.host}|${url.pathname}|${end}`).toString('base64')
        : null
    return new Response(JSON.stringify({ results, next }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { sent }
}

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => String(from + i))

async function call(
  method: Method,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<{ id: string }[]> {
  return (await new VitallyAdapter()[method](creds, params)) as { id: string }[]
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('vitally $method paging', ({ method, path }) => {
  it('pages 1..3 of 2L+1 rows return every id once, in order, with exact hasMore', async () => {
    const L = 5
    const { sent } = fakeVitally(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(sent.every((s) => s.url.pathname === path)).toBe(true)
    expect(sent.every((s) => s.url.searchParams.get('limit') === String(L))).toBe(true)
    expect(sent.every((s) => s.url.searchParams.get('sortBy') === 'createdAt')).toBe(true)
  })

  it('the page-2 request carries the `from` cursor from `next`', async () => {
    const { sent } = fakeVitally(11)
    await call(method, withPageSink({ page: 1, limit: 5 }))
    await call(method, withPageSink({ page: 2, limit: 5 }))
    expect(sent).toHaveLength(2)
    expect(sent[0]!.url.searchParams.get('from')).toBeNull()
    expect(sent[1]!.url.searchParams.get('from')).toBe(
      Buffer.from(`${sent[0]!.token}|${sent[0]!.url.host}|${path}|5`).toString('base64'),
    )
  })

  it('page 2 cold walks from page 1', async () => {
    fakeVitally(11)
    expect((await call(method, withPageSink({ page: 2, limit: 5 }))).map((r) => r.id)).toEqual(
      ids(6, 5),
    )
  })

  it('a limit above 100 is clamped and still serves every row', async () => {
    const total = 2 * MAX + 1
    const { sent } = fakeVitally(total)
    const seen: string[] = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: 250 })
      seen.push(...(await call(method, params)).map((r) => r.id))
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, total))
    expect(sent.every((s) => s.url.searchParams.get('limit') === String(MAX))).toBe(true)
  })

  it('no limit sends the documented default of 100 and reports it', async () => {
    const { sent } = fakeVitally(5)
    const params = withPageSink({ page: 1 })
    await call(method, params)
    expect(sent.map((s) => s.url.searchParams.get('limit'))).toEqual(['100'])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pageSize: 100 })
  })

  it('the API path (parseListQuery → listPage) reports meta.hasMore', async () => {
    fakeVitally(11)
    const p1 = parseListQuery({ page: '1', limit: '5' })
    const env1 = listPage(await call(method, p1), p1, 'vitally')
    expect(env1.data).toHaveLength(5)
    expect(env1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '5' })
    const env3 = listPage(await call(method, p3), p3, 'vitally')
    expect(env3.data.map((r) => r.id)).toEqual(['11'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('a fractional limit is floored before it is sent', async () => {
    const { sent } = fakeVitally(20)
    const params = withPageSink({ page: 1, limit: 7.9 })
    expect(await call(method, params)).toHaveLength(7)
    expect(sent.map((s) => s.url.searchParams.get('limit'))).toEqual(['7'])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 7 })
  })

  it('a zero limit falls back to the documented default instead of sending 0', async () => {
    const { sent } = fakeVitally(5)
    const params = withPageSink({ page: 1, limit: 0 })
    await call(method, params)
    expect(sent.map((s) => s.url.searchParams.get('limit'))).toEqual(['100'])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pageSize: 100 })
  })

  it('a full last page reports hasMore false on the API path', async () => {
    fakeVitally(10)
    const p2 = parseListQuery({ page: '2', limit: '5' })
    const env = listPage(await call(method, p2), p2, 'vitally')
    expect(env.data).toHaveLength(5)
    expect(env.meta.hasMore).toBe(false)
  })
})

describe('vitally pager keys', () => {
  it('a new limit mid-walk starts its own chain', async () => {
    fakeVitally(40)
    await call('listContacts', withPageSink({ page: 1, limit: 5 }))
    expect(
      (await call('listContacts', withPageSink({ page: 2, limit: 10 }))).map((r) => r.id),
    ).toEqual(ids(11, 10))
  })

  it('each collection keeps its own cursor chain', async () => {
    fakeVitally(20)
    await call('listContacts', withPageSink({ page: 1, limit: 5 }))
    await call('listContacts', withPageSink({ page: 2, limit: 5 }))
    for (const { method } of CASES.slice(1)) {
      expect((await call(method, withPageSink({ page: 2, limit: 5 }))).map((r) => r.id)).toEqual(
        ids(6, 5),
      )
    }
  })

  it('each connection keeps its own cursor chain, even on the shared EU host', async () => {
    const { sent } = fakeVitally(20)
    const eu = (token: string) => ({ accessToken: token, extra: { region: 'eu' } })
    await call('listContacts', withPageSink({ page: 1, limit: 5 }), eu('key_a'))
    await call('listContacts', withPageSink({ page: 2, limit: 5 }), eu('key_a'))
    const b = await call('listContacts', withPageSink({ page: 2, limit: 5 }), eu('key_b'))
    expect(b.map((r) => r.id)).toEqual(ids(6, 5))
    const tokenB = sent[sent.length - 1]!.token
    expect(sent.filter((s) => s.token === tokenB)).toHaveLength(2)
  })

  it('one key on two US subdomains keeps a cursor chain per host', async () => {
    const { sent } = fakeVitally(20)
    const us = (subdomain: string) => ({ accessToken: 'shared_key', extra: { subdomain } })
    await call('listContacts', withPageSink({ page: 1, limit: 5 }), us('acme'))
    await call('listContacts', withPageSink({ page: 2, limit: 5 }), us('acme'))
    const globex = await call('listContacts', withPageSink({ page: 2, limit: 5 }), us('globex'))
    expect(globex.map((r) => r.id)).toEqual(ids(6, 5))
    expect(sent.filter((s) => s.url.host.startsWith('globex.'))).toHaveLength(2)
  })

  it('the adapter declares the documented maximum', () => {
    expect(new VitallyAdapter().capabilities?.maxPageSize).toBe(MAX)
  })
})
