import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type TwentyFourSevenSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/salesorder'

function makeSalesOrder(overrides: Partial<TwentyFourSevenSalesOrder> = {}): TwentyFourSevenSalesOrder {
  return {
    id: '2457-so-1',
    orderNumber: 3001,
    customerId: 'cust-20',
    currency: 'NOK',
    orderDate: '2024-01-15',
    status: 'active',
    totalAmount: 20000,
    taxAmount: 5000,
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (twentyfoursevenoffice)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('2457-so-1')
  })

  it('maps customerId to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('cust-20')
  })

  it('maps totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(20000)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('NOK')
  })

  it('maps orderDate to postedAt as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status voided to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'voided' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'processing' })).status).toBe('ACTIVE')
  })

  it('maps lines to lineItems', () => {
    const raw = makeSalesOrder({
      lines: [
        {
          id: 'line-so-1',
          productId: 'svc-1',
          description: 'Consulting',
          quantity: 1,
          unitPrice: 5000,
          amount: 5000,
          taxCode: 'VAT25',
          taxAmount: 1250,
          accountId: 'acc-3010',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-so-1')
    expect(li.itemId).toBe('svc-1')
    expect(li.totalAmount).toBe(5000)
    expect(li.taxAmount).toBe(1250)
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
