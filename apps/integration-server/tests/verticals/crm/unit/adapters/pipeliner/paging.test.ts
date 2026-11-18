/**
 * Pipeliner (Coevera) list paging: 1-based `page` + caller's `limit` → the
 * documented `first` + `after` cursor chain, with `hasMore` from
 * `page_info.has_next_page`.
 *
 * https://developers.pipelinersales.com/api-docs/core-api-concepts/pagination
 *
 *   "Coevera sends a maximum of 100 (Default: 30) records per request. The
 *    limit can be changed by API parameter first ... To retrieve all data, it
 *    is recommended to use end_cursor with combination of API Parameter after.
 *    Iterate through the list, until the has_next_page is false"
 *
 * listPipelines (which also sends `expand=steps`) is covered in pipelines.test.ts.
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
import { PipelinerAdapter } from '../../../../../../src/verticals/crm/adapters/pipeliner/index'

const CREDS = { accessToken: 'pl_token', extra: { username: 'api_user', spaceId: 'space-1' } }
/** Documented: "a maximum of 100 (Default: 30)". */
const MAX = 100
const DEFAULT = 30

type Method = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listNotes'

const CASES: { method: Method; entity: string }[] = [
  { method: 'listContacts', entity: 'Contacts' },
  { method: 'listCompanies', entity: 'Accounts' },
  { method: 'listDeals', entity: 'Opportunities' },
  { method: 'listActivities', entity: 'Activities' },
  { method: 'listNotes', entity: 'Notes' },
]

const DOCUMENTED = new Set(['first', 'after'])

/**
 * A fake Pipeliner that honours ONLY `first` (1..100, default 30) and `after`
 * (an opaque `end_cursor` from a previous page). Anything else in the query
 * string, including the legacy `limit`/`offset`, is refused. Cursors are
 * bound to the space, the Authorization header and the entity that minted
 * them.
 */
