import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type EconomicOrder } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/order'

function makeRaw(overrides: Partial<EconomicOrder> = {}): EconomicOrder {
  return {
    orderNumber: 1,
    date: '2024-05-01',
    currency: 'DKK',
    netAmount: 800,
    grossAmount: 1000,
    customer: { customerNumber: 1, name: 'Customer A' },
    lines: [],
    isArchived: false,
    isSent: false,
    ...overrides,
  }
}

describe('economic transformOrder', () => {
  it('maps orderNumber to id', () => {
    expect(transformOrder(makeRaw()).id).toBe('1')
  })
  it('sets type to SALES', () => {
    expect(transformOrder(makeRaw()).type).toBe('SALES')
  })
  it('handles fields gracefully', () => {
    expect(() => transformOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
  it('maps isArchived true -> COMPLETED', () => {
    expect(transformOrder(makeRaw({ isArchived: true })).status).toBe('COMPLETED')
  })
  it('maps isArchived false -> ACTIVE', () => {
    expect(transformOrder(makeRaw({ isArchived: false })).status).toBe('ACTIVE')
  })
  it('maps date to postedAt as Date', () => {
    expect(transformOrder(makeRaw()).postedAt).toEqual(new Date('2024-05-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
