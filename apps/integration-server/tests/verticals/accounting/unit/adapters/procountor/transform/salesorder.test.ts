import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type ProcountorSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/salesorder'

function makeSalesOrder(overrides: Partial<ProcountorSalesOrder> = {}): ProcountorSalesOrder {
  return {
    id: 333,
    orderNumber: 3001,
    partnerId: 70,
    currency: 'EUR',
    date: '2024-01-15',
    sum: 8000,
    vatAmount: 1920,
    status: 'CONFIRMED',
    orderRows: [],
    ...overrides,
  }
}

describe('transformSalesOrder (procountor)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('333')
  })

  it('maps partnerId to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('70')
  })

  it('maps sum to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(8000)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('EUR')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status DELIVERED to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'DELIVERED' })).status).toBe('COMPLETED')
  })

  it('maps status COMPLETED to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'COMPLETED' })).status).toBe('COMPLETED')
  })

  it('maps status CANCELLED to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps status EMPTY to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'EMPTY' })).status).toBe('DRAFT')
  })

  it('maps status UNFINISHED to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'UNFINISHED' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'CONFIRMED' })).status).toBe('ACTIVE')
  })

  it('maps orderRows to lineItems', () => {
    const raw = makeSalesOrder({
      orderRows: [
        {
          id: 1101,
          product: 'SVC-01',
          description: 'Consulting',
          quantity: 1,
          unitPrice: 1000,
          sum: 1000,
          vatPercent: 24,
          accountNumber: '3010',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1101')
    expect(li.itemId).toBe('SVC-01')
    expect(li.totalAmount).toBe(1000)
    expect(li.accountId).toBe('3010')
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
