import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type FikenOrder } from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/order'

function makeOrder(overrides: Partial<FikenOrder> = {}): FikenOrder {
  return {
    orderId: 101,
    orderNumber: 'ORD-101',
    customerId: 42,
    customerName: 'Acme AS',
    currency: 'NOK',
    net: 8000,
    vat: 2000,
    gross: 10000,
    issueDate: '2024-01-15',
    status: 'active',
    orderLines: [],
    ...overrides,
  }
}

describe('transformOrder (fiken)', () => {
  it('maps orderId to id', () => {
    expect(transformOrder(makeOrder()).id).toBe('101')
  })

  it('maps customerId to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('42')
  })

  it('maps gross to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(10000)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('NOK')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps issueDate to postedAt as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps orderLines to lineItems', () => {
    const raw = makeOrder({
      orderLines: [
        {
          netPrice: 800,
          vatAmount: 200,
          grossPrice: 1000,
          description: 'Widget',
          productId: 7,
          quantity: 2,
          unitPrice: 500,
          vatType: 'HIGH',
          accountCode: '3000',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('7')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(200)
    expect(li.accountId).toBe('3000')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
