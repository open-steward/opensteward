import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type FAOrder } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/order'

function makeRaw(overrides: Partial<FAOrder> = {}): FAOrder {
  return {
    id: 60,
    reference: 'SO-2024-001',
    ord_date: '2024-01-05',
    debtor_no: 8,
    curr_code: 'USD',
    total: 2400,
    tax_total: 400,
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('60')
    expect(result.contactId).toBe('8')
    expect(result.totalAmount).toBe(2400)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-05'))
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
