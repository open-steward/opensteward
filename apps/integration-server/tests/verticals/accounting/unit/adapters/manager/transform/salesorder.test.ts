import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type ManagerSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeSO(overrides: Partial<ManagerSalesOrder> = {}): ManagerSalesOrder {
  return {
    key: 'so-key-1',
    date: '2024-12-01',
    reference: 'SO-2024-001',
    customer: 'customer-uuid',
    description: 'Year-end sale',
    totalAmount: { value: 2000.0, currency: 'EUR' },
    status: 'Open',
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps key to id', () => {
    expect(transformSalesOrder(makeSO()).id).toBe('so-key-1')
  })

  it('maps customer to contactId', () => {
    expect(transformSalesOrder(makeSO()).contactId).toBe('customer-uuid')
  })

  it('extracts currency from totalAmount.currency', () => {
    expect(transformSalesOrder(makeSO()).currency).toBe('EUR')
  })

  it('converts totalAmount to minor units', () => {
    // 2000.0 → 200000
    expect(transformSalesOrder(makeSO()).totalAmount).toBe(200000)
  })

  it('maps status Open to ACTIVE', () => {
    expect(transformSalesOrder(makeSO({ status: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps status Closed to COMPLETED', () => {
    expect(transformSalesOrder(makeSO({ status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformSalesOrder(makeSO({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status Cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSO({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('parses date as postedAt', () => {
    expect(transformSalesOrder(makeSO()).postedAt).toEqual(new Date('2024-12-01'))
  })

  it('maps lines to lineItems using salesUnitPrice', () => {
    const result = transformSalesOrder(
      makeSO({
        lines: [
          {
            item: 'prod-uuid',
            account: 'acct-sales',
            lineDescription: 'Product X',
            qty: 4,
            salesUnitPrice: 500.0,
            amount: { value: 2000.0, currency: 'EUR' },
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('prod-uuid')
    expect(li.unitAmount).toBe(50000)
    expect(li.totalAmount).toBe(200000)
  })

  it('passes schema validation', () => {
    expect(() => SalesOrderSchema.parse(transformSalesOrder(makeSO()))).not.toThrow()
  })
})
