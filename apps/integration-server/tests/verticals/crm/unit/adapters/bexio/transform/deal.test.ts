import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawBexioQuote } from '../../../../../../../src/verticals/crm/adapters/bexio/transform/deal'

function makeRaw(overrides: Partial<RawBexioQuote> = {}): RawBexioQuote {
  return { id: 1, ...overrides }
}

describe('bexio transformDeal', () => {
  it('maps id', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps title', () => {
    const result = transformDeal(makeRaw({ title: 'Big Quote' }))
    expect(result.title).toBe('Big Quote')
  })

  it('maps value from total_gross with CHF currency', () => {
    const result = transformDeal(makeRaw({ total_gross: 1000 }))
    expect(result.value).toEqual({ amount: 1000, currency: 'CHF' })
  })

  it('maps company_id from contact_id', () => {
    const result = transformDeal(makeRaw({ contact_id: 7 }))
    expect(result.company_id).toBe('7')
  })

  it('maps owner_id from user_id', () => {
    const result = transformDeal(makeRaw({ user_id: 3 }))
    expect(result.owner_id).toBe('3')
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
