import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawCapsuleDeal } from '../../../../../../../src/verticals/crm/adapters/capsule/transform/deal'

function makeRaw(overrides: Partial<RawCapsuleDeal> = {}): RawCapsuleDeal {
  return { id: 1, ...overrides }
}

describe('capsule transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('maps value from value object', () => {
    const result = transformDeal(makeRaw({ value: { amount: 500, currency: 'GBP' } }))
    expect(result.value?.amount).toBe(500)
    expect(result.value?.currency).toBe('GBP')
  })

  it('maps stage_id from currentMilestoneId', () => {
    expect(transformDeal(makeRaw({ currentMilestoneId: 99 })).stage_id).toBe('99')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal maps title to name', () => {
    expect(untransformDeal({ title: 'Test' }).name).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 7 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
