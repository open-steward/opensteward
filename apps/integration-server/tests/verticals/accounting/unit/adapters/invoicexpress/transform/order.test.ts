import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type InvoiceXpressOrder } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/order'

function makeOrder(overrides: Partial<InvoiceXpressOrder> = {}): InvoiceXpressOrder {
  return {
    id: 400,
    date: '2024-07-10',
    client: { id: 88 },
    total: 750,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('400')
    expect(result.contactId).toBe('88')
    expect(result.totalAmount).toBe(750)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-07-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder({ total: 1000 })
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined postedAt when date is empty', () => {
    const result = transformOrder(makeOrder({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('returns undefined currency when empty', () => {
    const result = transformOrder(makeOrder({ currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
