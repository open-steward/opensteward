import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawHubSpotContact,
} from '../../../../../../../src/verticals/crm/adapters/hubspot/transform/contact'

function makeRaw(overrides: Partial<RawHubSpotContact> = {}): RawHubSpotContact {
  return { id: 'hs-1', properties: {}, ...overrides }
}

describe('hubspot transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw({ id: 'hs-1' })).id).toBe('hs-1')
  })

  it('maps properties.firstname and lastname', () => {
    const result = transformContact(makeRaw({ properties: { firstname: 'Jane', lastname: 'Doe' } }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
    expect(result.name).toBe('Jane Doe')
  })

  it('maps properties.email and phone', () => {
    const result = transformContact(makeRaw({ properties: { email: 'j@ex.com', phone: '555' } }))
    expect(result.email).toBe('j@ex.com')
    expect(result.phone).toBe('555')
  })

  it('maps company_id from passed argument', () => {
    expect(transformContact(makeRaw(), 'co-5').company_id).toBe('co-5')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 'hs-1' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('hubspot untransformContact', () => {
  it('wraps fields in properties object', () => {
    const result = untransformContact({ first_name: 'Jane', email: 'j@ex.com' })
    const props = result.properties as Record<string, unknown>
    expect(props.firstname).toBe('Jane')
    expect(props.email).toBe('j@ex.com')
  })
})
