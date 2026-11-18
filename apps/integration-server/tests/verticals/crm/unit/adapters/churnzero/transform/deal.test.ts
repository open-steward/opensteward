import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  type RawChurnZeroDeal,
} from '../../../../../../../src/verticals/crm/adapters/churnzero/transform/deal'

function makeRaw(overrides: Partial<RawChurnZeroDeal> = {}): RawChurnZeroDeal {
  return { id: 'D1', ...overrides }
}

describe('churnzero transformDeal', () => {
  it('maps numeric id to string', () => {
    expect(transformDeal(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('maps string id to string', () => {
    expect(transformDeal(makeRaw({ id: 'DEAL-5' })).id).toBe('DEAL-5')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Big Contract' })).title).toBe('Big Contract')
  })

  it('defaults title to empty string when name is absent', () => {
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
    const result = transformDeal(makeRaw({ id: 99 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
