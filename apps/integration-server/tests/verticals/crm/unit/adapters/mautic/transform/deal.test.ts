import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, type RawMauticDeal } from '../../../../../../../src/verticals/crm/adapters/mautic/transform/deal'

function makeRaw(overrides: Partial<RawMauticDeal> = {}): RawMauticDeal {
  return { id: '1', ...overrides }
}

describe('mautic transformDeal', () => {
  it('maps id', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('1')
  })

  it('returns empty title (stub)', () => {
    const result = transformDeal(makeRaw())
    expect(result.title).toBe('')
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
