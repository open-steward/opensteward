import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawApolloOpportunity } from '../../../../../../../src/verticals/crm/adapters/apollo/transform/deal'

function makeRaw(overrides: Partial<RawApolloOpportunity> = {}): RawApolloOpportunity {
  return { id: 'o1', name: 'Big Deal', ...overrides }
}

describe('apollo transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('o1')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps value from amount', () => {
    const result = transformDeal(makeRaw({ amount: 1000 }))
    expect(result.value?.amount).toBe(1000)
    expect(result.value?.currency).toBe('USD')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal maps title to name', () => {
    const result = untransformDeal({ title: 'New', value: { amount: 500, currency: 'USD' } })
    expect(result.name).toBe('New')
    expect(result.amount).toBe(500)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
