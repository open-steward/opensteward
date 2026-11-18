import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type MoloniOrder } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/order'

function makeOrder(overrides: Partial<MoloniOrder> = {}): MoloniOrder {
  return {
    document_id: 400,
    date: '2024-06-01',
    client_id: 55,
    net_value: 300,
    currency_code: 'EUR',
    status: 1,
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('400')
    expect(result.contactId).toBe('55')
    expect(result.totalAmount).toBe(300)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder({ net_value: 500 })
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps client_id 0 to undefined contactId', () => {
    const result = transformOrder(makeOrder({ client_id: 0 }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined postedAt when date is empty', () => {
    const result = transformOrder(makeOrder({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
