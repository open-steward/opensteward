import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type FikenSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/salesorder'

function makeSalesOrder(overrides: Partial<FikenSalesOrder> = {}): FikenSalesOrder {
  return {
    orderId: 202,
    orderNumber: 'SO-202',
    customerId: 9,
    customerName: 'Beta Corp',
    currency: 'NOK',
    net: 6000,
    vat: 1500,
    gross: 7500,
    issueDate: '2024-01-15',
    status: 'active',
    orderLines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (fiken)', () => {
  it('maps orderId to id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('202')
  })

  it('maps customerId to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('9')
  })

  it('maps gross to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(7500)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('NOK')
  })

  it('maps issueDate to postedAt as Date', () => {
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

  it('maps status draft to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps orderLines to lineItems', () => {
    const raw = makeSalesOrder({
      orderLines: [
        {
          netPrice: 800,
          vatAmount: 200,
          grossPrice: 1000,
          description: 'Service',
          productId: 3,
          quantity: 1,
          unitPrice: 1000,
          vatType: 'HIGH',
          accountCode: '3010',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('3')
    expect(li.itemDescription).toBe('Service')
    expect(li.totalAmount).toBe(1000)
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
