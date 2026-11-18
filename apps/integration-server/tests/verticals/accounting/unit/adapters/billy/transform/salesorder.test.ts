import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type BillySalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/salesorder'

function makeSalesOrder(overrides: Partial<BillySalesOrder> = {}): BillySalesOrder {
  return {
    id: 'billy-so-1',
    orderNo: 3001,
    contactId: 'customer-15',
    currencyId: 'DKK',
    entryDate: '2024-01-15',
    state: 'active',
    grossAmount: 9500,
    taxAmount: 1500,
    salesOrderLines: [],
    organizationId: 'org-1',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id to id', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('billy-so-1')
  })

  it('maps contactId to contactId', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('customer-15')
  })

  it('maps currencyId to currency', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.currency).toBe('DKK')
  })

  it('maps grossAmount to totalAmount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(9500)
  })

  it('parses entryDate as Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps active state to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ state: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft state to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ state: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps completed state to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ state: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps invoiced state to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ state: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps voided state to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ state: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps cancelled state to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ state: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps salesOrderLines to lineItems', () => {
    const raw = makeSalesOrder({
      salesOrderLines: [
        {
          id: 'sol-1',
          productId: 'prod-3',
          description: 'Product Y',
          quantity: 4,
          unitPrice: 300,
          amount: 1200,
          taxRateId: 'tax-3',
          taxAmount: 120,
          accountId: 'acc-30',
          discount: 25,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('sol-1')
    expect(li.itemId).toBe('prod-3')
    expect(li.itemDescription).toBe('Product Y')
    expect(li.unitAmount).toBe(300)
    expect(li.unitQuantity).toBe(4)
    expect(li.totalAmount).toBe(1200)
    expect(li.taxAmount).toBe(120)
    expect(li.taxrateId).toBe('tax-3')
    expect(li.accountId).toBe('acc-30')
    expect(li.discountAmount).toBe(25)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
