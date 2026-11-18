import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawBullhornDeal } from '../../../../../../../src/verticals/crm/adapters/bullhorn/transform/deal'

function makeRaw(overrides: Partial<RawBullhornDeal> = {}): RawBullhornDeal {
  return { id: 1, ...overrides }
}

describe('bullhorn transformDeal', () => {
  it('maps id', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps title', () => {
    const result = transformDeal(makeRaw({ title: 'Senior Dev Role' }))
    expect(result.title).toBe('Senior Dev Role')
  })

  it('maps value from salary with AUD currency', () => {
    const result = transformDeal(makeRaw({ salary: 80000 }))
    expect(result.value).toEqual({ amount: 80000, currency: 'AUD' })
  })

  it('maps status', () => {
    const result = transformDeal(makeRaw({ status: 'Open' }))
    expect(result.status).toBe('Open')
  })

  it('maps company_id from clientCorporation.id', () => {
    const result = transformDeal(makeRaw({ clientCorporation: { id: 10 } }))
    expect(result.company_id).toBe('10')
  })

  it('maps owner_id from owner.id', () => {
    const result = transformDeal(makeRaw({ owner: { id: 5 } }))
    expect(result.owner_id).toBe('5')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'Deal A', status: 'Open' })
    expect(result).toBeDefined()
    expect(result.title).toBe('Deal A')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
