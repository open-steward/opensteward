import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type NetvisorOrder } from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/order'

function makeOrder(overrides: Partial<NetvisorOrder> = {}): NetvisorOrder {
  return {
    NetvisorKey: 100,
    OrderNumber: 1001,
    CustomerIdentifier: 'CUST-01',
    Currency: 'EUR',
    OrderDate: '2024-01-15',
    Amount: 10000,
    VatAmount: 2400,
    Status: 'Open',
    OrderLines: [],
    ...overrides,
  }
}

describe('transformOrder (netvisor)', () => {
  it('maps NetvisorKey to id', () => {
    expect(transformOrder(makeOrder()).id).toBe('100')
  })

  it('maps CustomerIdentifier to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('CUST-01')
  })

  it('maps Amount to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(10000)
  })

  it('maps Currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps OrderDate to postedAt as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status Delivered to COMPLETED', () => {
    expect(transformOrder(makeOrder({ Status: 'Delivered' })).status).toBe('COMPLETED')
  })

  it('maps status Cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status Unsent to DRAFT', () => {
    expect(transformOrder(makeOrder({ Status: 'Unsent' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ Status: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps OrderLines to lineItems', () => {
    const raw = makeOrder({
      OrderLines: [
        {
          NetvisorKey: 501,
          ProductIdentifier: 'PROD-1',
          ProductName: 'Widget',
          Quantity: 5,
          UnitPrice: 100,
          LineSum: 500,
          VatPercent: 24,
          AccountNumber: '3000',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('501')
    expect(li.itemId).toBe('PROD-1')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitQuantity).toBe(5)
    expect(li.unitAmount).toBe(100)
    expect(li.totalAmount).toBe(500)
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
