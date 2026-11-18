/**
 * Tabby list paging: every list serves the caller's page `page` at `limit`.
 *
 * GET /api/v2/payments
 * (https://docs.tabby.ai/api-reference/payments/list-of-all-payments) pages by
 * offset:
 *   limit   "Limits the number of returned results." (`maximum: 20`)
 *   offset  "The number of records into a dataset that you want to start,
 *            indexed at 0."
 * and answers `{ payments: [...], pagination: { limit, offset, total_count } }`
 * ("Returned total item count."). The adapter sent `offset: params.offset`,
 * which the router never sets, so page 2 was page 1 again; and it read the
 * documented object as a bare array, so every call returned [].
 *
 * GET /api/v1/disputes
 * (https://docs.tabby.ai/api-reference/disputes/get-disputes-list) "Returns
 * list of 100 recently created disputes." and takes no size parameter; the
 * next batch is fetched with `page_token`, from `next_page_token`, which is
 * empty on the last page. The adapter only sent a page_token built from
 * `params.offset`, so it never paged.
 *
 * The fake upstream below honours ONLY the documented parameters and answers
 * at the seam every Tabby request crosses, axios's transport.
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
import { TabbyAdapter } from '../../../../../../src/verticals/payments/adapters/tabby/index'

const ORIGIN = 'https://api.tabby.ai'
const ORIGIN_SA = 'https://api.tabby.sa'
const PAYMENTS = '/api/v2/payments'
const DISPUTES = '/api/v1/disputes'
const DOCUMENTED: Record<string, Set<string>> = {
  [PAYMENTS]: new Set(['created_at__gte', 'created_at__lte', 'limit', 'status', 'offset']),
  [DISPUTES]: new Set(['statuses', 'created_at_gte', 'created_at_lte', 'page_token']),
}
const PAYMENTS_MAX = 20
const DISPUTE_BATCH = 100

const adapter = new TabbyAdapter()
const CREDS_A = { accessToken: 'sk_test_a' }
const CREDS_B = { accessToken: 'sk_test_b' }

interface Seen {
  url: URL
  token: string
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { response: { status, data: { message } } })
}

let seen: Seen[] = []
const realAdapter = axios.defaults.adapter

function idsFor(path: string, n: number, token = CREDS_A.accessToken): string[] {
  const tag = path.split('/').pop()
  return Array.from({ length: n }, (_, i) => `${token}:${tag}:${String(i + 1).padStart(4, '0')}`)
}

/** Opaque page token: nothing the adapter could compute from a page number. */
const tokenFor = (token: string, start: number): string =>
  Buffer.from(`${token}|${start}`).toString('base64url')

function fakeTabby(counts: Record<string, number>): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    const auth = String(config.headers?.get?.('Authorization') ?? config.headers?.['Authorization'])
    const token = auth.replace(/^Bearer /, '')
    seen.push({ url, token })
    if (url.origin !== ORIGIN && url.origin !== ORIGIN_SA)
      throw httpError(404, `no such host ${url.origin}`)
    // Each regional host is its own account: its rows and page tokens differ.
    const owner = url.origin === ORIGIN ? token : `${token}@sa`
    const n = counts[url.pathname]
    const allowed = DOCUMENTED[url.pathname]
    if (n === undefined || !allowed) throw httpError(404, `no route ${url.pathname}`)
    for (const k of url.searchParams.keys())
      if (!allowed.has(k)) throw httpError(400, `unknown parameter ${k}`)
    const q = url.searchParams
    const ids = idsFor(url.pathname, n, owner)
    let data: unknown
    if (url.pathname === PAYMENTS) {
      const limit = q.has('limit') ? Number(q.get('limit')) : PAYMENTS_MAX
      if (!Number.isInteger(limit) || limit < 1 || limit > PAYMENTS_MAX)
        throw httpError(400, `limit must be 1..${PAYMENTS_MAX}`)
      const offset = q.has('offset') ? Number(q.get('offset')) : 0
      if (!Number.isInteger(offset) || offset < 0) throw httpError(400, 'offset must be >= 0')
      data = {
        payments: ids.slice(offset, offset + limit).map((id) => ({ id, amount: '1.00' })),
        pagination: { limit, offset, total_count: n },
      }
    } else {
      let start = 0
      const pt = q.get('page_token')
      if (pt !== null) {
        const [tokenOwner, at] = Buffer.from(pt, 'base64url').toString().split('|')
        if (tokenOwner !== owner || !Number.isInteger(Number(at)))
          throw httpError(400, 'bad page_token')
        start = Number(at)
      }
      const end = start + DISPUTE_BATCH
      data = {
        disputes: ids.slice(start, end).map((id) => ({ id, payment_id: 'p', amount: '1.00' })),
        next_page_token: end < n ? tokenFor(owner, end) : '',
      }
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

beforeEach(() => {
  _resetCursorPager()
})
afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type ListMethod = 'listCharges' | 'listDisputes'

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
  for (let page = 1; page < 500; page++) {
    const { ids, hasMore } = await syncPage(method, page, limit)
    out.push(...ids)
    if (hasMore === false) return out
    if (hasMore === undefined) throw new Error(`${method} page ${page} reported no hasMore`)
  }
  throw new Error('walk did not end')
}

const METHODS = [
  ['listCharges', PAYMENTS],
  ['listDisputes', DISPUTES],
] as const

