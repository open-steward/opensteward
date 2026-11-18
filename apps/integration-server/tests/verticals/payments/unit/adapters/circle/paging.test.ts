/**
 * Circle Mint list paging: every list serves the caller's page `page` at `limit`.
 *
 * Both list endpoints the adapter reads, GET /v1/payments
 * (https://developers.circle.com/api-reference/circle-mint/payments/list-payments)
 * and GET /v1/payouts
 * (https://developers.circle.com/api-reference/circle-mint/payouts/list-payouts),
 * share one keyset contract:
 *   pageAfter  "It marks the exclusive begin of a page. When provided, the
 *               collection resource will return the next `n` items after the
 *               id, with `n` being specified by `pageSize`."
 *   pageSize   "Some collections have a strict upper bound that will disregard
 *               this value. In case the specified value is higher than the
 *               allowed limit, the collection limit will be used."
 * The response is `{ data: [...] }` with no next token, and no maximum is
 * documented, so a short page does not prove the end: only an empty one does.
 *
 * The adapter used to send `pageSize` and never `pageAfter`, so page 2 of both
 * lists was page 1 again.
 *
 * The fake upstream below honours ONLY the documented parameters (`pageSize`,
 * `pageAfter`, `pageBefore`, `from`, `to`) and answers at the seam every Circle
 * request crosses, axios's transport. It enforces a hidden per-collection cap,
 * as the doc warns some collections do.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { CircleAdapter } from '../../../../../../src/verticals/payments/adapters/circle/index'

const ORIGIN = 'https://api-sandbox.circle.com'
const DOCUMENTED = new Set(['pageSize', 'pageAfter', 'pageBefore', 'from', 'to'])

const adapter = new CircleAdapter()
const CREDS_A = { accessToken: 'TEST_API_KEY:a' }
const CREDS_B = { accessToken: 'TEST_API_KEY:b' }

interface Seen {
  url: URL
  token: string
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { response: { status, data: { message } } })
}

let seen: Seen[] = []
const realAdapter = axios.defaults.adapter

/** `counts[path]` rows per token; ids carry the token so a row served to the wrong key shows. */
function fakeCircle(counts: Record<string, number>, hiddenCap = 1_000): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    const auth = String(config.headers?.get?.('Authorization') ?? config.headers?.['Authorization'])
    const token = auth.replace(/^Bearer /, '')
    seen.push({ url, token })
    if (url.origin !== ORIGIN) throw httpError(404, `no such host ${url.origin}`)
    const n = counts[url.pathname]
    if (n === undefined) throw httpError(404, `no route ${url.pathname}`)
    for (const k of url.searchParams.keys())
      if (!DOCUMENTED.has(k)) throw httpError(400, `unknown parameter ${k}`)
    const q = url.searchParams
    const asked = q.has('pageSize') ? Number(q.get('pageSize')) : 50
    if (!Number.isInteger(asked) || asked < 1) throw httpError(400, 'pageSize must be >= 1')
    const size = Math.min(asked, hiddenCap)
    const rows = idsFor(url.pathname, n, token).map((id) => ({ id, type: 'payment' }))
    let first = 0
    const after = q.get('pageAfter')
    if (after !== null) {
      const i = rows.findIndex((r) => r.id === after)
      if (i < 0) throw httpError(400, `pageAfter ${after} is not in this collection`)
      first = i + 1
    }
    return {
      data: { data: rows.slice(first, first + size) },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

function idsFor(path: string, n: number, token = CREDS_A.accessToken): string[] {
  const tag = path.split('/').pop()
  return Array.from({ length: n }, (_, i) => `${token}:${tag}:${String(i + 1).padStart(4, '0')}`)
}

beforeEach(() => {
  _resetCursorPager()
})
afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type ListMethod = 'listCharges' | 'listPayouts'

async function syncPage(
  method: ListMethod,
  page: number,
  limit: number,
  creds = CREDS_A,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit })
  const rows = await adapter[method](creds, params)
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

async function walk(method: ListMethod, limit: number): Promise<string[]> {
  const out: string[] = []
  for (let page = 1; page < 200; page++) {
    const { ids, hasMore } = await syncPage(method, page, limit)
    out.push(...ids)
    if (hasMore === false || (hasMore === undefined && ids.length < limit)) return out
  }
  throw new Error('walk did not end')
}

const METHODS = [
  ['listCharges', '/v1/payments'],
  ['listPayouts', '/v1/payouts'],
] as const

