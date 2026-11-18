import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawSansanDeal } from '../../../../../../../src/verticals/crm/adapters/sansan/transform/deal'

function makeRaw(overrides: Partial<RawSansanDeal> = {}): RawSansanDeal {
  return { id: 'D1', ...overrides }
}

describe('sansan transformDeal (placeholder)', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw()).id).toBe('D1')
  })

  it('defaults title to empty string when name is missing', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('sansan untransformDeal', () => {
  it('maps title to name', () => {
    expect(untransformDeal({ title: 'Deal A' }).name).toBe('Deal A')
  })
})