describe.each(METHODS)('tabby %s serves the caller page', (method, path) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeTabby({ [path]: 2 * L + 1 })
    const all = idsFor(path, 2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeTabby({ [path]: 2 * L })
    const all = idsFor(path, 2 * L)
    await syncPage(method, 1, L)
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L), hasMore: false })
  })

  it('serves every row at the sync worker page size', async () => {
    fakeTabby({ [path]: 1_203 })
    expect(
      (adapter as { capabilities?: { maxPageSize?: number } }).capabilities?.maxPageSize,
    ).toBeUndefined()
    expect(await walk(method, 500)).toEqual(idsFor(path, 1_203))
  })

  it('keeps each connection on its own walk', async () => {
    fakeTabby({ [path]: 2 * L + 1 })
    await syncPage(method, 1, L, CREDS_A)
    const b2 = await syncPage(method, 2, L, CREDS_B)
    expect(b2.ids).toEqual(idsFor(path, 2 * L + 1, CREDS_B.accessToken).slice(L, 2 * L))
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    fakeTabby({ [path]: 25 })
    const params2 = parseListQuery({ limit: '10', page: '2' })
    const env2 = listPage<{ id: string }>(await adapter[method](CREDS_A, params2), params2, 'tabby')
    expect(env2.data.map((r) => r.id)).toEqual(idsFor(path, 25).slice(10, 20))
    expect(env2.meta.hasMore).toBe(true)
    const params3 = parseListQuery({ limit: '10', page: '3' })
    const env3 = listPage<{ id: string }>(await adapter[method](CREDS_A, params3), params3, 'tabby')
    expect(env3.data.map((r) => r.id)).toEqual(idsFor(path, 25).slice(20))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('tabby listCharges pages by limit + offset', () => {
  it('sends the documented offset on page 2', async () => {
    fakeTabby({ [PAYMENTS]: 21 })
    await syncPage('listCharges', 2, 10)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.url.searchParams.get('offset')).toBe('10')
    expect(seen[0]!.url.searchParams.get('limit')).toBe('10')
  })

  it('clamps a limit above 20 and still serves every row', async () => {
    fakeTabby({ [PAYMENTS]: 45 })
    const all = idsFor(PAYMENTS, 45)
    expect(await syncPage('listCharges', 1, 50)).toEqual({ ids: all.slice(0, 20), hasMore: true })
    expect(await syncPage('listCharges', 2, 50)).toEqual({ ids: all.slice(20, 40), hasMore: true })
    expect(await syncPage('listCharges', 3, 50)).toEqual({ ids: all.slice(40), hasMore: false })
    for (const s of seen) expect(s.url.searchParams.get('limit')).toBe('20')
    expect(seen.map((s) => s.url.searchParams.get('offset'))).toEqual(['0', '20', '40'])
  })

  it('judges the API page at the clamped size', async () => {
    fakeTabby({ [PAYMENTS]: 45 })
    const params = parseListQuery({ limit: '50', page: '2' })
    const env = listPage(await adapter.listCharges(CREDS_A, params), params, 'tabby')
    expect(env.data.map((r) => r.id)).toEqual(idsFor(PAYMENTS, 45).slice(20, 40))
    expect(env.meta.limit).toBe(20)
    expect(env.meta.totalCount).toBe(45)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('tabby listDisputes follows next_page_token', () => {
  it('sends the documented page_token for rows past the first batch of 100', async () => {
    fakeTabby({ [DISPUTES]: 250 })
    const all = idsFor(DISPUTES, 250)
    expect(await syncPage('listDisputes', 2, 100)).toEqual({
      ids: all.slice(100, 200),
      hasMore: true,
    })
    const tokens = seen.map((s) => s.url.searchParams.get('page_token'))
    expect(tokens[0]).toBeNull()
    expect(tokens).toContain(tokenFor(CREDS_A.accessToken, 100))
  })

  it('serves a caller limit above the batch of 100 across batches', async () => {
    fakeTabby({ [DISPUTES]: 250 })
    const all = idsFor(DISPUTES, 250)
    expect(await syncPage('listDisputes', 1, 150)).toEqual({
      ids: all.slice(0, 150),
      hasMore: true,
    })
    expect(await syncPage('listDisputes', 2, 150)).toEqual({ ids: all.slice(150), hasMore: false })
  })
})

describe('tabby list edges', () => {
  it('keeps each region on its own disputes walk for the same secret key', async () => {
    fakeTabby({ [DISPUTES]: 250 })
    const ae = { ...CREDS_A, extra: { region: 'ae' } }
    const sa = { ...CREDS_A, extra: { region: 'sa' } }
    await syncPage('listDisputes', 1, 100, ae)
    const sa2 = await syncPage('listDisputes', 2, 100, sa)
    expect(sa2.ids).toEqual(idsFor(DISPUTES, 250, `${CREDS_A.accessToken}@sa`).slice(100, 200))
    expect(seen.at(-1)!.url.origin).toBe(ORIGIN_SA)
  })

  it('serves 20 disputes when called with no limit', async () => {
    fakeTabby({ [DISPUTES]: 150 })
    const rows = await adapter.listDisputes(CREDS_A, withPageSink({ page: 1 }))
    expect(rows.map((r) => r.id)).toEqual(idsFor(DISPUTES, 150).slice(0, 20))
  })

  it('still reads a bare-array payments response', async () => {
    seen = []
    axios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => ({
      data: [{ id: 'bare-1', amount: '1.00' }],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    })) as unknown as AxiosAdapter
    const rows = await adapter.listCharges(CREDS_A, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['bare-1'])
  })
})
