import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type BlSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/salesorder'

function makeSalesOrder(overrides: Partial<BlSalesOrder> = {}): BlSalesOrder {
  return {
    Id: 'bl-so-1',
    OrderNumber: 700,
    CustomerId: 'cust-9',
    Currency: 'SEK',
    OrderDate: '2024-01-15',
    TotalAmount: 20000,
    VatAmount: 4000,
    Status: 'Active',
    Lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps Id to id', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('bl-so-1')
  })

  it('maps CustomerId to contactId', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('cust-9')
  })

  it('maps Currency to currency', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.currency).toBe('SEK')
  })

  it('maps TotalAmount to totalAmount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(20000)
  })

  it('parses OrderDate as Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps Active status to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Completed status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps Lines to lineItems', () => {
    const raw = makeSalesOrder({
      Lines: [
        {
          Id: 'sln-1',
          ArticleNumber: 'ART-003',
          Description: 'Finished goods',
          Quantity: 7,
          UnitPrice: 800,
          Amount: 5600,
          VatRate: 25,
          AccountNumber: 3100,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('sln-1')
    expect(li.itemId).toBe('ART-003')
    expect(li.itemDescription).toBe('Finished goods')
    expect(li.unitAmount).toBe(800)
    expect(li.unitQuantity).toBe(7)
    expect(li.totalAmount).toBe(5600)
    expect(li.accountId).toBe('3100')
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
