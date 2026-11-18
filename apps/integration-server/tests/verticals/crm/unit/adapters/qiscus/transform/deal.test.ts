import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/deal'
import type { RawQiscusDeal } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/deal'

function makeRaw(overrides: Partial<RawQiscusDeal> = {}): RawQiscusDeal {
  return { id: '1', ...overrides }
}

describe('qiscus transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('1')
  })
  it('maps title', () => {
    expect(transformDeal(makeRaw({ title: 'Big Deal' })).title).toBe('Big Deal')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'Test' })
    expect(result).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
