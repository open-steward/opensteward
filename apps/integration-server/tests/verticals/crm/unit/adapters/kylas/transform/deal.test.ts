import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawKylasDeal } from '../../../../../../../src/verticals/crm/adapters/kylas/transform/deal'

function makeRaw(overrides: Partial<RawKylasDeal> = {}): RawKylasDeal {
  return { id: 1, ...overrides }
}

describe('kylas transformDeal', () => {
  it('maps id', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps title from name', () => {
    const result = transformDeal(makeRaw({ name: 'Big Deal' }))
    expect(result.title).toBe('Big Deal')
  })

  it('maps value from dealValue', () => {
    const result = transformDeal(makeRaw({
      dealValue: { value: 5000, currency: { currencyCode: 'INR' } },
    }))
    expect(result.value).toEqual({ amount: 5000, currency: 'INR' })
  })

  it('maps stage_id from pipelineStage.id', () => {
    const result = transformDeal(makeRaw({ pipelineStage: { id: 3 } }))
    expect(result.stage_id).toBe('3')
  })

  it('maps company_id from companyId', () => {
    const result = transformDeal(makeRaw({ companyId: 10 }))
    expect(result.company_id).toBe('10')
  })

  it('maps owner_id from ownedBy.id', () => {
    const result = transformDeal(makeRaw({ ownedBy: { id: 5 } }))
    expect(result.owner_id).toBe('5')
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
