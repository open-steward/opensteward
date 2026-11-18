/**
 * Amazon SP-API (logistics) paging.
 *
 * Every fake below honours ONLY the parameters Amazon's first-party models
 * document (github.com/amzn/selling-partner-api-models):
 *
 *   - getSupplySources (supplySources_2020-07-01.json): query `pageSize`
 *     ("The number of supply sources to return per paginated request.",
 *     default 10) and `nextPageToken`; the response's `nextPageToken` — "If
 *     present, use this pagination token to retrieve the next page of supply
 *     sources." No maximum pageSize is documented.
 *   - getCarrierAccounts (shippingV2.json): the request body has only
 *     `clientReferenceDetails`; the response is the whole `activeAccounts`
 *     list. No paging at all.
 *   - getCollectionFormHistory (shippingV2.json): body `maxResults` — "max
 *     Number of Results for query ." — and no cursor, offset or page. The
 *     adapter reads growing windows from the start of the history (each one
 *     `limit` rows longer than the last) and cuts the caller's page out.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import { AmazonSpApiAdapter } from '../../../../../../src/verticals/logistics/adapters/amazon-sp-api/index'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' }

interface Call {
  method: 'get' | 'put'
  path: string
  params?: Record<string, unknown>
  body?: Record<string, unknown>
}

function fakeHttp(answer: (call: Call) => unknown) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const call: Call = { method: 'get', path, params: cfg?.params }
    calls.push(call)
    return { data: answer(call) }
  })
  const put = vi.fn(async (path: string, body?: Record<string, unknown>) => {
    const call: Call = { method: 'put', path, body }
    calls.push(call)
    return { data: answer(call) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, put } as never)
  return { calls }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

const L = 3
const N = 2 * L + 1

// ─── Supply sources (warehouses): pageSize + nextPageToken ──────────────────

function supplySourceFake(total: number) {
  const ids = Array.from({ length: total }, (_, i) => `ss-${i + 1}`)
  return fakeHttp((call) => {
    if (call.path !== 'supplySources/2020-07-01/supplySources') throw new Error(call.path)
    const size = Number(call.params?.['pageSize'] ?? 10)
    const token = call.params?.['nextPageToken'] as string | undefined
    const start = token ? Number(token.replace('tok-', '')) : 0
    const end = Math.min(start + size, ids.length)
    return {
      supplySources: ids.slice(start, end).map((id) => ({ supplySourceId: id, alias: id })),
      ...(end < ids.length ? { nextPageToken: `tok-${end}` } : {}),
    }
  })
}

describe('listWarehouses: nextPageToken paging', () => {
  it('pages 1..3 of 2L+1 rows return every id once, in order, with hasMore exact', async () => {
    supplySourceFake(N)
    const adapter = new AmazonSpApiAdapter()
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listWarehouses(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `ss-${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries nextPageToken and the caller pageSize', async () => {
    const { calls } = supplySourceFake(N)
    const adapter = new AmazonSpApiAdapter()
    await adapter.listWarehouses(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listWarehouses(CREDS, withPageSink({ page: 2, limit: L }))
    expect(calls.at(-1)?.params).toMatchObject({ pageSize: L, nextPageToken: `tok-${L}` })
  })

  it('a cold page 2 walks from page 1', async () => {
    const { calls } = supplySourceFake(N)
    const rows = await new AmazonSpApiAdapter().listWarehouses(
      CREDS,
      withPageSink({ page: 2, limit: L }),
    )
    expect(rows.map((r) => r.id)).toEqual(['ss-4', 'ss-5', 'ss-6'])
    expect(calls).toHaveLength(2)
  })

  it('API path: parseListQuery → listWarehouses → listPage reports hasMore', async () => {
    supplySourceFake(N)
    const adapter = new AmazonSpApiAdapter()
    const params = parseListQuery({ page: '3', limit: String(L) })
    const env = listPage(await adapter.listWarehouses(CREDS, params), params, 'amazon-sp-api')
    expect(env.data.map((r) => r.id)).toEqual(['ss-7'])
    expect(env.meta.hasMore).toBe(false)
    const params1 = parseListQuery({ page: '1', limit: String(L) })
    const env1 = listPage(await adapter.listWarehouses(CREDS, params1), params1, 'amazon-sp-api')
    expect(env1.meta.hasMore).toBe(true)
  })
})

// ─── Carrier accounts: the whole list, sliced locally ───────────────────────

function carrierFake(total: number) {
  return fakeHttp((call) => {
    if (call.path !== 'shipping/v2/carrierAccounts') throw new Error(call.path)
    return {
      activeAccounts: Array.from({ length: total }, (_, i) => ({
        accountId: `acct-${i + 1}`,
        carrierId: 'UPS',
      })),
    }
  })
}

describe('listCarriers: unpaginated, paged locally', () => {
  it('pages 1..3 of 2L+1 rows return every id once, in order, with hasMore exact', async () => {
    carrierFake(N)
    const adapter = new AmazonSpApiAdapter()
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listCarriers(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `acct-${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery → listCarriers → listPage', async () => {
    carrierFake(N)
    const adapter = new AmazonSpApiAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter.listCarriers(CREDS, params), params, 'amazon-sp-api')
    expect(env.data.map((r) => r.id)).toEqual(['acct-4', 'acct-5', 'acct-6'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(N)
  })
})

// ─── Collection form history (manifests): maxResults only ───────────────────

function historyFake(total: number) {
  const ids = Array.from({ length: total }, (_, i) => `cf-${i + 1}`)
  return fakeHttp((call) => {
    if (call.path !== 'shipping/v2/collectionForms/history') throw new Error(call.path)
    const max = call.body?.['maxResults']
    const rows = typeof max === 'number' ? ids.slice(0, max) : ids
    return {
      collectionFormsHistoryRecordList: rows.map((id) => ({
        collectionFormId: id,
        carrierName: 'USPS',
        generationStatus: 'Completed',
      })),
    }
  })
}

describe('listManifests: maxResults window', () => {
  it('pages 1..3 of 2L+1 rows return every id once, in order, with hasMore exact', async () => {
    historyFake(N)
    const adapter = new AmazonSpApiAdapter()
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listManifests(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `cf-${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('page 1 asks for maxResults = limit (then peeks), and page 2 widens the window by the limit', async () => {
    const { calls } = historyFake(N)
    const adapter = new AmazonSpApiAdapter()
    await adapter.listManifests(CREDS, withPageSink({ page: 1, limit: L }))
    expect(calls.map((c) => c.body)).toEqual([{ maxResults: L }, { maxResults: 2 * L }])
    const before = calls.length
    await adapter.listManifests(CREDS, withPageSink({ page: 2, limit: L }))
    expect(calls.slice(before).map((c) => c.body)).toEqual([{ maxResults: 3 * L }])
  })

  it('a cold page 2 walks the windows from the start', async () => {
    historyFake(N)
    const rows = await new AmazonSpApiAdapter().listManifests(
      CREDS,
      withPageSink({ page: 2, limit: L }),
    )
    expect(rows.map((r) => r.id)).toEqual(['cf-4', 'cf-5', 'cf-6'])
  })

  it('an exact multiple of the limit ends with hasMore false on the last page', async () => {
    historyFake(2 * L)
    const adapter = new AmazonSpApiAdapter()
    const p2 = withPageSink({ page: 2, limit: L })
    await adapter.listManifests(CREDS, withPageSink({ page: 1, limit: L }))
    const rows = await adapter.listManifests(CREDS, p2)
    expect(rows.map((r) => r.id)).toEqual(['cf-4', 'cf-5', 'cf-6'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → listManifests → listPage', async () => {
    historyFake(N)
    const adapter = new AmazonSpApiAdapter()
    const params = parseListQuery({ page: '3', limit: String(L) })
    const env = listPage(await adapter.listManifests(CREDS, params), params, 'amazon-sp-api')
    expect(env.data.map((r) => r.id)).toEqual(['cf-7'])
    expect(env.meta.hasMore).toBe(false)
  })
})

// ─── Pager keys: per connection, and per caller limit ───────────────────────

/**
 * Two sellers behind one fake, told apart by the access token the client is
 * built with. Each has its own collection-form history and supply sources.
 */
