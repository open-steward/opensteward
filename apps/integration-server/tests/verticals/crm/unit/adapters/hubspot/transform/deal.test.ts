import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawHubSpotDeal,
} from '../../../../../../../src/verticals/crm/adapters/hubspot/transform/deal'

function makeRaw(overrides: Partial<RawHubSpotDeal> = {}): RawHubSpotDeal {
  return { id: 'hs-d-1', properties: {}, ...overrides }
}

describe('hubspot transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw({ id: 'hs-d-1' })).id).toBe('hs-d-1')
  })

  it('maps properties.dealname to title', () => {
    expect(transformDeal(makeRaw({ properties: { dealname: 'Big Deal' } })).title).toBe('Big Deal')
  })

  it('parses amount string to value', () => {
    const result = transformDeal(makeRaw({ properties: { amount: '2500.5' } }))
    expect(result.value).toEqual({ amount: 2500.5, currency: 'USD' })
  })

  it('ignores non-numeric amount', () => {
    const result = transformDeal(makeRaw({ properties: { amount: 'N/A' } }))
    expect(result.value).toBeUndefined()
  })

  it('passes contactId through', () => {
    const result = transformDeal(makeRaw(), 'c-5')
    expect(result.contact_ids).toEqual(['c-5'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 'hs-d-1' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('hubspot untransformDeal', () => {
  it('wraps fields in properties', () => {
    const result = untransformDeal({ title: 'Deal', value: { amount: 500, currency: 'USD' } })
    const props = result.properties as Record<string, unknown>
    expect(props.dealname).toBe('Deal')
    expect(props.amount).toBe('500')
  })
})
