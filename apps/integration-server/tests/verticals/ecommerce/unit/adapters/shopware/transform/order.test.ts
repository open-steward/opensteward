import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopwareOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawShopwareOrder> = {}): RawShopwareOrder {
  return {
    id: 'order-abc123',
    orderNumber: '10001',
    orderCustomer: {
      customerId: 'cust-001',
      email: 'hans@example.de',
      firstName: 'Hans',
      lastName: 'Mueller',
    },
    currency: { isoCode: 'EUR', shortName: 'EUR' },
    amountTotal: 59.98,
    amountNet: 50.40,
    shippingTotal: 4.99,
    positionPrice: 54.99,
    stateMachineState: { technicalName: 'open', name: 'Open' },
    lineItems: [
      {
        id: 'li-1',
        productId: 'prod-1',
        referencedId: 'prod-1',
        label: 'Ocean Blue T-Shirt',
        quantity: 2,
        unitPrice: 29.99,
        totalPrice: 59.98,
        type: 'product',
        payload: { productNumber: 'SW-1001' },
      },
    ],
    transactions: [
      {
        id: 'tx-1',
        amount: { totalPrice: 59.98 },
        stateMachineState: { technicalName: 'paid', name: 'Paid' },
        paymentMethod: { name: 'Invoice', id: 'pm-1' },
      },
    ],
    deliveries: [
      {
        id: 'del-1',
        trackingCodes: ['DHL-123456'],
        stateMachineState: { technicalName: 'shipped', name: 'Shipped' },
        shippingMethod: { name: 'DHL Standard' },
        shippingOrderAddress: {
          street: 'Hauptstrasse 42',
          zipcode: '10115',
          city: 'Berlin',
          country: { iso: 'DE' },
        },
      },
    ],
    billingAddress: {
      street: 'Hauptstrasse 42',
      zipcode: '10115',
      city: 'Berlin',
      country: { iso: 'DE' },
    },
    createdAt: '2024-05-01T10:00:00+00:00',
    updatedAt: '2024-05-01T12:00:00+00:00',
    ...overrides,
  }
}

describe('transformOrder (Shopware)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-abc123')
    expect(result.orderNumber).toBe('10001')
    expect(result.name).toBe('#10001')
    expect(result.customerId).toBe('cust-001')
    expect(result.email).toBe('hans@example.de')
    expect(result.currency).toBe('EUR')
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'EUR' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'EUR' })
  })

  it('maps financial status from transaction payment state', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps fulfillment status from delivery state', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-1')
    expect(li.productId).toBe('prod-1')
    expect(li.title).toBe('Ocean Blue T-Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'EUR' })
    expect(li.sku).toBe('SW-1001')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: 'Hauptstrasse 42',
      city: 'Berlin',
      postalCode: '10115',
      country: 'DE',
    })
    expect(result.shippingAddress).toMatchObject({
      line1: 'Hauptstrasse 42',
      city: 'Berlin',
      country: 'DE',
    })
  })

  it('covers payment state mappings', () => {
    const cases: Array<[string, string]> = [
      ['open', 'PENDING'],
      ['reminded', 'PENDING'],
      ['authorized', 'AUTHORIZED'],
      ['paid', 'PAID'],
      ['paid_partially', 'PARTIALLY_PAID'],
      ['refunded', 'REFUNDED'],
      ['refunded_partially', 'PARTIALLY_REFUNDED'],
      ['cancelled', 'VOIDED'],
      ['failed', 'VOIDED'],
    ]
    for (const [state, expected] of cases) {
      const r = transformOrder(
        makeOrder({
          transactions: [
            {
              id: 'tx-1',
              stateMachineState: { technicalName: state },
            },
          ],
        }),
      )
      expect(r.financialStatus).toBe(expected)
    }
  })

  it('covers delivery state mappings', () => {
    const cases: Array<[string, string]> = [
      ['open', 'UNFULFILLED'],
      ['shipped', 'FULFILLED'],
      ['shipped_partially', 'PARTIAL'],
      ['returned', 'RESTOCKED'],
      ['cancelled', 'UNFULFILLED'],
    ]
    for (const [state, expected] of cases) {
      const r = transformOrder(
        makeOrder({
          deliveries: [
            {
              id: 'del-1',
              stateMachineState: { technicalName: state },
            },
          ],
        }),
      )
      expect(r.fulfillmentStatus).toBe(expected)
    }
  })

  it('sets cancelledAt when order state is cancelled', () => {
    const result = transformOrder(
      makeOrder({
        stateMachineState: { technicalName: 'cancelled' },
        transactions: [],
      }),
    )
    expect(result.cancelledAt).toBe('2024-05-01T12:00:00+00:00')
  })

  it('preserves raw payload in metadata and validates against OrderSchema', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (Shopware)', () => {
  it('maps writable fields', () => {
    const body = untransformOrder({
      orderNumber: '10001',
      note: 'Please wrap as gift',
    })
    expect(body['orderNumber']).toBe('10001')
    expect(body['customerComment']).toBe('Please wrap as gift')
  })
})
