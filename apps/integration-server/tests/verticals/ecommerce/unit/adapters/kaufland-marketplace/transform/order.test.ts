import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  transformOrderUnit,
  type RawKauflandOrder,
  type RawKauflandOrderUnit,
} from '../../../../../../../src/verticals/ecommerce/adapters/kaufland-marketplace/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrderUnit(overrides: Partial<RawKauflandOrderUnit> = {}): RawKauflandOrderUnit {
  return {
    id_order_unit: 8001,
    id_order: 'KL-ORD-1',
    status: 'sent',
    price: 2999,
    shipping_rate: 499,
    currency: 'EUR',
    buyer: { id_buyer: 55, email: 'jane@example.com' },
    billing_address: {
      street: 'Hauptstrasse',
      house_number: '1',
      city: 'Hamburg',
      postcode: '20095',
      country: 'DE',
    },
    shipping_address: {
      street: 'Nebenstrasse',
      house_number: '2',
      city: 'Hamburg',
      postcode: '20095',
      country: 'DE',
    },
    product: { id_product: 111, title: 'Widget', eans: ['1234567890123'] },
    ts_created_iso: '2024-03-01T00:00:00Z',
    ts_updated_iso: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawKauflandOrder> = {}): RawKauflandOrder {
  return {
    id_order: 'KL-ORD-1',
    ts_created_iso: '2024-03-01T00:00:00Z',
    ts_units_updated_iso: '2024-03-02T00:00:00Z',
    order_units: [makeOrderUnit()],
    ...overrides,
  }
}

describe('transformOrder (kaufland-marketplace)', () => {
  it('maps id_order to string id', () => {
    const result = transformOrder(makeOrder({ id_order: 'ORD-42' }))
    expect(result.id).toBe('ORD-42')
  })

  it('maps id_order to orderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('KL-ORD-1')
  })

  it('prepends # to id_order for name', () => {
    const result = transformOrder(makeOrder())
    expect(result.name).toBe('#KL-ORD-1')
  })

  it('derives currency from first unit', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('EUR')
  })

  it('sums unit prices as totalPrice', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice?.amount).toBe(2999)
    expect(result.totalPrice?.currency).toBe('EUR')
  })

  it('sums shipping_rates as totalShipping', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalShipping?.amount).toBe(499)
  })

  it('sets fulfillmentStatus FULFILLED when all units are sent', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('sets fulfillmentStatus UNFULFILLED when units have mixed status', () => {
    const result = transformOrder(
      makeOrder({ order_units: [makeOrderUnit({ status: 'need_to_be_sent' })] }),
    )
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('sets fulfillmentStatus RESTOCKED when all units cancelled', () => {
    const result = transformOrder(
      makeOrder({ order_units: [makeOrderUnit({ status: 'cancelled' })] }),
    )
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps buyer email to email', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('jane@example.com')
  })

  it('maps buyer id_buyer to customerId', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('55')
  })

  it('maps product title to lineItem title', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems?.[0]?.title).toBe('Widget')
  })

  it('maps unit price to lineItem price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems?.[0]?.price.amount).toBe(2999)
  })

  it('maps ts_created_iso to createdAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps ts_units_updated_iso to updatedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.updatedAt).toBe('2024-03-02T00:00:00Z')
  })

  it('stores raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformOrderUnit (kaufland-marketplace)', () => {
  it('wraps a single unit into an Order with unit id as order id', () => {
    const unit = makeOrderUnit({ id_order: null })
    const result = transformOrderUnit(unit)
    expect(result.id).toBe('8001')
  })

  it('uses id_order when set', () => {
    const unit = makeOrderUnit({ id_order: 'ORD-5' })
    const result = transformOrderUnit(unit)
    expect(result.id).toBe('ORD-5')
  })

  it('produces a single-unit order satisfying OrderSchema', () => {
    const result = transformOrderUnit(makeOrderUnit())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
