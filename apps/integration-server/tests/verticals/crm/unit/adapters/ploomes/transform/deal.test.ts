import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/deal'
import type { RawPloomesDeal } from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/deal'

function makeRaw(overrides: Partial<RawPloomesDeal> = {}): RawPloomesDeal {
  return { Id: 1, ...overrides }
}

describe('ploomes transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('1')
  })
  it('maps title from Title', () => {
    expect(transformDeal(makeRaw({ Title: 'Big Deal' })).title).toBe('Big Deal')
  })
  it('maps value with BRL currency', () => {
    const result = transformDeal(makeRaw({ Price: 1000 }))
    expect(result.value?.amount).toBe(1000)
    expect(result.value?.currency).toBe('BRL')
  })
  it('handles null Price', () => {
    expect(transformDeal(makeRaw({ Price: null })).value).toBeUndefined()
  })
  it('maps contact_ids from ContactId', () => {
    expect(transformDeal(makeRaw({ ContactId: 42 })).contact_ids).toEqual(['42'])
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
    expect(result.Title).toBe('New Deal')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
