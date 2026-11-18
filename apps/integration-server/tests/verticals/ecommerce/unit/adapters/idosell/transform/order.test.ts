/**
 * Shape verified against the raw OpenAPI fragment embedded in
 * https://idosell.readme.io/reference/ordersordersget (`Results[]` —
 * `clientResult` / `orderDetails`) and
 * https://idosell.readme.io/reference/ordersorderssearchpost (paginated
 * search, same object shape). `orderStatus`'s fixed enum comes from
 * https://idosell.readme.io/reference/ordersordersput.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrderStatus,
  type RawIdosellOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/idosell/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawIdosellOrder> = {}): RawIdosellOrder {
  return {
    orderId: 7001,
    orderSerialNumber: 3055,
    clientResult: {
      clientAccount: { clientId: 88, clientEmail: 'jan@example.pl', clientPhone1: '+48-22-000-0001' },
      clientBillingAddress: {
        clientStreet: 'ul. Marszalkowska 1',
        clientCity: 'Warsaw',
        clientZipCode: '00-001',
        clientCountryId: 'pl',
      },
      clientDeliveryAddress: {
        clientStreet: 'ul. Logistyczna 5',
        clientCity: 'Warsaw',
        clientZipCode: '02-001',
        clientCountryId: 'pl',
      },
    },
    orderDetails: {
      orderStatus: 'finished',
      orderAddDate: '2024-03-01 10:00:00',
      orderChangeDate: '2024-03-02 09:00:00',
      orderDispatchDate: '2024-03-03 08:00:00',
      discountCode: 'POLSKA30',
      payments: {
        orderCurrency: { currencyId: 'pln', orderProductsCost: 299.99, orderDeliveryCost: 12.0 },
      },
      productsResults: [
        {
          productId: 801,
          sizeId: 'M',
          productName: 'Zestaw do biura',
          productCode: 'BIURO-SET',
          productQuantity: 3,
          productOrderPrice: 99.99,
        },
      ],
    },
    ...overrides,
  }
}

describe('transformOrder (idosell)', () => {
  it('maps id, orderNumber, and name', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('7001')
    expect(result.orderNumber).toBe('3055')
    expect(result.name).toBe('#3055')
  })

  it('maps customerId, email, phone from clientAccount', () => {
    const result = transformOrder(makeRaw())
    expect(result.customerId).toBe('88')
    expect(result.email).toBe('jan@example.pl')
    expect(result.phone).toBe('+48-22-000-0001')
  })

  it('converts PLN amounts to minor units using the real order currency', () => {
    const result = transformOrder(makeRaw())
    expect(result.currency).toBe('PLN')
    expect(result.subtotalPrice).toEqual({ amount: 29999, currency: 'PLN' })
    expect(result.totalShipping).toEqual({ amount: 1200, currency: 'PLN' })
    expect(result.totalPrice).toEqual({ amount: 31199, currency: 'PLN' })
  })

  it('maps the unambiguous "finished" status to financialStatus PAID is NOT assumed — only canceled/payment_waiting are mapped', () => {
    // "finished" has no documented financial meaning, so it must classify as 'unknown', not be guessed.
    expect(transformOrder(makeRaw({ orderDetails: { ...makeRaw().orderDetails, orderStatus: 'finished' } })).financialStatus).toBe('unknown')
  })

  it('maps canceled to VOIDED and marks cancelledAt', () => {
    const result = transformOrder(makeRaw({ orderDetails: { ...makeRaw().orderDetails, orderStatus: 'canceled' } }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.cancelledAt).toBeDefined()
  })

  it('maps payment_waiting to financialStatus PENDING and fulfillmentStatus UNFULFILLED', () => {
    const result = transformOrder(
      makeRaw({ orderDetails: { ...makeRaw().orderDetails, orderStatus: 'payment_waiting' } }),
    )
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps line items with real quantity and price', () => {
    const result = transformOrder(makeRaw())
    const li = result.lineItems![0]!
    expect(li.id).toBe('801:M')
    expect(li.quantity).toBe(3)
    expect(li.price).toEqual({ amount: 9999, currency: 'PLN' })
  })

  it('drops a line item missing quantity or price rather than inventing one', () => {
    const result = transformOrder(
      makeRaw({
        orderDetails: {
          ...makeRaw().orderDetails,
          productsResults: [{ productId: 802, productQuantity: undefined, productOrderPrice: 10 }],
        },
      }),
    )
    expect(result.lineItems).toBeUndefined()
  })

  it('leaves currency and all money fields undefined when no order currency is reported', () => {
    const result = transformOrder(makeRaw({ orderDetails: { ...makeRaw().orderDetails, payments: undefined } }))
    expect(result.currency).toBeUndefined()
    expect(result.subtotalPrice).toBeUndefined()
    expect(result.totalPrice).toBeUndefined()
    expect(result.lineItems).toBeUndefined()
  })

  it('reports no totalPrice when only part of the total is reported, rather than counting the missing part as zero', () => {
    const base = makeRaw().orderDetails
    const result = transformOrder(
      makeRaw({
        orderDetails: {
          ...base,
          payments: { orderCurrency: { currencyId: 'pln', orderProductsCost: 299.99, orderDeliveryCost: undefined } },
        },
      }),
    )
    expect(result.subtotalPrice).toEqual({ amount: 29999, currency: 'PLN' })
    expect(result.totalShipping).toBeUndefined()
    expect(result.totalPrice).toBeUndefined()
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeRaw())
    expect(result.billingAddress?.line1).toBe('ul. Marszalkowska 1')
    expect(result.shippingAddress?.line1).toBe('ul. Logistyczna 5')
  })

  it('normalises space-separated timestamps (no offset) to strict ISO UTC', () => {
    expect(transformOrder(makeRaw()).createdAt).toBe('2024-03-01T10:00:00.000Z')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })

  it('untransformOrderStatus writes only orderId + orderStatus for PUT /orders/orders', () => {
    expect(untransformOrderStatus('7001', 'canceled')).toEqual({ orderId: '7001', orderStatus: 'canceled' })
  })
})
