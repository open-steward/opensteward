import { describe, it, expect } from 'vitest'
import {
  mapFinancialStatus,
  mapFulfillmentStatus,
  toMoney,
  transformOrderDetail,
  transformOrderSummary,
  type RawAlibabaOrderDetail,
  type RawAlibabaOrderSummary,
} from '../../../../../../../src/verticals/ecommerce/adapters/alibaba/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import { ORDER_GET, ORDER_LIST } from '../fixtures'

const summary = ORDER_LIST.value.order_list[0] as unknown as RawAlibabaOrderSummary
const detail = ORDER_GET.value as unknown as RawAlibabaOrderDetail

describe('alibaba transformOrderSummary (documented order.list row)', () => {
  it('maps trade_id, trade_status and the epoch-ms dates and parses as an Order', () => {
    const o = OrderSchema.parse(transformOrderSummary(summary))
    expect(o.id).toBe('271207727001028893')
    expect(o.orderNumber).toBe('271207727001028893')
    // "unpay: Waiting for advance payment"
    expect(o.financialStatus).toBe('PENDING')
    expect(o.fulfillmentStatus).toBe('UNFULFILLED')
    // "Jul. 31, 2025, 21:09:36 PDT." / "timestamp": "1754021376000"
    expect(o.createdAt).toBe('2025-08-01T04:09:36.000Z')
    expect(o.updatedAt).toBe('2025-08-01T04:09:37.000Z')
    expect(o.totalPrice).toBeUndefined()
  })

  it('refuses a row without trade_id', () => {
    expect(() => transformOrderSummary({ ...summary, trade_id: undefined })).toThrow(/trade_id/)
  })
})

describe('alibaba transformOrderDetail (documented order.get value)', () => {
  it('maps amounts, lines, buyer and address and parses as an Order', () => {
    const o = OrderSchema.parse(transformOrderDetail(detail))
    expect(o.id).toBe('234193410001028893')
    expect(o.customerId).toBe('8s0vvDIbRvbS9hSAK4bUtw==')
    expect(o.currency).toBe('USD')
    expect(o.totalPrice).toEqual({ amount: 487, currency: 'USD' })
    expect(o.subtotalPrice).toEqual({ amount: 20, currency: 'USD' })
    expect(o.totalShipping).toEqual({ amount: 467, currency: 'USD' })
    expect(o.totalDiscounts).toEqual({ amount: 0, currency: 'USD' })
    expect(o.totalTax).toEqual({ amount: 100, currency: 'USD' })
    expect(o.financialStatus).toBe('PENDING')
    expect(o.createdAt).toBe(new Date(1733821832000).toISOString())
    expect(o.lineItems).toEqual([
      expect.objectContaining({
        id: '133658eea7a2b5d8e0cbb6877ec6fff0',
        productId: '1601314875038',
        variantId: '106117950042',
        sku: '1',
        title: 'yanwen combine test aliqatest',
        quantity: 2,
        price: { amount: 10, currency: 'USD' },
      }),
    ])
    expect(o.shippingAddress).toEqual({
      line1: 'Washington Square',
      line2: 'Washington Square Park',
      city: 'New york',
      region: 'New York',
      postalCode: '10012',
      country: 'US',
    })
  })

  it('omits money whose currency is missing rather than assuming one', () => {
    expect(toMoney({ amount: '4.87' })).toBeUndefined()
    expect(toMoney({ currency: 'USD' })).toBeUndefined()
    const o = OrderSchema.parse(
      transformOrderDetail({ ...detail, total_amount: { amount: '4.87' } }),
    )
    expect(o.totalPrice).toBeUndefined()
    expect(o.currency).toBeUndefined()
  })

  it('refuses a line without a name rather than inventing an empty title', () => {
    const line = { ...detail.order_products![0]!, name: undefined }
    expect(() => transformOrderDetail({ ...detail, order_products: [line] })).toThrow(/has no name/)
  })

  it('refuses a line whose quantity is not whole', () => {
    const line = { ...detail.order_products![0]!, quantity: '1.5000' }
    expect(() => transformOrderDetail({ ...detail, order_products: [line] })).toThrow(/whole/)
  })

  it('drops a country_code that is not ISO 3166-1 alpha-2', () => {
    const o = transformOrderDetail({
      ...detail,
      shipping_address: { ...detail.shipping_address, country_code: 'UK' },
    })
    expect(o.shippingAddress?.country).toBeUndefined()
  })
})

describe('alibaba trade_status (docId=131)', () => {
  it.each([
    ['to_be_audited', 'PENDING', 'UNFULFILLED'],
    ['unpay', 'PENDING', 'UNFULFILLED'],
    ['paying', 'PENDING', 'UNFULFILLED'],
    ['paid', 'PAID', 'UNFULFILLED'],
    ['captured', 'PAID', 'UNFULFILLED'],
    ['undeliver', 'PAID', 'UNFULFILLED'],
    ['delivering', 'PAID', 'FULFILLED'],
    ['wait_confirm_receipt', 'PAID', 'FULFILLED'],
    ['trade_success', 'PAID', 'FULFILLED'],
    ['trade_close', undefined, undefined],
    ['charge_back', undefined, undefined],
    ['frozen', undefined, undefined],
  ])('%s → %s / %s', (status, financial, fulfillment) => {
    expect(mapFinancialStatus(status)).toBe(financial)
    expect(mapFulfillmentStatus(status)).toBe(fulfillment)
  })
})
