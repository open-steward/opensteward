import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawGmarketOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/gmarket/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawGmarketOrder> = {}): RawGmarketOrder {
  return {
    orderNo: 'ORD-2024-001',
    buyerId: 'buyer123',
    orderDate: '2024-06-01T10:00:00.000Z',
    modifyDate: '2024-06-01T12:00:00.000Z',
    paymentStatus: 'PAID',
    deliveryStatus: 'DELIVERED',
    totalAmount: 250000,
    deliveryFee: 3000,
    discountAmount: 5000,
    currency: 'KRW',
    lineItems: [
      {
        orderItemNo: 'LI-001',
        goodsNo: 'GM-12345',
        goodsName: '삼성 갤럭시 버즈 프로',
        sellerItemCode: 'SKU-001',
        quantity: 1,
        itemPrice: 247000,
      },
    ],
    shippingAddress: {
      receiverName: '홍길동',
      addressLine1: '서울시 강남구 역삼동 123',
      city: '서울',
      province: '서울특별시',
      zipCode: '06230',
      country: 'KR',
      phone: '010-1234-5678',
    },
    buyerName: '김철수',
    buyerEmail: 'buyer@example.com',
    buyerPhone: '010-9876-5432',
    ...overrides,
  }
}

describe('transformOrder (Gmarket)', () => {
  it('maps core fields and uses orderNo as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ORD-2024-001')
    expect(result.orderNumber).toBe('ORD-2024-001')
    expect(result.currency).toBe('KRW')
    expect(result.totalPrice).toEqual({ amount: 250000, currency: 'KRW' })
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('hydrates line items with unit price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('LI-001')
    expect(li.sku).toBe('SKU-001')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 247000, currency: 'KRW' })
  })

  it('maps pricing summary fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalShipping).toEqual({ amount: 3000, currency: 'KRW' })
    expect(result.totalDiscounts).toEqual({ amount: 5000, currency: 'KRW' })
  })

  it('maps every payment and delivery status', () => {
    expect(mapFinancialStatus('PAID')).toBe('PAID')
    expect(mapFinancialStatus('WAITING')).toBe('PENDING')
    expect(mapFinancialStatus('CANCEL')).toBe('VOIDED')
    expect(mapFinancialStatus('REFUND')).toBe('REFUNDED')
    expect(mapFinancialStatus('PARTIAL_REFUND')).toBe('PARTIALLY_REFUNDED')
    expect(mapFulfillmentStatus('DELIVERED')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('SHIPPING')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('READY')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('CANCEL')).toBe('RESTOCKED')
  })

  it('extracts shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: '서울시 강남구 역삼동 123',
      line2: undefined,
      city: '서울',
      region: '서울특별시',
      postalCode: '06230',
      country: 'KR',
    })
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })

  it('sets cancelledAt and cancelReason when order is cancelled', () => {
    const result = transformOrder(
      makeOrder({
        cancelDate: '2024-06-02T10:00:00.000Z',
        cancelReason: 'Buyer requested cancellation',
      }),
    )
    expect(result.cancelledAt).toBe('2024-06-02T10:00:00.000Z')
    expect(result.cancelReason).toBe('Buyer requested cancellation')
  })
})
