/**
 * Coupang lists instant-discount coupons at GET /v2/providers/fms/apis/api/v2/
 * vendors/{vendorId}/coupons: `status*` is one of "STANDBY, APPLIED, PAUSED,
 * EXPIRED, DETACHED", `page` is "1 by default", `size` is "# of results per
 * page", and the response is `data{success, content[], Pagination[]}`, shown
 * in the example as `"pagination": {currentPage, countPerPage, totalPages,
 * totalElements}`
 * (https://developers.coupang.com/en/api/promotions/instant-discount-coupon-query-a-list-of-coupons-status).
 * One coupon: GET .../vendors/{vendorId}/coupon?couponId=
 * (https://developers.coupang.com/en/api/promotions/instant-discount-coupon-query-one-coupon-couponid).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { CoupangAdapter } from '../../../../../../src/verticals/ecommerce/adapters/coupang/index'
import { DiscountSchema } from '../../../../../../src/verticals/ecommerce/schema/discount'
import { CREDS, fakeCoupang } from './fake'
import { couponExample } from './fixtures'

const LIST = /^\/v2\/providers\/fms\/apis\/api\/v2\/vendors\/A00012345\/coupons$/
const ONE = /^\/v2\/providers\/fms\/apis\/api\/v2\/vendors\/A00012345\/coupon$/
const COUNTS: Record<string, number> = {
  STANDBY: 2,
  APPLIED: 0,
  PAUSED: 4,
  EXPIRED: 1,
  DETACHED: 0,
}
const EXPECTED = [
  'STANDBY-1',
  'STANDBY-2',
  'PAUSED-1',
  'PAUSED-2',
  'PAUSED-3',
  'PAUSED-4',
  'EXPIRED-1',
]

let nextCoupon = 0
const idOf = new Map<number, string>()

function fake(shape: 'example' | 'table' | 'none' = 'example') {
  idOf.clear()
  nextCoupon = 0
  const byStatus: Record<string, number[]> = {}
  for (const [status, n] of Object.entries(COUNTS)) {
    byStatus[status] = Array.from({ length: n }, (_, i) => {
      const id = ++nextCoupon
      idOf.set(id, `${status}-${i + 1}`)
      return id
    })
  }
  return fakeCoupang([
    [
      LIST,
      (params) => {
        for (const k of Object.keys(params)) {
          if (!['status', 'page', 'size', 'sort'].includes(k))
            throw new Error(`undocumented parameter ${k}`)
        }
        const ids = byStatus[String(params['status'])]
        if (!ids) throw new Error(`status is required (got ${String(params['status'])})`)
        const page = params['page'] === undefined ? 1 : Number(params['page'])
        const size = Number(params['size'])
        const content = ids
          .slice((page - 1) * size, page * size)
          .map((couponId) => ({ ...couponExample(), couponId, status: String(params['status']) }))
        const pagination = {
          currentPage: page,
          countPerPage: size,
          totalPages: Math.ceil(ids.length / size),
          totalElements: ids.length,
        }
        const data: Record<string, unknown> = { success: true, content }
        if (shape === 'example') data['pagination'] = pagination
        if (shape === 'table') data['Pagination'] = [pagination]
        return {
          code: 200,
          message: 'OK',
          httpStatus: 200,
          httpStatusMessage: 'OK',
          errorMessage: '',
          data,
        }
      },
    ],
    [
      ONE,
      (params) => ({
        code: 200,
        message: 'OK',
        data: {
          success: true,
          content: { ...couponExample(), couponId: Number(params['couponId']) },
          pagination: null,
        },
      }),
    ],
  ])
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

async function walk(): Promise<{
  ids: string[]
  sizes: number[]
  hasMore: (boolean | undefined)[]
}> {
  const adapter = new CoupangAdapter()
  const ids: string[] = []
  const sizes: number[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let page = 1; page <= 3; page++) {
    const params = withPageSink({ page, limit: 3 })
    const rows = await adapter.listDiscounts(CREDS, params)
    for (const r of rows) DiscountSchema.parse(r)
    ids.push(...rows.map((r) => idOf.get(Number(r.id))!))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, sizes, hasMore }
}

describe('Coupang listDiscounts', () => {
  it('walks every documented status by page, 2L+1 coupons each once, hasMore exact', async () => {
    const calls = fake()
    const r = await walk()
    expect(r.ids).toEqual(EXPECTED)
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
    expect(calls.map((c) => `${String(c.params['status'])}:${String(c.params['page'])}`)).toEqual([
      'STANDBY:1',
      'APPLIED:1',
      'PAUSED:1',
      'PAUSED:2',
      'EXPIRED:1',
      'DETACHED:1',
    ])
    expect(calls.every((c) => c.params['size'] === 3)).toBe(true)
  })

  it('reads the Pagination array the field table documents as well as the example object', async () => {
    fake('table')
    expect((await walk()).ids).toEqual(EXPECTED)
  })

  it('throws when the response carries no pagination instead of guessing the end', async () => {
    fake('none')
    await expect(
      new CoupangAdapter().listDiscounts(CREDS, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(/Pagination/)
  })
})

describe('Coupang getDiscount', () => {
  it('reads one coupon by couponId', async () => {
    const calls = fake()
    const d = DiscountSchema.parse(await new CoupangAdapter().getDiscount(CREDS, '91'))
    expect(d.id).toBe('91')
    expect(calls).toEqual([
      {
        path: '/v2/providers/fms/apis/api/v2/vendors/A00012345/coupon',
        params: { couponId: '91' },
      },
    ])
  })
})
