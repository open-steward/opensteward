import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawCobraCrmDeal } from '../../../../../../../src/verticals/crm/adapters/cobra-crm/transform/deal'

function makeRaw(overrides: Partial<RawCobraCrmDeal> = {}): RawCobraCrmDeal {
  return { id: '1', ...overrides }
}

describe('cobra-crm transformDeal', () => {
  it('maps id', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps title', () => {
    const result = transformDeal(makeRaw({ title: 'Big Deal' }))
    expect(result.title).toBe('Big Deal')
  })

  it('maps value with EUR default', () => {
    const result = transformDeal(makeRaw({ value: 5000 }))
    expect(result.value).toEqual({ amount: 5000, currency: 'EUR' })
  })

  it('maps status', () => {
    const result = transformDeal(makeRaw({ status: 'open' }))
    expect(result.status).toBe('open')
  })

  it('maps contact_ids from contactId', () => {
    const result = transformDeal(makeRaw({ contactId: 'c1' }))
    expect(result.contact_ids).toEqual(['c1'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'Deal A' })
    expect(result).toBeDefined()
    expect(result.title).toBe('Deal A')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
