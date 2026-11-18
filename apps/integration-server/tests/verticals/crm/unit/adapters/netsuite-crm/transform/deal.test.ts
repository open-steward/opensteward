import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, type RawNetsuiteDeal } from '../../../../../../../src/verticals/crm/adapters/netsuite-crm/transform/deal'

function makeRaw(overrides: Partial<RawNetsuiteDeal> = {}): RawNetsuiteDeal {
  return { id: '1', ...overrides }
}

describe('netsuite-crm transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('1')
  })

  it('returns empty title (stub)', () => {
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
