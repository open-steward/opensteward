import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawOrttoDeal,
} from '../../../../../../../src/verticals/crm/adapters/ortto/transform/deal'

function makeRaw(overrides: Partial<RawOrttoDeal> = {}): RawOrttoDeal {
  return { id: 'deal-1', ...overrides }
}

describe('ortto transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 'deal-5' })).id).toBe('deal-5')
  })

  it('returns empty title (stub behaviour)', () => {
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
    const result = transformDeal(makeRaw({ id: 'deal-5' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('ortto untransformDeal', () => {
  it('maps title', () => {
    const result = untransformDeal({ title: 'Deal' })
    expect(result.title).toBe('Deal')
  })
})
