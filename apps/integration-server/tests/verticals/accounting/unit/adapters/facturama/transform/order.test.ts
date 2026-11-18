import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type FacturamaOrder } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/order'

function makeRaw(overrides: Partial<FacturamaOrder> = {}): FacturamaOrder {
  return {
    Id: 'ord-1',
    ClientId: 'cust-1',
    ClientName: 'Test Client',
    Currency: 'MXN',
    Total: 1000,
    OrderDate: '2024-05-01',
    Status: 'active',
    ShippingStreet: '',
    ShippingCity: '',
    ShippingState: '',
    ShippingZipCode: '',
    ShippingCountry: '',
    BillingStreet: '',
    BillingCity: '',
    BillingState: '',
    BillingZipCode: '',
    BillingCountry: '',
    Items: [],
    ...overrides,
  }
}

describe('facturama transformOrder', () => {
  it('maps Id to id', () => {
    expect(transformOrder(makeRaw()).id).toBe('ord-1')
  })
  it('sets type to SALES', () => {
    expect(transformOrder(makeRaw()).type).toBe('SALES')
  })
  it('handles fields gracefully', () => {
    expect(() => transformOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
  it('maps status completed -> COMPLETED', () => {
    expect(transformOrder(makeRaw({ Status: 'completed' })).status).toBe('COMPLETED')
  })
  it('maps status cancelled -> CANCELLED', () => {
    expect(transformOrder(makeRaw({ Status: 'cancelled' })).status).toBe('CANCELLED')
  })
  it('maps OrderDate to postedAt as Date', () => {
    expect(transformOrder(makeRaw()).postedAt).toEqual(new Date('2024-05-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
