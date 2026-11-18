import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawCreatioOpportunity } from '../../../../../../../src/verticals/crm/adapters/creatio/transform/deal'

function makeRaw(overrides: Partial<RawCreatioOpportunity> = {}): RawCreatioOpportunity {
  return { Id: 'o1', Title: 'Big Deal', ...overrides }
}

describe('creatio transformDeal', () => {
  it('maps Id to id string', () => {
    expect(transformDeal(makeRaw()).id).toBe('o1')
  })

  it('maps Title to title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps value from Amount', () => {
    const result = transformDeal(makeRaw({ Amount: 500 }))
    expect(result.value?.amount).toBe(500)
    expect(result.value?.currency).toBe('USD')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal maps Title', () => {
    expect(untransformDeal({ title: 'Test' }).Title).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
