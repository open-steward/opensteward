import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type BCSalesOrderForSO } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/salesorder'

function makeSalesOrder(overrides: Partial<BCSalesOrderForSO> = {}): BCSalesOrderForSO {
  return {
    id: 'so-1',
    number: 'SO-002',
    customerId: 'cust-2',
    currencyCode: 'USD',
    totalAmountIncludingTax: 3000,
    status: 'Open',
    orderDate: '2024-04-01',
    ...overrides,
  }
}

describe('transformSalesOrder (dynamics365bc)', () => {
  it('maps id and contactId', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('so-1')
    expect(result.contactId).toBe('cust-2')
  })

  it('Draft → DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('Open → ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Open' })).status).toBe('ACTIVE')
  })

  it('Shipped → COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Shipped' })).status).toBe('COMPLETED')
  })

  it('maps totalAmount and currency', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(3000)
    expect(result.currency).toBe('USD')
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
