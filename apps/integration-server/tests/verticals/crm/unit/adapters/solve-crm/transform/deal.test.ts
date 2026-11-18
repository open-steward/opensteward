import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/deal'
import type { RawSolveProject } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/deal'

function makeRaw(overrides: Partial<RawSolveProject> = {}): RawSolveProject {
  return { id: '1', ...overrides }
}

describe('solve-crm transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('1')
  })
  it('maps title from name', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })
  it('maps value with default USD currency', () => {
    const result = transformDeal(makeRaw({ value: 500 }))
    expect(result.value?.amount).toBe(500)
    expect(result.value?.currency).toBe('USD')
  })
  it('maps contact_ids from contact', () => {
    expect(transformDeal(makeRaw({ contact: 'c1' })).contact_ids).toEqual(['c1'])
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect(result.name).toBe('New Deal')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
