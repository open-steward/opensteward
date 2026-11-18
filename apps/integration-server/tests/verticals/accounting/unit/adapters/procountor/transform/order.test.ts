import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type ProcountorOrder } from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/order'

function makeOrder(overrides: Partial<ProcountorOrder> = {}): ProcountorOrder {
  return {
    id: 111,
    orderNumber: 1001,
    partnerId: 50,
    currency: 'EUR',
    date: '2024-01-15',
    sum: 10000,
    vatAmount: 2400,
    status: 'CONFIRMED',
    orderRows: [],
    ...overrides,
  }
}

describe('transformOrder (procountor)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('111')
  })

  it('maps partnerId to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('50')
  })

  it('maps sum to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(10000)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status DELIVERED to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'DELIVERED' })).status).toBe('COMPLETED')
  })

  it('maps status COMPLETED to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'COMPLETED' })).status).toBe('COMPLETED')
  })

  it('maps status CANCELLED to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps status EMPTY to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'EMPTY' })).status).toBe('DRAFT')
  })

  it('maps status UNFINISHED to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'UNFINISHED' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'CONFIRMED' })).status).toBe('ACTIVE')
  })

  it('maps orderRows to lineItems', () => {
    const raw = makeOrder({
      orderRows: [
        {
          id: 901,
          product: 'PROD-01',
          description: 'Widget',
          quantity: 2,
          unitPrice: 200,
          sum: 400,
          vatPercent: 24,
          accountNumber: '3000',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('901')
    expect(li.itemId).toBe('PROD-01')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(400)
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
