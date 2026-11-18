import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawHighLevelDeal,
} from '../../../../../../../src/verticals/crm/adapters/highlevel/transform/deal'

function makeRaw(overrides: Partial<RawHighLevelDeal> = {}): RawHighLevelDeal {
  return { id: 'd-1', ...overrides }
}

describe('highlevel transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw({ id: 'd-1' })).id).toBe('d-1')
  })

  it('defaults title to empty string', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('maps monetaryValue to value amount in USD', () => {
    const result = transformDeal(makeRaw({ monetaryValue: 5000 }))
    expect(result.value).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('extracts contact_id from contact.id', () => {
    const result = transformDeal(makeRaw({ contact: { id: 'c-10' } }))
    expect(result.contact_ids).toEqual(['c-10'])
  })

  it('falls back to contactId when contact.id absent', () => {
    const result = transformDeal(makeRaw({ contactId: 'c-11' }))
    expect(result.contact_ids).toEqual(['c-11'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 'd-1' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('highlevel untransformDeal', () => {
  it('includes locationId', () => {
    const result = untransformDeal({ title: 'My Deal' }, 'loc-3')
    expect(result.locationId).toBe('loc-3')
    expect(result.name).toBe('My Deal')
  })
})
