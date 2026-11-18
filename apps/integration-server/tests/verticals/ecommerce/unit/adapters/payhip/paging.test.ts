/**
 * Payhip list paging: 1-based `page` + caller's `limit` → Payhip's `offset` +
 * `limit` query parameters on GET /api/v2/coupons, clamped to 100.
 *
 * From https://payhip.com/api-reference, "List all coupons":
 *   limit:  "The limit on the number of objects to be returned with the paginated
 *            results. Limit can range between 1 and 100, and the default is 10."
 *   offset: "To move to the next results of paginated lists you can define an offet
 *            integer. By default this would be 0."
 *
 * The documented list response is `{ "data": { "coupons": [ ... ] } }`, with no
 * total, has_more or next link, so a short page ends the list.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  effectivePageSize,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'
import { PayhipAdapter } from '../../../../../../src/verticals/ecommerce/adapters/payhip/index'

const CREDS = { accessToken: 'payhip_test' }
/** "Limit can range between 1 and 100, and the default is 10." */
const MAX = 100
const DEFAULT = 10

/**
 * A fake Payhip that honours ONLY the documented `limit` and `offset` query
 * parameters. An out-of-range value is refused rather than corrected.
 */
function fakePayhip(total: number) {
  const sent: { limit: number; offset: number }[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (path !== '/coupons') throw Object.assign(new Error(`unexpected ${path}`), { status: 404 })
    const p = config?.params ?? {}
    const limit = p['limit'] === undefined ? DEFAULT : p['limit']
    const offset = p['offset'] === undefined ? 0 : p['offset']
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX) {
      throw Object.assign(new Error(`limit out of range: ${String(limit)}`), { status: 422 })
    }
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      throw Object.assign(new Error(`offset out of range: ${String(offset)}`), { status: 422 })
    }
    sent.push({ limit, offset })
    const rows = Array.from({ length: total }, (_, i) => ({
      id: i + 1,
      code: `CODE${i + 1}`,
      coupon_type: 'multi',
      percent_off: 10,
      amount_off: null,
      start_date: null,
      end_date: null,
      usage_limit: null,
      notes: null,
    }))
    return { data: { data: { coupons: rows.slice(offset, offset + limit) } } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
  return { sent }
}

const adapter = () => new PayhipAdapter()

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

afterEach(() => vi.restoreAllMocks())

describe('payhip listDiscounts paging', () => {
  it.each([10, 7])(
    'N = 2L + 1 rows driven like the sync (limit %i) serve every id once, in order, with exact hasMore',
    async (limit) => {
      const n = 2 * limit + 1
      fakePayhip(n)
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const k of [1, 2, 3]) {
        const params = withPageSink({ page: k, limit })
        seen.push(...(await adapter().listDiscounts(CREDS, params)).map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids(1, n))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('page 2 sends offset = (page - 1) * limit with the caller limit', async () => {
    const { sent } = fakePayhip(50)
    const rows = await adapter().listDiscounts(CREDS, withPageSink({ page: 2, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(ids(11, 10))
    expect(sent).toEqual([{ limit: 10, offset: 10 }])
  })

  it('a limit above the 100-row maximum is clamped and still serves every row', async () => {
    const limit = 250
    const n = 2 * MAX + 1
    const { sent } = fakePayhip(n)
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit })
      const page = (await adapter().listDiscounts(CREDS, params)).map((r) => r.id)
      expect(effectivePageSize(params, limit)).toBe(MAX)
      expect(page.length).toBeLessThanOrEqual(MAX)
      seen.push(...page)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, n))
    expect(sent).toEqual([
      { limit: MAX, offset: 0 },
      { limit: MAX, offset: MAX },
      { limit: MAX, offset: 2 * MAX },
    ])
  })

  it('declares the documented 100-row maximum', () => {
    expect(adapter().capabilities.maxPageSize).toBe(MAX)
  })

  it('the API path (parseListQuery then listPage) reports meta.hasMore', async () => {
    fakePayhip(25)
    const a = adapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, a as EcommerceAdapter)
    const env2 = listPage(await a.listDiscounts(CREDS, p2), p2, 'payhip')
    expect(env2.data.map((r) => r.id)).toEqual(ids(11, 10))
    expect(env2.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: '10' }, a as EcommerceAdapter)
    const env3 = listPage(await a.listDiscounts(CREDS, p3), p3, 'payhip')
    expect(env3.data.map((r) => r.id)).toEqual(ids(21, 5))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('an API-path request with no limit is clamped to the maximum', async () => {
    const { sent } = fakePayhip(150)
    const a = adapter()
    const p = parseListQuery({}, a as EcommerceAdapter)
    const env = listPage(await a.listDiscounts(CREDS, p), p, 'payhip')
    expect(env.data.map((r) => r.id)).toEqual(ids(1, MAX))
    expect(env.meta.hasMore).toBe(true)
    expect(sent).toEqual([{ limit: MAX, offset: 0 }])
  })

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['non-finite', Number.NaN],
  ] as const)('a %s limit falls back to the documented default of 10', async (_label, limit) => {
    const { sent } = fakePayhip(50)
    const params = withPageSink({ page: 2, limit })
    const rows = await adapter().listDiscounts(CREDS, params)
    expect(sent).toEqual([{ limit: DEFAULT, offset: DEFAULT }])
    expect(rows.map((r) => r.id)).toEqual(ids(DEFAULT + 1, DEFAULT))
    expect(readUpstreamPage(params)?.pageSize).toBe(DEFAULT)
  })
})
