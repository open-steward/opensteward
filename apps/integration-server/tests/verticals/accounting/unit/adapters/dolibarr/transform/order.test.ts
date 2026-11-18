import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type DolibarrOrder } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/order'

function makeRaw(overrides: Partial<DolibarrOrder> = {}): DolibarrOrder {
  return {
    id: 20,
    ref: 'CO2024-0001',
    status: 1,
    date: 1705276800,
    total_ht: 2000,
    total_tva: 400,
    total_ttc: 2400,
    multicurrency_code: 'EUR',
    fk_soc: 7,
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('20')
    expect(result.contactId).toBe('7')
    expect(result.totalAmount).toBe(2400)
    expect(result.currency).toBe('EUR')
  })

  it('parses unix timestamp as Date', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
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
