import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type TwentyFourSevenOrder } from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/order'

function makeOrder(overrides: Partial<TwentyFourSevenOrder> = {}): TwentyFourSevenOrder {
  return {
    id: '2457-order-1',
    orderNumber: 1001,
    customerId: 'cust-5',
    currency: 'NOK',
    orderDate: '2024-01-15',
    status: 'active',
    totalAmount: 10000,
    taxAmount: 2500,
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (twentyfoursevenoffice)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('2457-order-1')
  })

  it('maps customerId to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('cust-5')
  })

  it('maps totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(10000)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('NOK')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps orderDate to postedAt as Date', () => {
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

  it('maps status voided to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'voided' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps lines to lineItems', () => {
    const raw = makeOrder({
      lines: [
        {
          id: 'line-1',
          productId: 'prod-3',
          description: 'Widget',
          quantity: 5,
          unitPrice: 100,
          amount: 500,
          taxCode: 'VAT25',
          taxAmount: 125,
          accountId: 'acc-3000',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemId).toBe('prod-3')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(125)
    expect(li.taxrateId).toBe('VAT25')
    expect(li.accountId).toBe('acc-3000')
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
