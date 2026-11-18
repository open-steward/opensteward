/**
 * Amazon Shipping v2 list paging: both list endpoints return their whole
 * result in one response, so the adapter slices the caller's page locally.
 *
 * First-party spec (Amazon's own model repository):
 * https://github.com/amzn/selling-partner-api-models/blob/main/models/shipping-api-model/shippingV2.json
 *
 *   getCarrierAccounts (PUT /shipping/v2/carrierAccounts)
 *     "This API will return Get all carrier accounts for a merchant."
 *     GetCarrierAccountsRequest has one property, `clientReferenceDetails`;
 *     GetCarrierAccountsResponse is `activeAccounts`, "A list of ActiveAccount".
 *
 *   getCollectionFormHistory (PUT /shipping/v2/collectionForms/history)
 *     GetCollectionFormHistoryRequest: `clientReferenceDetails`, `maxResults`
 *     ("max Number of Results for query ."), `carrierId`, `shipFromAddress`,
 *     `dateRange`. The response is `collectionFormsHistoryRecordList` plus
 *     `lastRefreshedDate`, with no page token or offset of any kind.
 *
 * Neither endpoint has a page, offset or next-token parameter. So page 2 of the
 * caller must come from the same request as page 1, sliced by pageLocally.
 * Before this fix, the router cut every response to `limit`, page 2 repeated
 * page 1, and rows past the first page could never be reached.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { AmazonShippingAdapter } from '../../../../../../src/verticals/logistics/adapters/amazon-shipping/index'

const CREDS = { accessToken: 'Atza|test' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1

const CARRIER_BODY_KEYS = ['clientReferenceDetails']
const HISTORY_BODY_KEYS = [
  'clientReferenceDetails',
  'maxResults',
  'carrierId',
  'shipFromAddress',
  'dateRange',
]

/**
 * A fake Amazon Shipping v2 that honours ONLY the documented request: a PUT
 * with a JSON body whose keys are in the documented request schema, and no
 * query string (neither operation declares one). It returns every row, as the
 * real endpoints do.
 */
function fakeAmazon(total: number) {
  let calls = 0
  const put = vi.fn(
    async (path: string, body: unknown, cfg?: { params?: Record<string, unknown> }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      if (cfg?.params !== undefined && Object.keys(cfg.params).length > 0) {
        throw new Error(`400: undocumented query params ${JSON.stringify(cfg.params)}`)
      }
      const keys = Object.keys((body ?? {}) as Record<string, unknown>)
      if (path === 'carrierAccounts') {
        const bad = keys.filter((k) => !CARRIER_BODY_KEYS.includes(k))
        if (bad.length) throw new Error(`400: undocumented body keys ${bad.join(',')}`)
        return {
          data: {
            activeAccounts: Array.from({ length: total }, (_, i) => ({
              accountId: `c${i + 1}`,
              carrierId: `carrier${i + 1}`,
            })),
          },
        }
      }
      if (path === 'collectionForms/history') {
        const bad = keys.filter((k) => !HISTORY_BODY_KEYS.includes(k))
        if (bad.length) throw new Error(`400: undocumented body keys ${bad.join(',')}`)
        return {
          data: {
            collectionFormsHistoryRecordList: Array.from({ length: total }, (_, i) => ({
              collectionFormId: `m${i + 1}`,
              carrierId: 'AMZN_UK',
              creationDate: '2025-04-01T12:00:00Z',
              generationStatus: 'Completed',
            })),
            lastRefreshedDate: '2025-04-02T00:00:00Z',
          },
        }
      }
      throw new Error(`unexpected path ${path}`)
    },
  )
  vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn(), post: vi.fn(), put } as never)
  return { put }
}

const METHODS = [
  {
    name: 'listCarriers',
    path: 'carrierAccounts',
    prefix: 'c',
    call: (a: AmazonShippingAdapter, p: QueryParams) => a.listCarriers(CREDS, p),
  },
  {
    name: 'listManifests',
    path: 'collectionForms/history',
    prefix: 'm',
    call: (a: AmazonShippingAdapter, p: QueryParams) => a.listManifests(CREDS, p),
  },
] as const

afterEach(() => vi.restoreAllMocks())

describe.each(METHODS)('amazon-shipping $name paging', ({ path, prefix, call }) => {
  const adapter = () => new AmazonShippingAdapter()
  const ids = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => `${prefix}${from + i}`)

  it(`N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore`, async () => {
    fakeAmazon(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await call(adapter(), params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: N, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(ids(1, N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented unpaged PUT, with no invented paging key', async () => {
    const { put } = fakeAmazon(N)
    await call(adapter(), withPageSink({ page: 2, limit: L }))
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0]![0]).toBe(path)
    expect(put.mock.calls[0]![1]).toEqual({})
  })

  it('a limit above the router maximum is clamped, and serves every row with hasMore false', async () => {
    fakeAmazon(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await call(adapter(), params)
    expect(rows.map((r) => r.id)).toEqual(ids(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeAmazon(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await call(adapter(), params), params, 'amazon-shipping')
    expect(env.data.map((r) => r.id)).toEqual(ids(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })
})
