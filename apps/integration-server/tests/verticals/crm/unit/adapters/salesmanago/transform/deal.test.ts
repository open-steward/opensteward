import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/salesmanago/transform/deal'
import type { RawSaleSmanagoOpportunity } from '../../../../../../../src/verticals/crm/adapters/salesmanago/transform/deal'

function makeRaw(overrides: Partial<RawSaleSmanagoOpportunity> = {}): RawSaleSmanagoOpportunity {
  return { id: 'deal1', ...overrides }
}

describe('salesmanago transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('deal1')
  })
  it('maps title from name', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })
  it('maps value with default EUR currency', () => {
    const result = transformDeal(makeRaw({ value: 999 }))
    expect(result.value?.amount).toBe(999)
    expect(result.value?.currency).toBe('EUR')
  })
  it('maps contact_ids from contactId', () => {
    expect(transformDeal(makeRaw({ contactId: 'c1' })).contact_ids).toEqual(['c1'])
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
