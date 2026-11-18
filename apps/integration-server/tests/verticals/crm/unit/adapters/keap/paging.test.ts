/**
 * Keap REST v2 list paging: 1-based `page` + caller's `limit` → the v2
 * `page_token` chain and `page_size`, with `hasMore` from `next_page_token`.
 *
 * From the v2 OpenAPI spec (https://crm.infusionsoft.com/app/v3/api-docs/V2),
 * operationIds listContacts, listCompanies, listOpportunities, listTasks:
 *
 *   {"name":"page_token","in":"query","description":"Page token", ...}
 *   {"name":"page_size","in":"query","description":"Total number of items to
 *    return per page", ... "maximum":1000,"minimum":0}
 *   "List…Response":{ ... "next_page_token":{"type":"string"}}
 *
 * The spec declares no `limit` parameter. listPipelines (a path v2 does not
 * have) and listNotes are out of scope here.
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
import { KeapAdapter } from '../../../../../../src/verticals/crm/adapters/keap/index'

const CREDS = { accessToken: 'keap_test', refreshToken: 'keap_refresh' }
/** Documented: page_size "maximum":1000. */
const MAX = 1000
const BASE = '/crm/rest/v2'

type Method = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities'

const CASES: { method: Method; path: string; key: string }[] = [
  { method: 'listContacts', path: `${BASE}/contacts`, key: 'contacts' },
  { method: 'listCompanies', path: `${BASE}/companies`, key: 'companies' },
  { method: 'listDeals', path: `${BASE}/opportunities`, key: 'opportunities' },
  { method: 'listActivities', path: `${BASE}/tasks`, key: 'tasks' },
]

/** `fields` is documented on all four lists; the adapter sends it on companies only. */
const DOCUMENTED = new Set(['page_token', 'page_size', 'fields'])

/**
 * listCompanies `fields`: "(Fields such as `notes`, `fax_number`, `address`,
 * `email_address`, `phone_number`, `update_time`, `create_time` and
 * `custom_fields` aren't included, by default.)"
 */
const COMPANY_OPT_IN = ['phone_number', 'create_time', 'update_time'] as const

/**
 * A fake Keap v2 that honours ONLY `page_token` (opaque, from a previous
 * `next_page_token`, bound to the token and path that minted it) and
 * `page_size` (0..1000). Anything else in the query string is refused.
 * `defaultSize` stands in for Keap's undocumented default page size.
 */
function fakeKeap(total: number, defaultSize = 50, emptyEndToken = false) {
  const sent: { token: string; url: URL }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const token = new Headers(init?.headers).get('authorization') ?? ''
    const known = CASES.find((c) => c.path === url.pathname)
    if ((init?.method ?? 'GET') !== 'GET' || !known) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    for (const k of url.searchParams.keys()) {
      if (!DOCUMENTED.has(k)) return new Response(`unknown param ${k}`, { status: 400 })
    }
    sent.push({ token, url })
    const rawSize = url.searchParams.get('page_size')
    const size = rawSize === null ? defaultSize : Number(rawSize)
    if (!Number.isInteger(size) || size < 0 || size > MAX) {
      return new Response(`page_size must be 0..${MAX}`, { status: 400 })
    }
    const pageToken = url.searchParams.get('page_token')
    let offset = 0
    if (pageToken !== null) {
      const [t, p, o] = Buffer.from(pageToken, 'base64url').toString().split('|')
      if (t !== token || p !== url.pathname) {
        return new Response('page_token from another connection or collection', { status: 400 })
      }
      offset = Number(o)
    }
    const fields = new Set((url.searchParams.get('fields') ?? '').split(',').filter(Boolean))
    const rows = Array.from({ length: Math.max(0, Math.min(size, total - offset)) }, (_, i) => {
      const id = offset + i + 1
      const row: Record<string, unknown> = {
        id,
        company_name: `c${id}`,
        opportunity_title: `o${id}`,
        title: `t${id}`,
      }
      if (known.key === 'companies') {
        const optIn: Record<(typeof COMPANY_OPT_IN)[number], unknown> = {
          phone_number: { number: `555-${id}`, type: 'MAIN' },
          create_time: '2024-01-01T00:00:00Z',
          update_time: '2024-02-01T00:00:00Z',
        }
        for (const k of COMPANY_OPT_IN) if (fields.has(k)) row[k] = optIn[k]
      }
      return row
    })
    const end = offset + size
    const body: Record<string, unknown> = { [known.key]: rows }
    if (end < total) {
      body['next_page_token'] = Buffer.from(`${token}|${url.pathname}|${end}`).toString('base64url')
    } else if (emptyEndToken) {
      body['next_page_token'] = ''
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { sent }
}

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => String(from + i))

