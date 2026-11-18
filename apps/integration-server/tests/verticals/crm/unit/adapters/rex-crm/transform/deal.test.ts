import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawRexListing,
} from '../../../../../../../src/verticals/crm/adapters/rex-crm/transform/deal'

function makeRaw(overrides: Partial<RawRexListing> = {}): RawRexListing {
  return { id: 1, ...overrides }
}

describe('rex-crm transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('builds title from address parts', () => {
    const result = transformDeal(makeRaw({
      adr_street_number: '10',
      adr_street_name: 'Main St',
      adr_suburb_or_town: 'Sydney',
    }))
    expect(result.title).toBe('10 Main St Sydney')
  })

  it('falls back to Listing {id} title when no address', () => {
    expect(transformDeal(makeRaw({ id: 3 })).title).toBe('Listing 3')
  })

  it('maps value from search_price in AUD', () => {
    const result = transformDeal(makeRaw({ search_price: 500000 }))
    expect(result.value?.amount).toBe(500000)
    expect(result.value?.currency).toBe('AUD')
  })

  it('maps contact_ids from contact_ids array', () => {
    const result = transformDeal(makeRaw({ contact_ids: [1, 2] }))
    expect(result.contact_ids).toEqual(['1', '2'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 7 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('rex-crm untransformDeal', () => {
  it('maps status to listing_status', () => {
    const result = untransformDeal({ status: 'active' })
    expect(result.listing_status).toBe('active')
  })
})
