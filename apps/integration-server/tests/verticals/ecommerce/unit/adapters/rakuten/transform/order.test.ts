import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RakutenOrder,
  type RakutenOrderPackage,
  type RakutenOrderItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/rakuten/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrderItem(overrides: Partial<RakutenOrderItem> = {}): RakutenOrderItem {
  return {
    itemDetailId: 111,
    itemName: 'Wireless Headphones',
    itemId: 'my-shop/wireless-headphones',
    manageNumber: 'HDR-001',
    units: 2,
    price: 9800,
    ...overrides,
  }
}

function makePackage(overrides: Partial<RakutenOrderPackage> = {}): RakutenOrderPackage {
  return {
    packageId: 9001,
    shippingPrice: 500,
    deliveryService: 'ヤマト運輸',
    shipInquiryNo: '1234567890123',
    detailList: [makeOrderItem()],
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RakutenOrder> = {}): RakutenOrder {
  return {
    orderNumber: 'AAABBBCCC-20240115-1234567',
    orderProgress: 200,
    totalPrice: 20100,
    postagePrice: 500,
    ordererInfo: {
      ordererName: '田中 太郎',
      ordererNameKana: 'タナカ タロウ',
      ordererZipCode: '150-0001',
      ordererPrefecture: '東京都',
      ordererAddress: '渋谷区神宮前1-1-1',
      ordererPhoneNumber1: '03-1234-5678',
      ordererMailAddress: 'taro.tanaka@example.com',
    },
    deliveryInfo: {
      deliveryName: '田中 花子',
      deliveryZipCode: '160-0022',
      deliveryPrefecture: '東京都',
      deliveryAddress: '新宿区新宿2-2-2',
      deliveryPhoneNumber1: '03-9876-5432',
    },
    settlementInfo: {
      settlementMethod: 'クレジットカード',
    },
    packageList: [makePackage()],
    orderDatetime: '2024-01-15T09:30:00+09:00',
    lastupdateDatetime: '2024-01-15T09:35:00+09:00',
    ...overrides,
  }
}

describe('transformOrder (Rakuten)', () => {
  it('uses orderNumber as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('AAABBBCCC-20240115-1234567')
    expect(result.orderNumber).toBe('AAABBBCCC-20240115-1234567')
  })

  it('sets currency to JPY', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('JPY')
  })

  it('maps totalPrice to canonical totalPrice', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 20100, currency: 'JPY' })
  })

  it('maps postagePrice to totalShipping', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'JPY' })
  })

  it('maps email from ordererInfo', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('taro.tanaka@example.com')
  })

  it('maps phone from ordererInfo', () => {
    const result = transformOrder(makeOrder())
    expect(result.phone).toBe('03-1234-5678')
  })

  it('extracts line items from packageList', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.title).toBe('Wireless Headphones')
    expect(result.lineItems![0]!.quantity).toBe(2)
    expect(result.lineItems![0]!.price).toEqual({ amount: 9800, currency: 'JPY' })
  })

  it('maps line item id from itemDetailId', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0]!.id).toBe('111')
  })

  it('maps line item productId from itemId', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0]!.productId).toBe('my-shop/wireless-headphones')
  })

  it('maps line item sku from manageNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0]!.sku).toBe('HDR-001')
  })

  it('maps shipping address from deliveryInfo', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toMatchObject({
      line1: '新宿区新宿2-2-2',
      postalCode: '160-0022',
      region: '東京都',
      country: 'JP',
    })
  })

  it('maps billing address from ordererInfo', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: '渋谷区神宮前1-1-1',
      postalCode: '150-0001',
      region: '東京都',
      country: 'JP',
    })
  })

  it('preserves timestamps as-is', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-01-15T09:30:00+09:00')
    expect(result.updatedAt).toBe('2024-01-15T09:35:00+09:00')
  })

  it('sets cancelledAt when order is cancelled', () => {
    const result = transformOrder(makeOrder({ orderProgress: 500, lastupdateDatetime: '2024-02-01T10:00:00+09:00' }))
    expect(result.cancelledAt).toBe('2024-02-01T10:00:00+09:00')
  })

  it('does not set cancelledAt for non-cancelled orders', () => {
    const result = transformOrder(makeOrder({ orderProgress: 200 }))
    expect(result.cancelledAt).toBeUndefined()
  })

  it('aggregates items from multiple packages', () => {
    const order = makeOrder({
      packageList: [
        makePackage({ packageId: 9001, detailList: [makeOrderItem({ itemDetailId: 1, units: 1 })] }),
        makePackage({ packageId: 9002, detailList: [makeOrderItem({ itemDetailId: 2, units: 3 })] }),
      ],
    })
    const result = transformOrder(order)
    expect(result.lineItems).toHaveLength(2)
  })

  it('handles order with no packageList', () => {
    const result = transformOrder(makeOrder({ packageList: undefined }))
    expect(result.lineItems).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata['orderNumber']).toBe('AAABBBCCC-20240115-1234567')
    expect(result.metadata['orderProgress']).toBe(200)
  })

  it('satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('mapFinancialStatus (Rakuten)', () => {
  it('maps 100 to PENDING', () => {
    expect(mapFinancialStatus(100)).toBe('PENDING')
  })

  it('maps 200 to PAID', () => {
    expect(mapFinancialStatus(200)).toBe('PAID')
  })

  it('maps 300 to PAID', () => {
    expect(mapFinancialStatus(300)).toBe('PAID')
  })

  it('maps 400 to PAID', () => {
    expect(mapFinancialStatus(400)).toBe('PAID')
  })

  it('maps 500 to REFUNDED', () => {
    expect(mapFinancialStatus(500)).toBe('REFUNDED')
  })

  it('maps 600 to REFUNDED', () => {
    expect(mapFinancialStatus(600)).toBe('REFUNDED')
  })

  it('maps 700 to PENDING', () => {
    expect(mapFinancialStatus(700)).toBe('PENDING')
  })

  it('maps undefined to undefined', () => {
    expect(mapFinancialStatus(undefined)).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (Rakuten)', () => {
  it('maps 100 to UNFULFILLED', () => {
    expect(mapFulfillmentStatus(100)).toBe('UNFULFILLED')
  })

  it('maps 200 to UNFULFILLED', () => {
    expect(mapFulfillmentStatus(200)).toBe('UNFULFILLED')
  })

  it('maps 300 to PARTIAL', () => {
    expect(mapFulfillmentStatus(300)).toBe('PARTIAL')
  })

  it('maps 400 to FULFILLED', () => {
    expect(mapFulfillmentStatus(400)).toBe('FULFILLED')
  })

  it('maps 500 to RESTOCKED', () => {
    expect(mapFulfillmentStatus(500)).toBe('RESTOCKED')
  })

  it('maps 600 to RESTOCKED', () => {
    expect(mapFulfillmentStatus(600)).toBe('RESTOCKED')
  })

  it('maps undefined to undefined', () => {
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
  })
})
