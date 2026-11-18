import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopwareB2BOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware-b2b/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawShopwareB2BOrder> = {}): RawShopwareB2BOrder {
  return {
    id: 'order-b2b-001',
    orderNumber: '20001',
    orderCustomer: {
      customerId: 'cust-b2b-001',
      email: 'einkauf@acme-gmbh.de',
      firstName: 'Max',
      lastName: 'Mustermann',
      company: 'ACME GmbH',
    },
    currency: { isoCode: 'EUR', shortName: 'EUR' },
    amountTotal: 4250.00,
    amountNet: 3571.43,
    shippingTotal: 0,
    positionPrice: 4250.00,
    stateMachineState: { technicalName: 'open', name: 'Open' },
    lineItems: [
      {
        id: 'li-1',
        productId: 'prod-1',
        referencedId: 'prod-1',
        label: 'Industrial Safety Helmet x100',
        quantity: 100,
        unitPrice: 42.50,
        totalPrice: 4250.00,
        type: 'product',
        payload: { productNumber: 'B2B-SW-1001' },
      },
    ],
    transactions: [
      {
        id: 'tx-1',
        amount: { totalPrice: 4250.00 },
        stateMachineState: { technicalName: 'open', name: 'Open' },
        paymentMethod: { name: 'Invoice (Net 30)', id: 'pm-1' },
      },
    ],
    deliveries: [
      {
        id: 'del-1',
        trackingCodes: [],
        stateMachineState: { technicalName: 'open', name: 'Open' },
        shippingMethod: { name: 'B2B Freight' },
        shippingOrderAddress: {
          street: 'Industriestrasse 10',
          zipcode: '70173',
          city: 'Stuttgart',
          country: { iso: 'DE' },
        },
      },
    ],
    billingAddress: {
      street: 'Industriestrasse 10',
      zipcode: '70173',
      city: 'Stuttgart',
      country: { iso: 'DE' },
    },
    createdAt: '2024-05-01T10:00:00+00:00',
    updatedAt: '2024-05-01T12:00:00+00:00',
    ...overrides,
  }
}

describe('transformOrder (Shopware B2B)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-b2b-001')
    expect(result.orderNumber).toBe('20001')
    expect(result.name).toBe('#20001')
    expect(result.customerId).toBe('cust-b2b-001')
    expect(result.email).toBe('einkauf@acme-gmbh.de')
    expect(result.currency).toBe('EUR')
    expect(result.totalPrice).toEqual({ amount: 425000, currency: 'EUR' })
  })

  it('maps financial status PENDING for open payment', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps fulfillment status UNFULFILLED for open delivery', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps B2B line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.quantity).toBe(100)
    expect(li.price).toEqual({ amount: 4250, currency: 'EUR' })
    expect(li.sku).toBe('B2B-SW-1001')
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: 'Industriestrasse 10',
      city: 'Stuttgart',
      postalCode: '70173',
      country: 'DE',
    })
  })

  it('covers payment state mappings', () => {
    const cases: Array<[string, string]> = [
      ['open', 'PENDING'],
      ['authorized', 'AUTHORIZED'],
      ['paid', 'PAID'],
      ['paid_partially', 'PARTIALLY_PAID'],
      ['refunded', 'REFUNDED'],
      ['refunded_partially', 'PARTIALLY_REFUNDED'],
      ['cancelled', 'VOIDED'],
    ]
    for (const [state, expected] of cases) {
      const r = transformOrder(
        makeOrder({
          transactions: [
            { id: 'tx-1', stateMachineState: { technicalName: state } },
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
            { id: 'del-1', stateMachineState: { technicalName: state } },
          ],
        }),
      )
      expect(r.fulfillmentStatus).toBe(expected)
    }
  })

  it('sets cancelledAt when order is cancelled', () => {
    const result = transformOrder(
      makeOrder({
        stateMachineState: { technicalName: 'cancelled' },
        transactions: [],
      }),
    )
    expect(result.cancelledAt).toBe('2024-05-01T12:00:00+00:00')
  })

  it('preserves company in metadata and validates', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    const meta = result.metadata as Record<string, unknown>
    const oc = meta['orderCustomer'] as Record<string, unknown>
    expect(oc['company']).toBe('ACME GmbH')
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (Shopware B2B)', () => {
  it('maps writable fields', () => {
    const body = untransformOrder({
      orderNumber: '20001',
      note: 'Deliver to loading dock B',
    })
    expect(body['customerComment']).toBe('Deliver to loading dock B')
  })
})