function fakePipeliner(entity: string, total: number, opts: { omitTotal?: boolean } = {}) {
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const auth = new Headers(init?.headers).get('authorization') ?? ''
    const m = /^\/api\/v100\/rest\/spaces\/([^/]+)\/entities\/([^/]+)$/.exec(url.pathname)
    if ((init?.method ?? 'GET') !== 'GET' || !m || m[2] !== entity) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    for (const k of url.searchParams.keys()) {
      if (!DOCUMENTED.has(k)) return new Response(`unknown param ${k}`, { status: 400 })
    }
    sent.push(url)
    const rawFirst = url.searchParams.get('first')
    const first = rawFirst === null ? DEFAULT : Number(rawFirst)
    if (!Number.isInteger(first) || first < 1 || first > MAX) {
      return new Response(`first must be 1..${MAX}`, { status: 400 })
    }
    const binding = `${m[1]}|${auth}|${entity}`
    const after = url.searchParams.get('after')
    let offset = 0
    if (after !== null) {
      const decoded = Buffer.from(after, 'base64url').toString()
      const cut = decoded.lastIndexOf('|')
      if (decoded.slice(0, cut) !== binding) {
        return new Response('cursor from another space, user or entity', { status: 400 })
      }
      offset = Number(decoded.slice(cut + 1))
    }
    const data = Array.from({ length: Math.max(0, Math.min(first, total - offset)) }, (_, i) => ({
      id: String(offset + i + 1),
      name: `r${offset + i + 1}`,
      note: 'n',
    }))
    const end = offset + data.length
    const hasNext = end < total
    return new Response(
      JSON.stringify({
        success: true,
        data,
        ...(opts.omitTotal ? {} : { total }),
        page_info: {
          start_cursor: data.length ? 'start' : null,
          end_cursor: data.length ? Buffer.from(`${binding}|${end}`).toString('base64url') : null,
          has_previous_page: offset > 0,
          has_next_page: hasNext,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  return { sent }
}

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => String(from + i))

async function call(
  method: Method,
  params: QueryParams,
  creds: typeof CREDS = CREDS,
): Promise<{ id: string }[]> {
  return (await new PipelinerAdapter()[method](creds, params)) as { id: string }[]
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('pipeliner $method paging', ({ method, entity }) => {
  it('pages 1..3 of 2L+1 rows return every id once, in order, with exact hasMore', async () => {
    const L = 5
    const { sent } = fakePipeliner(entity, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(sent.every((u) => u.searchParams.get('first') === String(L))).toBe(true)
  })

  it('the page-2 request carries end_cursor as after', async () => {
    const { sent } = fakePipeliner(entity, 11)
    await call(method, withPageSink({ page: 1, limit: 5 }))
    await call(method, withPageSink({ page: 2, limit: 5 }))
    expect(sent).toHaveLength(2)
    expect(sent[0]!.searchParams.get('after')).toBeNull()
    expect(Buffer.from(sent[1]!.searchParams.get('after')!, 'base64url').toString()).toMatch(/\|5$/)
  })

  it('page 2 cold walks from page 1', async () => {
    fakePipeliner(entity, 11)
    expect((await call(method, withPageSink({ page: 2, limit: 5 }))).map((r) => r.id)).toEqual(
      ids(6, 5),
    )
  })

  it('a limit above 100 is clamped and still serves every row', async () => {
    const total = 2 * MAX + 1
    const { sent } = fakePipeliner(entity, total)
    const seen: string[] = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: 250 })
      seen.push(...(await call(method, params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, total))
    expect(sent.every((u) => u.searchParams.get('first') === String(MAX))).toBe(true)
  })

  it('no limit sends the documented maximum rather than the default of 30', async () => {
    const { sent } = fakePipeliner(entity, 5)
    await call(method, withPageSink({ page: 1 }))
    expect(sent.map((u) => u.searchParams.get('first'))).toEqual(['100'])
  })

  it('reports the top-level total', async () => {
    fakePipeliner(entity, 11)
    const params = withPageSink({ page: 1, limit: 5 })
    await call(method, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(11)
  })

  it('the API path (parseListQuery → listPage) reports meta.hasMore', async () => {
    fakePipeliner(entity, 11)
    const adapter = new PipelinerAdapter()
    const p1 = parseListQuery({ page: '1', limit: '5' })
    const env1 = listPage<{ id: string }>(await adapter[method](CREDS, p1), p1, 'pipeliner')
    expect(env1.data).toHaveLength(5)
    expect(env1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '5' })
    const env3 = listPage<{ id: string }>(await adapter[method](CREDS, p3), p3, 'pipeliner')
    expect(env3.data.map((r) => r.id)).toEqual(['11'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('a full last page reports hasMore false on the API path', async () => {
    fakePipeliner(entity, 10)
    const p2 = parseListQuery({ page: '2', limit: '5' })
    const env = listPage<{ id: string }>(
      await new PipelinerAdapter()[method](CREDS, p2),
      p2,
      'pipeliner',
    )
    expect(env.data).toHaveLength(5)
    expect(env.meta.hasMore).toBe(false)
  })

  it('a new limit mid-walk starts its own chain', async () => {
    fakePipeliner(entity, 40)
    await call(method, withPageSink({ page: 1, limit: 5 }))
    expect((await call(method, withPageSink({ page: 2, limit: 10 }))).map((r) => r.id)).toEqual(
      ids(11, 10),
    )
  })

  it('each connection keeps its own cursor chain', async () => {
    const { sent } = fakePipeliner(entity, 20)
    const other = { accessToken: 'other_token', extra: { username: 'u2', spaceId: 'space-1' } }
    await call(method, withPageSink({ page: 1, limit: 5 }))
    await call(method, withPageSink({ page: 2, limit: 5 }))
    const rows = await call(method, withPageSink({ page: 2, limit: 5 }), other)
    expect(rows.map((r) => r.id)).toEqual(ids(6, 5))
    expect(sent).toHaveLength(4)
  })

  it('same space and user with a different token is a different connection', async () => {
    const { sent } = fakePipeliner(entity, 20)
    const rotated = { ...CREDS, accessToken: 'pl_token_rotated' }
    await call(method, withPageSink({ page: 1, limit: 5 }))
    await call(method, withPageSink({ page: 2, limit: 5 }))
    const rows = await call(method, withPageSink({ page: 2, limit: 5 }), rotated)
    expect(rows.map((r) => r.id)).toEqual(ids(6, 5))
    expect(sent).toHaveLength(4)
    expect(sent[2]!.searchParams.get('after')).toBeNull()
  })

  it('same token in a different space is a different connection', async () => {
    const { sent } = fakePipeliner(entity, 20)
    const otherSpace = { ...CREDS, extra: { ...CREDS.extra, spaceId: 'space-2' } }
    await call(method, withPageSink({ page: 1, limit: 5 }))
    await call(method, withPageSink({ page: 2, limit: 5 }))
    const rows = await call(method, withPageSink({ page: 2, limit: 5 }), otherSpace)
    expect(rows.map((r) => r.id)).toEqual(ids(6, 5))
    expect(sent).toHaveLength(4)
    expect(sent[2]!.searchParams.get('after')).toBeNull()
  })

  it('a fractional limit called directly sends its floor', async () => {
    const { sent } = fakePipeliner(entity, 20)
    const rows = await call(method, withPageSink({ page: 1, limit: 7.5 }))
    expect(rows.map((r) => r.id)).toEqual(ids(1, 7))
    expect(sent.map((u) => u.searchParams.get('first'))).toEqual(['7'])
  })

  it('a limit below 1 called directly sends the maximum, never first=0', async () => {
    const { sent } = fakePipeliner(entity, 5)
    await call(method, withPageSink({ page: 1, limit: 0 }))
    expect(sent.map((u) => u.searchParams.get('first'))).toEqual(['100'])
  })

  it('a response without a total reports no totalCount rather than 0', async () => {
    fakePipeliner(entity, 11, { omitTotal: true })
    const params = withPageSink({ page: 1, limit: 5 })
    await call(method, params)
    const reported = readUpstreamPage(params)
    expect(reported?.hasMore).toBe(true)
    expect(reported?.totalCount).toBeUndefined()
  })
})