function twoSellerFake(total: number) {
  const calls: { seller: string; call: Call }[] = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, string> }) => {
    const seller = String(cfg?.headers?.['x-amz-access-token'] ?? '')
    const ids = (prefix: string) =>
      Array.from({ length: total }, (_, i) => `${seller}-${prefix}-${i + 1}`)
    const answer = (call: Call) => {
      calls.push({ seller, call })
      if (call.path === 'shipping/v2/collectionForms/history') {
        const max = call.body?.['maxResults']
        const all = ids('cf')
        const rows = typeof max === 'number' ? all.slice(0, max) : all
        return {
          collectionFormsHistoryRecordList: rows.map((id) => ({
            collectionFormId: id,
            carrierName: 'USPS',
            generationStatus: 'Completed',
          })),
        }
      }
      if (call.path === 'supplySources/2020-07-01/supplySources') {
        const all = ids('ss')
        const size = Number(call.params?.['pageSize'] ?? 10)
        const token = call.params?.['nextPageToken'] as string | undefined
        const start = token ? Number(token.split(':')[1]) : 0
        const end = Math.min(start + size, all.length)
        return {
          supplySources: all.slice(start, end).map((id) => ({ supplySourceId: id, alias: id })),
          ...(end < all.length ? { nextPageToken: `${seller}:${end}` } : {}),
        }
      }
      throw new Error(call.path)
    }
    return {
      get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) => ({
        data: answer({ method: 'get', path, params: c?.params }),
      })),
      put: vi.fn(async (path: string, body?: Record<string, unknown>) => ({
        data: answer({ method: 'put', path, body }),
      })),
    }
  }) as never)
  return { calls }
}

