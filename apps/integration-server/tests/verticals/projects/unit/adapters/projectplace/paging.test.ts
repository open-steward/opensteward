/**
 * Projectplace listComments serves the caller's page `page` at `limit`.
 *
 * GET /3/conversations/comments
 * (https://service.projectplace.com/apidocs/endpoint_conversations.html):
 * "The API is pageable using the offset and count parameters."
 *   count  "Defaults to 100 entries (which is also the maximum allowable
 *          pagination count). You can specify any count between 1 and 100."
 *   offset "Defaults to 0. If you specify this number higher, this will bypass
 *          the first offset comments."
 * The adapter sent only `count` (the caller's limit, unclamped), so page 2 was
 * page 1 again and a limit over 100 asked for more than the documented maximum.
 *
 * The fake upstream below honours ONLY the documented parameters (item_id,
 * item_name, count, offset) and answers at axios's transport.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { ProjectplaceAdapter } from '../../../../../../src/verticals/projects/adapters/projectplace/index'

const ORIGIN = 'https://api.projectplace.com'
const COMMENTS = '/3/conversations/comments'
const MAX_COUNT = 100
const DOCUMENTED = new Set(['item_id', 'item_name', 'count', 'offset', 'sort_by', 'sort_order'])
const CARD = '555'

const adapter = new ProjectplaceAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
const CREDS = { accessToken: 'tok', refreshToken: 'refresh' }

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => String(i + 1))

type Source = (token: string, card: string) => unknown

const commentRows = (n: number, card = CARD, base = 0): unknown[] =>
  ids(n).map((id) => ({
    id: base + Number(id),
    text: `c${id}`,
    item_id: Number(card),
    item_name: 'card',
  }))

function fakeProjectplace(n: number | Source): void {
  seen = []
  const source: Source = typeof n === 'number' ? () => commentRows(n) : n
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== ORIGIN || url.pathname !== COMMENTS)
      throw httpError(404, { error: `no route ${url.pathname}` })
    const q = url.searchParams
    for (const k of q.keys())
      if (!DOCUMENTED.has(k)) throw httpError(400, { error: `unknown ${k}` })
    const card = q.get('item_id')
    if (!card || q.get('item_name') !== 'card')
      throw httpError(400, { error: 'item_id and item_name are required' })
    const count = q.has('count') ? Number(q.get('count')) : MAX_COUNT
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT)
      throw httpError(400, { error: `count must be between 1 and ${MAX_COUNT}` })
    const offset = q.has('offset') ? Number(q.get('offset')) : 0
    const auth = String(config.headers?.Authorization ?? '')
    const all = source(auth.replace(/^Bearer /, ''), card)
    const data = Array.isArray(all) ? all.slice(offset, offset + count) : all
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

beforeEach(() => {
  _resetRowPager()
})

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

async function call(
  params: QueryParams,
  creds: typeof CREDS = CREDS,
  card: string = CARD,
): Promise<string[]> {
  return (await adapter.listComments(creds, card, params)).map((c) => c.id)
}

async function syncPage(
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params = withPageSink({ page, limit })
  const got = await call(params)
  return { ids: got, hasMore: readUpstreamPage(params)?.hasMore }
}

describe('projectplace listComments pages by offset + count', () => {
  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    const L = 10
    fakeProjectplace(2 * L + 1)
    const all = ids(2 * L + 1)
    expect(await syncPage(1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('serves 2L+1 rows at L = the documented maximum, each once, hasMore exact', async () => {
    const L = MAX_COUNT
    fakeProjectplace(2 * L + 1)
    const all = ids(2 * L + 1)
    expect(await syncPage(1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeProjectplace(2 * MAX_COUNT)
    expect(await syncPage(2, MAX_COUNT)).toEqual({
      ids: ids(2 * MAX_COUNT).slice(MAX_COUNT),
      hasMore: false,
    })
  })

  it('the page-2 request carries the documented offset', async () => {
    fakeProjectplace(2 * MAX_COUNT + 1)
    await syncPage(2, MAX_COUNT)
    const offsets = seen.map((u) => u.searchParams.get('offset') ?? '0')
    expect(offsets).toContain(String(MAX_COUNT))
    const page2 = seen.find((u) => u.searchParams.get('offset') === String(MAX_COUNT))!
    expect(page2.searchParams.get('count')).toBe(String(MAX_COUNT))
    expect(page2.searchParams.get('item_id')).toBe(CARD)
    expect(page2.searchParams.get('item_name')).toBe('card')
  })

  it('clamps a limit above 100 on every request and still serves the caller limit', async () => {
    fakeProjectplace(450)
    const all = ids(450)
    const out: string[] = []
    for (let page = 1; page < 10; page++) {
      const { ids: got, hasMore } = await syncPage(page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(all)
    for (const s of seen) expect(Number(s.searchParams.get('count'))).toBeLessThanOrEqual(MAX_COUNT)
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeProjectplace(1234)
    const out: string[] = []
    for (let page = 1; page < 20; page++) {
      const { ids: got, hasMore } = await syncPage(page, 500)
      out.push(...got)
      if (hasMore === false) break
    }
    expect(out).toEqual(ids(1234))
  })

  it('pages through the API path', async () => {
    fakeProjectplace(45)
    const params = parseListQuery({ limit: '20', page: '2' })
    const env = listPage(await call(params), params, 'projectplace')
    expect(env.data).toEqual(ids(45).slice(20, 40))
    expect(env.meta.limit).toBe(20)
    expect(env.meta.hasMore).toBe(true)
  })

  it('an empty thread is an empty last page', async () => {
    fakeProjectplace(0)
    expect(await syncPage(1, 10)).toEqual({ ids: [], hasMore: false })
  })

  it("keeps one connection's walk out of another connection's page 2", async () => {
    const OTHER = { accessToken: 'tok-b', refreshToken: 'refresh-b' }
    fakeProjectplace((token) => commentRows(150, CARD, token === 'tok-b' ? 1000 : 0))
    expect(await call(withPageSink({ page: 1, limit: 10 }))).toEqual(ids(10))
    const b2 = await call(withPageSink({ page: 2, limit: 10 }), OTHER)
    expect(b2).toEqual(
      ids(20)
        .slice(10)
        .map((id) => String(1000 + Number(id))),
    )
  })

  it("keeps one card's walk out of another card's page 2", async () => {
    const CARD_B = '777'
    fakeProjectplace((_t, card) => commentRows(150, card, card === CARD_B ? 1000 : 0))
    expect(await call(withPageSink({ page: 1, limit: 10 }))).toEqual(ids(10))
    const b2 = await call(withPageSink({ page: 2, limit: 10 }), CREDS, CARD_B)
    expect(b2).toEqual(
      ids(20)
        .slice(10)
        .map((id) => String(1000 + Number(id))),
    )
  })

  it('throws on a non-array body instead of serving an empty page', async () => {
    fakeProjectplace(() => ({ comments: commentRows(3) }))
    await expect(call(withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(/non-array body/)
  })
})
