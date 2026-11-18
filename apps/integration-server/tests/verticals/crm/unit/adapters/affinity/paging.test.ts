/**
 * Affinity v2 list paging: 1-based `page` + caller's `limit` → the v2 `cursor`
 * chain and `limit`, with `hasMore` from `pagination.nextUrl`.
 *
 * From each endpoint's v2 reference (2026-09-17):
 *   persons/get-all-persons.md, companies/get-all-companies.md,
 *   opportunities/get-all-opportunities.md,
 *   lists/get-metadata-on-all-lists.md, notes/get-all-notes.md
 *
 *   "description: Cursor for the next or previous page ... description: Number
 *    of items to include in the page ... maximum: 100 ... for the `nextUrl` ...
 *    property in the `pagination` portion of an API response, and use it for
 *    your"
 *
 * Notes default to a `limit` of 20, the others to 100, so the adapter must
 * always send `limit`. listActivities merges four v2 lists through the row
 * pager and is tested in interactions.test.ts.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { AffinityAdapter } from '../../../../../../src/verticals/crm/adapters/affinity/index'

const CREDS = { accessToken: 'affinity_test' }
/** Documented: "maximum: 100". */
const MAX = 100

type Method = 'listContacts' | 'listCompanies' | 'listDeals' | 'listPipelines' | 'listNotes'

const CASES: { method: Method; path: string; defaultLimit: number }[] = [
  { method: 'listContacts', path: '/v2/persons', defaultLimit: 100 },
  { method: 'listCompanies', path: '/v2/companies', defaultLimit: 100 },
  { method: 'listDeals', path: '/v2/opportunities', defaultLimit: 100 },
  { method: 'listPipelines', path: '/v2/lists', defaultLimit: 100 },
  { method: 'listNotes', path: '/v2/notes', defaultLimit: 20 },
]

const DOCUMENTED = new Set(['cursor', 'limit'])

/**
 * A fake Affinity v2 that honours ONLY `cursor` (opaque, from a previous
 * `pagination.nextUrl`) and `limit` (1..100, the endpoint's default when
 * absent). Anything else in the query string is refused.
 */
