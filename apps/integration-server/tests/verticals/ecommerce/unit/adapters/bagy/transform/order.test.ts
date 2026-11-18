import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawBagyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagy/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawBagyOrder> = {}): RawBagyOrder {
  return {
    id: 2000,
    number: '2000',
    Customer: {
      id: 77,
      name: 'Maria Silva',
      email: 'maria@example.com',
      cellphone: '11999990000',
    },
    status: 'aprovado',
    value: '199.90',
    value_1: '179.90',
    shipping: '20.00',
    discount: '0.00',
    taxes: '10.00',
    note: 'Entregar no período da manhã',
    date: '2024-03-01T00:00:00Z',
    modified: '2024-03-02T00:00:00Z',
    OrderProduct: [
      {
        id: 1,
        product_id: 500,
        variant_id: 501,
        name: 'Camiseta Azul',
        quantity: '2',
        price: '89.95',
        reference: 'CAM-AZL',
      },
    ],
    BillingAddress: {
      address: 'Rua das Flores 100',
      city: 'São Paulo',
      state: 'SP',
      zip: '01310-100',
      country: 'BR',
    },
    ShippingAddress: {
      address: 'Rua das Flores 100',
      city: 'São Paulo',
      state: 'SP',
      zip: '01310-100',
      country: 'BR',
    },
    ...overrides,
  }
}

describe('transformOrder (Bagy)', () => {
  it('maps id to string', () => {
    const result = transformOrder(makeOrder({ id: 9999 }))
    expect(result.id).toBe('9999')
  })

  it('maps orderNumber and name', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('2000')
    expect(result.name).toBe('#2000')
  })

  it('maps aprovado status to PAID / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'aprovado' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps enviado status to PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'enviado' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps cancelado status to VOIDED / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelado' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps novo status to PENDING / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'novo' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('hardcodes currency to BRL', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('BRL')
  })

  it('converts value to minor units', () => {
    const result = transformOrder(makeOrder({ value: '199.90' }))
    expect(result.totalPrice?.amount).toBe(19990)
  })

  it('converts shipping to minor units', () => {
    const result = transformOrder(makeOrder({ shipping: '20.00' }))
    expect(result.totalShipping?.amount).toBe(2000)
  })

  it('maps customerId from Customer.id', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('77')
  })

  it('maps email from Customer.email', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('maria@example.com')
  })

  it('maps phone from Customer.cellphone', () => {
    const result = transformOrder(makeOrder())
    expect(result.phone).toBe('11999990000')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.title).toBe('Camiseta Azul')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('converts line item price to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0]!.price.amount).toBe(8995)
  })

  it('maps line item sku from reference', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0]!.sku).toBe('CAM-AZL')
  })

  it('maps billingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('Rua das Flores 100')
    expect(result.billingAddress?.country).toBe('BR')
  })

  it('maps note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Entregar no período da manhã')
  })

  it('stores raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (Bagy)', () => {
  it('maps note', () => {
    const body = untransformOrder({ note: 'Ring doorbell' })
    expect(body.note).toBe('Ring doorbell')
  })

  it('maps line items', () => {
    const body = untransformOrder({
      lineItems: [
        {
          id: '1',
          productId: '500',
          variantId: '501',
          title: 'Widget',
          quantity: 2,
          price: { amount: 8995, currency: 'BRL' },
          metadata: {},
        },
      ],
    })
    const items = body.OrderProduct as Array<Record<string, unknown>>
    expect(items[0]!.product_id).toBe('500')
    expect(items[0]!.quantity).toBe(2)
    expect(items[0]!.price).toBe('89.95')
  })
})
