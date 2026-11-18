import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawAffinityDeal } from '../../../../../../../src/verticals/crm/adapters/affinity/transform/deal'

function makeRaw(overrides: Partial<RawAffinityDeal> = {}): RawAffinityDeal {
  return { id: 1, name: 'Deal A', ...overrides }
}

describe('affinity transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw()).title).toBe('Deal A')
  })

  it('maps company_id from first organization_id', () => {
    expect(transformDeal(makeRaw({ organization_ids: [3] })).company_id).toBe('3')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal maps name back', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect(result.name).toBe('New Deal')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 7 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
