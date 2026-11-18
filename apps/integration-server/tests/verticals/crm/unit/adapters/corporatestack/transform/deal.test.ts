import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawCorporateStackDeal } from '../../../../../../../src/verticals/crm/adapters/corporatestack/transform/deal'

function makeRaw(overrides: Partial<RawCorporateStackDeal> = {}): RawCorporateStackDeal {
  return { id: '1', ...overrides }
}

describe('corporatestack transformDeal', () => {
  it('maps id', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps title', () => {
    const result = transformDeal(makeRaw({ title: 'Big Deal' }))
    expect(result.title).toBe('Big Deal')
  })

  it('falls back to name when title is missing', () => {
    const result = transformDeal(makeRaw({ name: 'Alt Name' }))
    expect(result.title).toBe('Alt Name')
  })

  it('maps value with USD default', () => {
    const result = transformDeal(makeRaw({ amount: 5000 }))
    expect(result.value).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps stage_id from stage_id', () => {
    const result = transformDeal(makeRaw({ stage_id: 's1' }))
    expect(result.stage_id).toBe('s1')
  })

  it('maps company_id from company_id', () => {
    const result = transformDeal(makeRaw({ company_id: 'co1' }))
    expect(result.company_id).toBe('co1')
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