describe.each(METHODS)('circle %s pages by pageAfter', (method, path) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeCircle({ [path]: 2 * L + 1 })
    const all = idsFor(path, 2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeCircle({ [path]: 2 * L })
    const all = idsFor(path, 2 * L)
    await syncPage(method, 1, L)
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L), hasMore: false })
  })

  it('sends the documented pageAfter (the last id of page 1) on page 2', async () => {
    fakeCircle({ [path]: 2 * L + 1 })
    await syncPage(method, 2, L)
    for (const s of seen) expect(s.url.pathname).toBe(path)
    const page2 = seen.find((s) => s.url.searchParams.has('pageAfter'))
    expect(page2?.url.searchParams.get('pageAfter')).toBe(idsFor(path, L)[L - 1])
    expect(page2?.url.searchParams.get('pageSize')).toBe(String(L))
  })

  it("serves every row when the limit is above the collection's hidden cap", async () => {
    fakeCircle({ [path]: 257 }, 50)
    const p1 = await syncPage(method, 1, 200)
    expect(p1).toEqual({ ids: idsFor(path, 257).slice(0, 200), hasMore: true })
    expect(await syncPage(method, 2, 200)).toEqual({
      ids: idsFor(path, 257).slice(200),
      hasMore: false,
    })
  })

  it('serves every row at the sync worker page size', async () => {
    fakeCircle({ [path]: 1_203 }, 50)
    expect(
      (adapter as { capabilities?: { maxPageSize?: number } }).capabilities?.maxPageSize,
    ).toBeUndefined()
    expect(await walk(method, 500)).toEqual(idsFor(path, 1_203))
  })

  it('keeps each connection on its own walk', async () => {
    fakeCircle({ [path]: 2 * L + 1 })
    await syncPage(method, 1, L, CREDS_A)
    const b2 = await syncPage(method, 2, L, CREDS_B)
    expect(b2.ids).toEqual(idsFor(path, 2 * L + 1, CREDS_B.accessToken).slice(L, 2 * L))
    for (const s of seen.filter((x) => x.token === CREDS_B.accessToken))
      expect(s.url.searchParams.get('pageAfter') ?? '').not.toContain(CREDS_A.accessToken)
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    fakeCircle({ [path]: 25 })
    const params2 = parseListQuery({ limit: '10', page: '2' })
    // `adapter[method]` is a union of list methods whose row types differ
    // (statementDescriptor string | null vs optional string); pinning T to
    // what the test reads keeps inference independent of union ordering,
    // which TypeScript 7 does not hold stable across unrelated type additions.
    const env2 = listPage<{ id: string }>(
      await adapter[method](CREDS_A, params2),
      params2,
      'circle',
    )
    expect(env2.data.map((r) => r.id)).toEqual(idsFor(path, 25).slice(10, 20))
    expect(env2.meta.hasMore).toBe(true)
    const params3 = parseListQuery({ limit: '10', page: '3' })
    const env3 = listPage<{ id: string }>(
      await adapter[method](CREDS_A, params3),
      params3,
      'circle',
    )
    expect(env3.data.map((r) => r.id)).toEqual(idsFor(path, 25).slice(20))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('circle list walks are keyed per collection and per upstream page size', () => {
  it('keeps listCharges and listPayouts on separate walks on one connection', async () => {
    fakeCircle({ '/v1/payments': 25, '/v1/payouts': 25 })
    await syncPage('listCharges', 1, 10)
    const p2 = await syncPage('listPayouts', 2, 10)
    expect(p2).toEqual({ ids: idsFor('/v1/payouts', 25).slice(10, 20), hasMore: true })
    for (const s of seen.filter((x) => x.url.pathname === '/v1/payouts'))
      expect(s.url.searchParams.get('pageAfter') ?? '').not.toContain(':payments:')
  })

  it.each(METHODS)(
    '%s at another limit walks at its own upstream pageSize',
    async (method, path) => {
      // Page 2 at 10 peeks rows 21-30 at pageSize=10. Page 5 at 5 is rows 21-25:
      // a walk sharing that memo would serve them from the pageSize=10 peek and
      // never ask upstream at the size it sends. Its own walk starts from row 1.
      fakeCircle({ [path]: 30 })
      await syncPage(method, 1, 10)
      await syncPage(method, 2, 10)
      seen = []
      expect(await syncPage(method, 5, 5)).toEqual({
        ids: idsFor(path, 30).slice(20, 25),
        hasMore: true,
      })
      expect(seen.length).toBeGreaterThan(0)
      expect(seen[0]!.url.searchParams.has('pageAfter')).toBe(false)
      for (const s of seen) expect(s.url.searchParams.get('pageSize')).toBe('5')
    },
  )
})