const SELLER_A = { accessToken: 'A', refreshToken: 'rt-A' }
const SELLER_B = { accessToken: 'B', refreshToken: 'rt-B' }

describe('pager keys', () => {
  it('listManifests: interleaved connections each get only their own rows', async () => {
    twoSellerFake(N)
    const adapter = new AmazonSpApiAdapter()
    const a1 = await adapter.listManifests(SELLER_A, withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listManifests(SELLER_B, withPageSink({ page: 2, limit: L }))
    const b1 = await adapter.listManifests(SELLER_B, withPageSink({ page: 1, limit: L }))
    const a2 = await adapter.listManifests(SELLER_A, withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(['A-cf-1', 'A-cf-2', 'A-cf-3'])
    expect(b2.map((r) => r.id)).toEqual(['B-cf-4', 'B-cf-5', 'B-cf-6'])
    expect(b1.map((r) => r.id)).toEqual(['B-cf-1', 'B-cf-2', 'B-cf-3'])
    expect(a2.map((r) => r.id)).toEqual(['A-cf-4', 'A-cf-5', 'A-cf-6'])
  })

  it('listWarehouses: interleaved connections never reuse the other seller’s token', async () => {
    const { calls } = twoSellerFake(N)
    const adapter = new AmazonSpApiAdapter()
    await adapter.listWarehouses(SELLER_A, withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listWarehouses(SELLER_B, withPageSink({ page: 2, limit: L }))
    expect(b2.map((r) => r.id)).toEqual(['B-ss-4', 'B-ss-5', 'B-ss-6'])
    for (const { seller, call } of calls) {
      const token = call.params?.['nextPageToken']
      if (typeof token === 'string') expect(token.startsWith(`${seller}:`)).toBe(true)
    }
  })

  it('listWarehouses: a token minted at one limit is not reused at another', async () => {
    const { calls } = supplySourceFake(12)
    const adapter = new AmazonSpApiAdapter()
    await adapter.listWarehouses(CREDS, withPageSink({ page: 1, limit: 5 }))
    await adapter.listWarehouses(CREDS, withPageSink({ page: 2, limit: 5 }))
    const before = calls.length
    const rows = await adapter.listWarehouses(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['ss-4', 'ss-5', 'ss-6'])
    expect(calls.slice(before).every((c) => c.params?.['pageSize'] === 3)).toBe(true)
  })
})

// ─── listWarehouses: an explicit cursor ─────────────────────────────────────

describe('listWarehouses: explicit params.cursor', () => {
  it('sends the cursor as nextPageToken and reports hasMore from the response', async () => {
    const { calls } = supplySourceFake(N)
    const adapter = new AmazonSpApiAdapter()
    const params = withPageSink({ page: 1, limit: L, cursor: 'tok-3' })
    const rows = await adapter.listWarehouses(CREDS, params)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.params).toMatchObject({ pageSize: L, nextPageToken: 'tok-3' })
    expect(rows.map((r) => r.id)).toEqual(['ss-4', 'ss-5', 'ss-6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('reports hasMore false when the cursor page is the last', async () => {
    supplySourceFake(N)
    const params = withPageSink({ page: 1, limit: L, cursor: 'tok-6' })
    const rows = await new AmazonSpApiAdapter().listWarehouses(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['ss-7'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

// ─── listManifests: robustness if maxResults were not honoured ──────────────

describe('listManifests: an upstream that returns more than maxResults', () => {
  it('pages 1..3 still return every id once, in order', async () => {
    // Not documented behaviour: this pins that the next window starts at the
    // true row count, so an over-long answer cannot repeat rows.
    const ids = Array.from({ length: N }, (_, i) => `cf-${i + 1}`)
    fakeHttp(() => ({
      collectionFormsHistoryRecordList: ids.map((id) => ({
        collectionFormId: id,
        carrierName: 'USPS',
        generationStatus: 'Completed',
      })),
    }))
    const adapter = new AmazonSpApiAdapter()
    const seen: string[] = []
    for (const page of [1, 2, 3]) {
      const rows = await adapter.listManifests(CREDS, withPageSink({ page, limit: L }))
      seen.push(...rows.map((r) => r.id as string))
    }
    expect(seen).toEqual(ids)
  })
})
