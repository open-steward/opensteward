/**
 * Clover listLocations paging.
 *
 * A Clover merchant is the only location, read from the single-merchant
 * endpoint (https://docs.clover.com/dev/reference/merchantgetmerchant.md):
 *   "summary": "Get a single merchant"
 *   "description": "Successful response. Merchant details are displayed."
 * Its only query parameter is `expand`; there is no `offset` or `limit`, and
 * the 200 body is one object. The whole collection is therefore one row, so
 * it is paged locally: page 1 holds the merchant, every later page is empty,
 * and `hasMore` is exact. Before this, page 2 re-sent the same request and
 * served the same merchant again, a duplicate on every page.
 *
 * The N = 2L + 1 walk the other list methods use (request-shape.test.ts)
 * needs a collection size the caller can choose; this one is fixed at 1, so
 * the walk is 1 = 2·0 + 1 rows at limit 1 and at larger limits.
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
import { CloverAdapter } from '../../../../../../src/verticals/ecommerce/adapters/clover/index'

const MERCHANT = 'MERCHANT1'
const CREDS = { accessToken: 'clv_test', extra: { merchantId: MERCHANT, environment: 'sandbox' } }
/** Documented: "the hard limit is 1000", declared as capabilities.maxPageSize. */
const HARD_LIMIT = 1000

/**
 * A fake Clover serving GET /v3/merchants/{mId}/ with only its documented
 * query parameter, `expand`. `offset`, `limit` or anything else is refused.
 */
function fakeMerchant() {
  const get = vi.fn(async (p: string, cfg?: { params?: Record<string, unknown> }) => {
    if (p !== '') throw new Error(`unexpected path ${p} (expected the merchant record)`)
    const extra = Object.keys(cfg?.params ?? {}).filter((k) => k !== 'expand')
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    return { data: { id: MERCHANT, name: 'Downtown Coffee' } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), delete: vi.fn() } as never)
  return { get }
}

afterEach(() => vi.restoreAllMocks())

describe('clover listLocations paging', () => {
  const adapter = () => new CloverAdapter()

  it.each([1, 7, 500])(
    'pages 1..3 at limit %i serve the one merchant once, with hasMore exact',
    async (limit) => {
      fakeMerchant()
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit })
        const rows = await adapter().listLocations(CREDS, params)
        seen.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
        expect(readUpstreamPage(params)?.totalCount).toBe(1)
      }
      expect(seen).toEqual([MERCHANT])
      expect(hasMore).toEqual([false, false, false])
    },
  )

  it('page 2 sends only documented parameters and serves no duplicate', async () => {
    const { get } = fakeMerchant()
    const rows = await adapter().listLocations(CREDS, withPageSink({ page: 2, limit: 1 }))
    expect(rows).toEqual([])
    for (const call of get.mock.calls) {
      expect(Object.keys(call[1]?.params ?? {})).toEqual([])
    }
  })

  it('a limit above the hard limit still serves the merchant, once', async () => {
    fakeMerchant()
    const p1 = withPageSink({ page: 1, limit: 2 * HARD_LIMIT })
    const p2 = withPageSink({ page: 2, limit: 2 * HARD_LIMIT })
    expect((await adapter().listLocations(CREDS, p1)).map((r) => r.id)).toEqual([MERCHANT])
    expect(await adapter().listLocations(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
  })

  it('through the API path, page 1 at limit 1 says hasMore false, not unknown', async () => {
    fakeMerchant()
    const params: QueryParams = withPageSink(parseListQuery({ page: '1', limit: '1' }))
    const rows = await adapter().listLocations(CREDS, params)
    const env = listPage(rows, params, 'clover')
    expect(env.data.map((r) => r.id)).toEqual([MERCHANT])
    expect(env.meta.hasMore).toBe(false)
    expect(env.meta.totalCount).toBe(1)
  })

  it('through the API path, page 2 is empty', async () => {
    fakeMerchant()
    const params: QueryParams = withPageSink(parseListQuery({ page: '2', limit: '10' }))
    const env = listPage(await adapter().listLocations(CREDS, params), params, 'clover')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})
