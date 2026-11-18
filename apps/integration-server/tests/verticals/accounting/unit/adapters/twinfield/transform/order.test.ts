import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type TwinfieldOrder } from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/order'

function makeOrder(overrides: Partial<TwinfieldOrder> = {}): TwinfieldOrder {
  return {
    code: 'ORD-001',
    orderNumber: '2024001',
    customer: 'CUST001',
    currency: 'EUR',
    orderDate: '2024-01-15',
    status: 'active',
    totalExcl: 1000,
    totalIncl: 1210,
    vatTotal: 210,
    lines: [],
    office: 'main',
    ...overrides,
  }
}

describe('transformOrder (twinfield)', () => {
  it('maps code to id', () => {
    expect(transformOrder(makeOrder()).id).toBe('ORD-001')
  })

  it('maps customer to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('CUST001')
  })

  it('maps totalIncl to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1210)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps orderDate to postedAt as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status final to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'final' })).status).toBe('COMPLETED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status voided to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'voided' })).status).toBe('CANCELLED')
  })

  it('maps status deleted to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'deleted' })).status).toBe('CANCELLED')
  })

  it('maps status concept to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'concept' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps lines to lineItems', () => {
    const raw = makeOrder({
      lines: [
        {
          id: 'line-1',
          article: 'ART-001',
          description: 'Widget',
          quantity: 2,
          unitsPriceExcl: 500,
          valueExcl: 1000,
          valueInc: 1210,
          vatCode: 'VH',
          vatValue: 210,
          dim1: 'acc-8020',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemId).toBe('ART-001')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1210)
    expect(li.taxAmount).toBe(210)
    expect(li.taxrateId).toBe('VH')
    expect(li.accountId).toBe('acc-8020')
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