async function call(method: Method, params: QueryParams): Promise<{ id: string }[]> {
  return (await new KeapAdapter()[method](CREDS, params)) as { id: string }[]
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('keap listCompanies fields', () => {
  it('asks for phone_number, create_time and update_time, which the list omits by default', async () => {
    const { sent } = fakeKeap(3)
    const out = await new KeapAdapter().listCompanies(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(sent).toHaveLength(1)
    const fields = sent[0]!.url.searchParams.get('fields')?.split(',') ?? []
    expect(fields).toEqual(expect.arrayContaining([...COMPANY_OPT_IN]))
    expect(out[0]).toMatchObject({
      id: '1',
      phone: '555-1',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-02-01T00:00:00Z',
    })
  })
})

describe.each(CASES)('keap $method paging', ({ method, path }) => {
  it('pages 1..3 of 2L+1 rows return every id once, in order, with exact hasMore', async () => {
    const L = 5
    const { sent } = fakeKeap(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(sent).toHaveLength(3)
    expect(sent.every((s) => s.url.pathname === path)).toBe(true)
    expect(sent.every((s) => s.url.searchParams.get('page_size') === String(L))).toBe(true)
  })

  it('the page-2 request carries page_token from next_page_token', async () => {
    const { sent } = fakeKeap(11)
    await call(method, withPageSink({ page: 1, limit: 5 }))
    await call(method, withPageSink({ page: 2, limit: 5 }))
    expect(sent).toHaveLength(2)
    expect(sent[0]!.url.searchParams.get('page_token')).toBeNull()
    expect(sent[1]!.url.searchParams.get('page_token')).toBe(
      Buffer.from(`Bearer keap_test|${path}|5`).toString('base64url'),
    )
  })

  it('page 2 cold walks from page 1', async () => {
    fakeKeap(11)
    expect((await call(method, withPageSink({ page: 2, limit: 5 }))).map((r) => r.id)).toEqual(
      ids(6, 5),
    )
  })

  it('a limit above 1000 is clamped and still serves every row', async () => {
    const total = 2 * MAX + 1
    const { sent } = fakeKeap(total)
    const seen: string[] = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: 2500 })
      seen.push(...(await call(method, params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, total))
    expect(sent.every((s) => s.url.searchParams.get('page_size') === String(MAX))).toBe(true)
  })

  it('the API path (parseListQuery → listPage) reports meta.hasMore', async () => {
    fakeKeap(11)
    const p1 = parseListQuery({ page: '1', limit: '5' })
    const env1 = listPage(await call(method, p1), p1, 'keap')
    expect(env1.data).toHaveLength(5)
    expect(env1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '5' })
    const env3 = listPage(await call(method, p3), p3, 'keap')
    expect(env3.data.map((r) => r.id)).toEqual(['11'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('a full last page reports hasMore false on the API path', async () => {
    fakeKeap(10)
    const p2 = parseListQuery({ page: '2', limit: '5' })
    const env = listPage(await call(method, p2), p2, 'keap')
    expect(env.data).toHaveLength(5)
    expect(env.meta.hasMore).toBe(false)
  })

  it('an empty next_page_token on the last page is the end, never a page_token', async () => {
    const { sent } = fakeKeap(10, 50, true)
    const p1 = withPageSink({ page: 1, limit: 5 })
    await call(method, p1)
    const p2 = withPageSink({ page: 2, limit: 5 })
    expect((await call(method, p2)).map((r) => r.id)).toEqual(ids(6, 5))
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    expect(sent).toHaveLength(2)
    expect(sent.every((s) => s.url.searchParams.get('page_token') !== '')).toBe(true)
  })

  it('no caller limit sends the default page_size of 25', async () => {
    const { sent } = fakeKeap(30)
    const params = withPageSink({ page: 1 })
    expect(await call(method, params)).toHaveLength(25)
    expect(sent[0]!.url.searchParams.get('page_size')).toBe('25')
    expect(readUpstreamPage(params)?.pageSize).toBe(25)
  })

  it('a fractional limit is floored and a limit of 0 falls back to 25', async () => {
    const { sent } = fakeKeap(30)
    expect(await call(method, withPageSink({ page: 1, limit: 7.9 }))).toHaveLength(7)
    expect(await call(method, withPageSink({ page: 1, limit: 0 }))).toHaveLength(25)
    expect(sent.map((s) => s.url.searchParams.get('page_size'))).toEqual(['7', '25'])
  })

  it('a new limit mid-walk starts its own chain', async () => {
    fakeKeap(40)
    await call(method, withPageSink({ page: 1, limit: 5 }))
    expect((await call(method, withPageSink({ page: 2, limit: 10 }))).map((r) => r.id)).toEqual(
      ids(11, 10),
    )
  })

  it('each connection keeps its own chain', async () => {
    const { sent } = fakeKeap(20)
    const a = new KeapAdapter()
    await a[method]({ accessToken: 'token_a' }, withPageSink({ page: 1, limit: 5 }))
    await a[method]({ accessToken: 'token_a' }, withPageSink({ page: 2, limit: 5 }))
    const b = (await a[method](
      { accessToken: 'token_b' },
      withPageSink({ page: 2, limit: 5 }),
    )) as {
      id: string
    }[]
    expect(b.map((r) => r.id)).toEqual(ids(6, 5))
    expect(sent.filter((s) => s.token === 'Bearer token_b')).toHaveLength(2)
  })
})

describe('keap pager keys', () => {
  it('each collection keeps its own chain', async () => {
    fakeKeap(20)
    await call('listContacts', withPageSink({ page: 1, limit: 5 }))
    await call('listContacts', withPageSink({ page: 2, limit: 5 }))
    for (const { method } of CASES.slice(1)) {
      expect((await call(method, withPageSink({ page: 2, limit: 5 }))).map((r) => r.id)).toEqual(
        ids(6, 5),
      )
    }
  })
})