function fakeAffinity(path: string, total: number, defaultLimit: number) {
  const rows = Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    name: `r${i + 1}`,
    content: `c${i + 1}`,
    type: 'person',
  }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== path) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    for (const k of url.searchParams.keys()) {
      if (!DOCUMENTED.has(k)) return new Response(`unknown param ${k}`, { status: 400 })
    }
    sent.push(url)
    const rawLimit = url.searchParams.get('limit')
    const limit = rawLimit === null ? defaultLimit : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      return new Response(`limit must be 1..${MAX}`, { status: 400 })
    }
    const cursor = url.searchParams.get('cursor')
    const offset = cursor === null ? 0 : Number(Buffer.from(cursor, 'base64url').toString())
    const data = rows.slice(offset, offset + limit)
    const end = offset + limit
    const nextUrl =
      end < total
        ? `https://api.affinity.co${path}?cursor=${Buffer.from(String(end)).toString('base64url')}&limit=${limit}`
        : null
    return new Response(JSON.stringify({ data, pagination: { prevUrl: null, nextUrl } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { sent }
}

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => String(from + i))

async function call(method: Method, params: QueryParams): Promise<{ id: string }[]> {
  return (await new AffinityAdapter()[method](CREDS, params)) as { id: string }[]
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('affinity $method paging', ({ method, path, defaultLimit }) => {
  it('pages 1..3 of 2L+1 rows return every id once, in order, with exact hasMore', async () => {
    const L = 5
    const { sent } = fakeAffinity(path, 2 * L + 1, defaultLimit)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(sent.every((u) => u.searchParams.get('limit') === String(L))).toBe(true)
  })

  it('the page-2 request carries the cursor from nextUrl', async () => {
    const { sent } = fakeAffinity(path, 11, defaultLimit)
    await call(method, withPageSink({ page: 1, limit: 5 }))
    await call(method, withPageSink({ page: 2, limit: 5 }))
    expect(sent).toHaveLength(2)
    expect(sent[0]!.searchParams.get('cursor')).toBeNull()
    expect(sent[1]!.searchParams.get('cursor')).toBe(Buffer.from('5').toString('base64url'))
  })

  it('page 2 cold walks from page 1', async () => {
    fakeAffinity(path, 11, defaultLimit)
    expect((await call(method, withPageSink({ page: 2, limit: 5 }))).map((r) => r.id)).toEqual(
      ids(6, 5),
    )
  })

  it('a limit above 100 is clamped and still serves every row', async () => {
    const total = 2 * MAX + 1
    const { sent } = fakeAffinity(path, total, defaultLimit)
    const seen: string[] = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: 250 })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, total))
    expect(sent.every((u) => u.searchParams.get('limit') === String(MAX))).toBe(true)
  })

  it('the API path (parseListQuery → listPage) reports meta.hasMore', async () => {
    fakeAffinity(path, 11, defaultLimit)
    const p1 = parseListQuery({ page: '1', limit: '5' })
    const env1 = listPage(await call(method, p1), p1, 'affinity')
    expect(env1.data).toHaveLength(5)
    expect(env1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '5' })
    const env3 = listPage(await call(method, p3), p3, 'affinity')
    expect(env3.data.map((r) => r.id)).toEqual(['11'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('a full last page reports hasMore false on the API path', async () => {
    fakeAffinity(path, 10, defaultLimit)
    const p2 = parseListQuery({ page: '2', limit: '5' })
    const env = listPage(await call(method, p2), p2, 'affinity')
    expect(env.data).toHaveLength(5)
    expect(env.meta.hasMore).toBe(false)
  })
})

/**
 * A fake Affinity v2 serving every CASES path at once whose cursors are bound
 * to the token and path that minted them: replaying a cursor on another
 * connection or collection is a 400, as it would be upstream.
 */
function strictAffinity(total: number) {
  const sent: { token: string; url: URL }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const token = new Headers(init?.headers).get('authorization') ?? ''
    const known = CASES.find((c) => c.path === url.pathname)
    if (!known) return new Response(`unexpected ${url.pathname}`, { status: 404 })
    sent.push({ token, url })
    const rawLimit = url.searchParams.get('limit')
    const limit = rawLimit === null ? known.defaultLimit : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      return new Response(`limit must be 1..${MAX}`, { status: 400 })
    }
    const cursor = url.searchParams.get('cursor')
    let offset = 0
    if (cursor !== null) {
      const [ct, cp, co] = Buffer.from(cursor, 'base64url').toString().split('|')
      if (ct !== token || cp !== url.pathname) {
        return new Response('cursor from another connection or collection', { status: 400 })
      }
      offset = Number(co)
    }
    const data = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
      id: offset + i + 1,
      name: `r${offset + i + 1}`,
      content: 'c',
      type: 'person',
    }))
    const end = offset + limit
    const nextUrl =
      end < total
        ? `https://api.affinity.co${url.pathname}?cursor=${Buffer.from(`${token}|${url.pathname}|${end}`).toString('base64url')}`
        : null
    return new Response(JSON.stringify({ data, pagination: { prevUrl: null, nextUrl } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { sent }
}

describe('affinity pager keys and sizing', () => {
  it.each(CASES)(
    '$method: a new limit mid-walk starts its own chain (page 2 at 10 after page 1 at 5)',
    async ({ method }) => {
      strictAffinity(40)
      await call(method, withPageSink({ page: 1, limit: 5 }))
      expect((await call(method, withPageSink({ page: 2, limit: 10 }))).map((r) => r.id)).toEqual(
        ids(11, 10),
      )
    },
  )

  it('each collection keeps its own cursor chain', async () => {
    strictAffinity(20)
    await call('listContacts', withPageSink({ page: 1, limit: 5 }))
    await call('listContacts', withPageSink({ page: 2, limit: 5 }))
    for (const { method } of CASES.slice(1)) {
      expect((await call(method, withPageSink({ page: 2, limit: 5 }))).map((r) => r.id)).toEqual(
        ids(6, 5),
      )
    }
  })

  it('each connection keeps its own cursor chain', async () => {
    const { sent } = strictAffinity(20)
    const a = new AffinityAdapter()
    await a.listContacts({ accessToken: 'token_a' }, withPageSink({ page: 1, limit: 5 }))
    await a.listContacts({ accessToken: 'token_a' }, withPageSink({ page: 2, limit: 5 }))
    const b = await a.listContacts({ accessToken: 'token_b' }, withPageSink({ page: 2, limit: 5 }))
    expect(b.map((r) => r.id)).toEqual(ids(6, 5))
    expect(sent.filter((s) => s.token === 'Bearer token_b')).toHaveLength(2)
  })

  it.each(CASES)('$method: no limit sends the documented maximum of 100', async ({ method }) => {
    const { sent } = strictAffinity(5)
    const params = withPageSink({ page: 1 })
    await call(method, params)
    expect(sent.map((s) => s.url.searchParams.get('limit'))).toEqual(['100'])
    expect(readUpstreamPage(params)?.pageSize).toBe(100)
  })

  it.each(CASES)('$method: a fractional limit is floored before it is sent', async ({ method }) => {
    const { sent } = strictAffinity(10)
    const rows = await call(method, withPageSink({ page: 1, limit: 2.5 }))
    expect(rows).toHaveLength(2)
    expect(sent.map((s) => s.url.searchParams.get('limit'))).toEqual(['2'])
  })

  it.each(CASES)('$method: reports the page size actually sent', async ({ method }) => {
    strictAffinity(300)
    const clamped = withPageSink({ page: 1, limit: 250 })
    await call(method, clamped)
    expect(readUpstreamPage(clamped)).toMatchObject({ hasMore: true, pageSize: 100 })
    _resetCursorPager()
    const small = withPageSink({ page: 1, limit: 5 })
    await call(method, small)
    expect(readUpstreamPage(small)).toMatchObject({ hasMore: true, pageSize: 5 })
  })
})
