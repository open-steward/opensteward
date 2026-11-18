import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type AlegraOrder } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/order'

function makeOrder(overrides: Partial<AlegraOrder> = {}): AlegraOrder {
  return {
    id: 60,
    clientId: 3,
    currency: 'COP',
    total: 8000,
    date: '2024-01-15',
    status: 'open',
    shippingAddress: 'Calle 5',
    shippingCity: 'Medellín',
    shippingDepartment: 'Antioquia',
    shippingCountry: 'CO',
    billingAddress: 'Calle 10',
    billingCity: 'Bogotá',
    billingDepartment: 'Cundinamarca',
    billingCountry: 'CO',
    items: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id to string', () => {
    expect(transformOrder(makeOrder()).id).toBe('60')
  })

  it('maps clientId to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('3')
  })

  it('maps total', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(8000)
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps status ACTIVE for open', () => {
    expect(transformOrder(makeOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps status COMPLETED for completed', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status COMPLETED for invoiced', () => {
    expect(transformOrder(makeOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps date as Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps shipping address', () => {
    const o = transformOrder(makeOrder())
    expect(o.shippingAddress?.address1).toBe('Calle 5')
    expect(o.shippingAddress?.city).toBe('Medellín')
  })

  it('maps billing address', () => {
    const o = transformOrder(makeOrder())
    expect(o.billingAddress?.address1).toBe('Calle 10')
    expect(o.billingAddress?.city).toBe('Bogotá')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
