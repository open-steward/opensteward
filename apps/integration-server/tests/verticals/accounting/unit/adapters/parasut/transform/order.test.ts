import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type ParasutOrder } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/order'

function makeOrder(overrides: Partial<ParasutOrder> = {}): ParasutOrder {
  return {
    id: 'ord_1',
    type: 'e_invoices',
    attributes: {
      item_type: 'estimate',
      status: 'sent',
      invoice_no: 'EST-001',
      gross_total: 3000,
      issue_date: '2024-05-01',
      currency: 'TRY',
      contact_id: 'cust_5',
    },
    ...overrides,
  }
}

describe('transformOrder (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformOrder(makeOrder()).id).toBe('ord_1')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps totalAmount and currency', () => {
    const o = transformOrder(makeOrder())
    expect(o.totalAmount).toBe(3000)
    expect(o.currency).toBe('TRY')
  })

  it('maps contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('cust_5')
  })

  it('maps sent status to ACTIVE', () => {
    expect(transformOrder(makeOrder()).status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const raw = makeOrder({ attributes: { ...makeOrder().attributes, status: 'draft' } })
    expect(transformOrder(raw).status).toBe('DRAFT')
  })

  it('maps cancelled status to CANCELLED', () => {
    const raw = makeOrder({ attributes: { ...makeOrder().attributes, status: 'cancelled' } })
    expect(transformOrder(raw).status).toBe('CANCELLED')
  })

  it('parses date as Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-05-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
