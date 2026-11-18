import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  mapFulfillmentStatus,
} from '../../../../../../../src/verticals/ecommerce/adapters/rakuten/transform/fulfillment'
import type { RakutenOrder, RakutenOrderPackage } from '../../../../../../../src/verticals/ecommerce/adapters/rakuten/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makePackage(overrides: Partial<RakutenOrderPackage> = {}): RakutenOrderPackage {
  return {
    packageId: 9001,
    shippingPrice: 500,
    deliveryService: 'ヤマト運輸',
    shipInquiryNo: '1234567890123',
    detailList: [
      {
        itemDetailId: 111,
        itemName: 'テスト商品',
        units: 2,
        price: 3000,
      },
    ],
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RakutenOrder> = {}): RakutenOrder {
  return {
    orderNumber: 'ORD-20240115-001',
    orderProgress: 400,
    totalPrice: 6500,
    postagePrice: 500,
    packageList: [makePackage()],
    orderDatetime: '2024-01-15T09:00:00+09:00',
    lastupdateDatetime: '2024-01-16T14:00:00+09:00',
    ...overrides,
  }
}

describe('transformFulfillments (Rakuten)', () => {
  it('creates one fulfillment per package', () => {
    const order = makeOrder({
      packageList: [
        makePackage({ packageId: 9001 }),
        makePackage({ packageId: 9002, shipInquiryNo: '9999999999' }),
      ],
    })
    const result = transformFulfillments(order)
    expect(result).toHaveLength(2)
  })

  it('id format is orderNumber:packageId', () => {
    const result = transformFulfillments(makeOrder())
    expect(result[0]!.id).toBe('ORD-20240115-001:9001')
  })

  it('sets orderId to orderNumber', () => {
    const result = transformFulfillments(makeOrder())
    expect(result[0]!.orderId).toBe('ORD-20240115-001')
  })

  it('maps orderProgress 400 to SUCCESS status', () => {
    const result = transformFulfillments(makeOrder({ orderProgress: 400 }))
    expect(result[0]!.status).toBe('SUCCESS')
  })

  it('maps orderProgress 100 to PENDING status', () => {
    const result = transformFulfillments(makeOrder({ orderProgress: 100 }))
    expect(result[0]!.status).toBe('PENDING')
  })

  it('maps orderProgress 300 to OPEN status', () => {
    const result = transformFulfillments(makeOrder({ orderProgress: 300 }))
    expect(result[0]!.status).toBe('OPEN')
  })

  it('maps orderProgress 500 to CANCELLED', () => {
    const result = transformFulfillments(makeOrder({ orderProgress: 500 }))
    expect(result[0]!.status).toBe('CANCELLED')
  })

  it('maps trackingNumber from shipInquiryNo', () => {
    const result = transformFulfillments(makeOrder())
    expect(result[0]!.trackingNumber).toBe('1234567890123')
  })

  it('maps carrier from deliveryService', () => {
    const result = transformFulfillments(makeOrder())
    expect(result[0]!.carrier).toBe('ヤマト運輸')
  })

  it('maps line items from detailList', () => {
    const result = transformFulfillments(makeOrder())
    expect(result[0]!.lineItems).toHaveLength(1)
    expect(result[0]!.lineItems![0]).toMatchObject({
      lineItemId: '111',
      quantity: 2,
    })
  })

  it('sets shippedAt when order is shipped (400+)', () => {
    const result = transformFulfillments(makeOrder({ orderProgress: 400 }))
    expect(result[0]!.shippedAt).toBe('2024-01-16T14:00:00+09:00')
  })

  it('does not set shippedAt for unshipped orders', () => {
    const result = transformFulfillments(makeOrder({ orderProgress: 200 }))
    expect(result[0]!.shippedAt).toBeUndefined()
  })

  it('preserves timestamps', () => {
    const result = transformFulfillments(makeOrder())
    expect(result[0]!.createdAt).toBe('2024-01-15T09:00:00+09:00')
    expect(result[0]!.updatedAt).toBe('2024-01-16T14:00:00+09:00')
  })

  it('synthesises a fulfillment when packageList is empty', () => {
    const result = transformFulfillments(makeOrder({ packageList: [] }))
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('ORD-20240115-001:0')
  })

  it('synthesises a fulfillment when packageList is absent', () => {
    const result = transformFulfillments(makeOrder({ packageList: undefined }))
    expect(result).toHaveLength(1)
  })

  it('satisfies FulfillmentSchema', () => {
    const result = transformFulfillments(makeOrder())
    expect(() => FulfillmentSchema.parse(result[0])).not.toThrow()
  })
})

describe('transformFulfillment (Rakuten)', () => {
  it('returns a single fulfillment from order + package', () => {
    const order = makeOrder()
    const pkg = makePackage()
    const result = transformFulfillment(order, pkg)
    expect(result.id).toBe('ORD-20240115-001:9001')
    expect(result.trackingNumber).toBe('1234567890123')
  })
})

describe('mapFulfillmentStatus (Rakuten)', () => {
  it('maps 100 to PENDING', () => {
    expect(mapFulfillmentStatus(100)).toBe('PENDING')
  })

  it('maps 200 to PENDING', () => {
    expect(mapFulfillmentStatus(200)).toBe('PENDING')
  })

  it('maps 300 to OPEN', () => {
    expect(mapFulfillmentStatus(300)).toBe('OPEN')
  })

  it('maps 400 to SUCCESS', () => {
    expect(mapFulfillmentStatus(400)).toBe('SUCCESS')
  })

  it('maps 500 to CANCELLED', () => {
    expect(mapFulfillmentStatus(500)).toBe('CANCELLED')
  })

  it('maps 600 to CANCELLED', () => {
    expect(mapFulfillmentStatus(600)).toBe('CANCELLED')
  })

  it('maps undefined to PENDING', () => {
    expect(mapFulfillmentStatus(undefined)).toBe('PENDING')
  })
})
