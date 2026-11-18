import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type FacturamaSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/salesorder'

function makeRaw(overrides: Partial<FacturamaSalesOrder> = {}): FacturamaSalesOrder {
  return {
    Id: 'so-1',
    ClientId: 'cust-1',
    ClientName: 'Test Client',
    Currency: 'MXN',
    Total: 1500,
    OrderDate: '2024-07-01',
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

describe('facturama transformSalesOrder', () => {
  it('maps Id to id', () => {
    expect(transformSalesOrder(makeRaw()).id).toBe('so-1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformSalesOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })
  it('maps status invoiced -> COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ Status: 'invoiced' })).status).toBe('COMPLETED')
  })
  it('maps status cancelled -> CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ Status: 'cancelled' })).status).toBe('CANCELLED')
  })
  it('maps OrderDate to postedAt as Date', () => {
    expect(transformSalesOrder(makeRaw()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
