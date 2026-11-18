/**
 * Coupang reads stock one option at a time: GET .../marketplace/vendor-items/
 * {vendorItemId}/inventories returns `data{sellerItemId, amountInStock,
 * salePrice, onSale}` (https://developers.coupang.com/en/api/products/query-quantitypricestatus-by-product-items).
 * The options are `data.items[].vendorItemId` of GET .../seller-products/
 * {sellerProductId} ("This value will be null if item is temporarily saved"),
 * and the product's `outboundShippingPlaceCode` is the stock's location
 * (https://developers.coupang.com/en/api/products/querying-product). The
 * products come from the seller-product list's `nextToken` chain, whose
 * `maxPerPage` is "Default: 10, Max.:100".
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { CoupangAdapter } from '../../../../../../src/verticals/ecommerce/adapters/coupang/index'
import { InventoryLevelSchema } from '../../../../../../src/verticals/ecommerce/schema/inventory'
import { CREDS, fakeCoupang, offsetOf, tokenFor, type Handler } from './fake'

const LIST = /^\/v2\/providers\/seller_api\/apis\/api\/v1\/marketplace\/seller-products$/
const DETAIL = /^\/v2\/providers\/seller_api\/apis\/api\/v1\/marketplace\/seller-products\/(\d+)$/
const STOCK =
  /^\/v2\/providers\/seller_api\/apis\/api\/v1\/marketplace\/vendor-items\/(\d+)\/inventories$/

/** Approved options per product id; every other product has one temporarily saved option. */
const OPTIONS: Record<number, number[]> = {
  1: [1001, 1002],
  2: [2001],
  50: [50001, 50002],
  101: [101001],
  102: [102001],
}
const PRODUCTS = 102
const EXPECTED = ['1001', '1002', '2001', '50001', '50002', '101001', '102001'].map(
  (v) => `${v}:74010`,
)

function routes(place: number | null = 74010): Array<[RegExp, Handler]> {
  return [
    [
      LIST,
      (params) => {
        const size = Number(params['maxPerPage'] ?? 10)
        if (size > 100) throw new Error('maxPerPage Max.:100')
        const start = offsetOf(params['nextToken'])
        const end = Math.min(start + size, PRODUCTS)
        const data = []
        for (let i = start; i < end; i++)
          data.push({ sellerProductId: i + 1, sellerProductName: `P${i + 1}` })
        return {
          code: 'SUCCESS',
          message: '',
          nextToken: end < PRODUCTS ? tokenFor(end) : '',
          data,
        }
      },
    ],
    [
      DETAIL,
      (_params, path) => {
        const id = Number(DETAIL.exec(path)![1])
        const approved = OPTIONS[id] ?? []
        return {
          code: 'SUCCESS',
          message: '',
          data: {
            sellerProductId: id,
            outboundShippingPlaceCode: place,
            items: [
              ...approved.slice(0, 1).map((v) => ({ vendorItemId: v, itemName: `o${v}` })),
              { vendorItemId: null, itemName: 'temporarily saved' },
              ...approved.slice(1).map((v) => ({ vendorItemId: v, itemName: `o${v}` })),
            ],
          },
        }
      },
    ],
    [
      STOCK,
      (_params, path) => {
        const v = Number(STOCK.exec(path)![1])
        return {
          code: 'SUCCESS',
          message: '',
          data: { sellerItemId: v, amountInStock: v % 7, salePrice: 1000, onSale: true },
        }
      },
    ],
  ]
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('Coupang listInventoryLevels', () => {
  it('walks 2L+1 levels over uneven products and two list pages, each once, hasMore exact', async () => {
    const calls = fakeCoupang(routes())
    const adapter = new CoupangAdapter()
    const ids: string[] = []
    const sizes: number[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 3 })
      const rows = await adapter.listInventoryLevels(CREDS, params)
      for (const r of rows) InventoryLevelSchema.parse(r)
      ids.push(...rows.map((r) => r.id))
      sizes.push(rows.length)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(EXPECTED)
    expect(sizes).toEqual([3, 3, 1])
    expect(hasMore).toEqual([true, true, false])
    const listCalls = calls.filter((c) => LIST.test(c.path))
    expect(listCalls.every((c) => c.params['maxPerPage'] === 100)).toBe(true)
    expect(listCalls.some((c) => c.params['nextToken'] === tokenFor(100))).toBe(true)
    // A temporarily saved option (vendorItemId null) has no stock read.
    expect(calls.filter((c) => STOCK.test(c.path)).map((c) => STOCK.exec(c.path)![1])).toEqual(
      EXPECTED.map((id) => id.split(':')[0]),
    )
  })

  it('reads amountInStock as available at the product location', async () => {
    fakeCoupang(routes())
    const [first] = await new CoupangAdapter().listInventoryLevels(
      CREDS,
      withPageSink({ page: 1, limit: 1 }),
    )
    expect(first).toMatchObject({
      id: '1001:74010',
      variantId: '1001',
      locationId: '74010',
      available: 1001 % 7,
    })
  })

  it('throws for approved options whose product has no outboundShippingPlaceCode', async () => {
    fakeCoupang(routes(null))
    await expect(
      new CoupangAdapter().listInventoryLevels(CREDS, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(/outboundShippingPlaceCode/)
  })
})

describe('Coupang getInventoryLevel', () => {
  it('reads the stock of the option in the id listInventoryLevels returns', async () => {
    const calls = fakeCoupang(routes())
    const level = await new CoupangAdapter().getInventoryLevel(CREDS, '1001:74010')
    expect(InventoryLevelSchema.parse(level).id).toBe('1001:74010')
    expect(calls.map((c) => c.path)).toEqual([
      '/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/1001/inventories',
    ])
  })

  it('rejects an id without a location and sends nothing', async () => {
    const calls = fakeCoupang(routes())
    await expect(new CoupangAdapter().getInventoryLevel(CREDS, '1001:')).rejects.toMatchObject({
      statusCode: 400,
    })
    await expect(new CoupangAdapter().getInventoryLevel(CREDS, '1001')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(calls).toHaveLength(0)
  })
})
