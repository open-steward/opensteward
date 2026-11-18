import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawCopperDeal } from '../../../../../../../src/verticals/crm/adapters/copper/transform/deal'

function makeRaw(overrides: Partial<RawCopperDeal> = {}): RawCopperDeal {
  return { id: 1, name: 'Big Deal', ...overrides }
}

describe('copper transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps value from monetary_value', () => {
    const result = transformDeal(makeRaw({ monetary_value: 1000 }))
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
    expect(untransformDeal({ title: 'Test' }).name).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 7 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
