import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawCrmComDeal } from '../../../../../../../src/verticals/crm/adapters/crm-com/transform/deal'

function makeRaw(overrides: Partial<RawCrmComDeal> = {}): RawCrmComDeal {
  return { id: '1', ...overrides }
}

describe('crm-com transformDeal', () => {
  it('maps id', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps title from name', () => {
    const result = transformDeal(makeRaw({ name: 'Big Deal' }))
    expect(result.title).toBe('Big Deal')
  })

  it('maps value with USD default', () => {
    const result = transformDeal(makeRaw({ amount: 5000 }))
    expect(result.value).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps status', () => {
    const result = transformDeal(makeRaw({ status: 'open' }))
    expect(result.status).toBe('open')
  })

  it('maps company_id', () => {
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
    expect(result.name).toBe('Deal A')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
