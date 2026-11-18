import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/deal'
import type { RawOntraportDeal } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/deal'

function makeRaw(overrides: Partial<RawOntraportDeal> = {}): RawOntraportDeal {
  return { id: '1', ...overrides }
}

describe('ontraport transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('1')
  })
  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
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
