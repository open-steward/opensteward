import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type BCSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/order'

function makeOrder(overrides: Partial<BCSalesOrder> = {}): BCSalesOrder {
  return {
    id: 'ord-1',
    number: 'SO-001',
    customerId: 'cust-1',
    currencyCode: 'GBP',
    totalAmountIncludingTax: 2000,
    status: 'Open',
    orderDate: '2024-03-01',
    ...overrides,
  }
}

describe('transformOrder (dynamics365bc)', () => {
  it('maps id and type=SALES', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ord-1')
    expect(result.type).toBe('SALES')
  })

  it('Draft → DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('Open → ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'Open' })).status).toBe('ACTIVE')
  })

  it('Shipped → COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'Shipped' })).status).toBe('COMPLETED')
  })

  it('maps contactId and totalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('cust-1')
    expect(result.totalAmount).toBe(2000)
  })

  it('maps billing address', () => {
    const result = transformOrder(makeOrder({ billToAddressLine1: '1 Street', billToCity: 'London', billToCountry: 'GB' }))
    expect(result.billingAddress?.address1).toBe('1 Street')
    expect(result.billingAddress?.city).toBe('London')
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder({ shipToAddressLine1: '2 Road', shipToCity: 'Manchester' }))
    expect(result.shippingAddress?.address1).toBe('2 Road')
  })

  it('maps postedAt from orderDate', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-03-01'))
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
