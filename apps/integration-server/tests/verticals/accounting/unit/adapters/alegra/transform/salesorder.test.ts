import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type AlegraSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/salesorder'

function makeSalesOrder(overrides: Partial<AlegraSalesOrder> = {}): AlegraSalesOrder {
  return {
    id: 80,
    clientId: 3,
    currency: 'COP',
    total: 9000,
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

describe('transformSalesOrder', () => {
  it('maps id to string', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('80')
  })

  it('maps clientId to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('3')
  })

  it('maps total', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(9000)
  })

  it('maps status ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps status COMPLETED for completed', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status COMPLETED for invoiced', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps date as Date object', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps shipping address', () => {
    const so = transformSalesOrder(makeSalesOrder())
    expect(so.shippingAddress?.address1).toBe('Calle 5')
    expect(so.shippingAddress?.city).toBe('Medellín')
  })

  it('maps billing address', () => {
    const so = transformSalesOrder(makeSalesOrder())
    expect(so.billingAddress?.address1).toBe('Calle 10')
    expect(so.billingAddress?.city).toBe('Bogotá')
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
