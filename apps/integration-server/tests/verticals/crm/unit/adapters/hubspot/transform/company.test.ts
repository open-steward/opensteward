import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawHubSpotCompany,
} from '../../../../../../../src/verticals/crm/adapters/hubspot/transform/company'

function makeRaw(overrides: Partial<RawHubSpotCompany> = {}): RawHubSpotCompany {
  return { id: 'hs-co-1', properties: {}, ...overrides }
}

describe('hubspot transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw({ id: 'hs-co-1' })).id).toBe('hs-co-1')
  })

  it('maps properties.name', () => {
    expect(transformCompany(makeRaw({ properties: { name: 'HubCorp' } })).name).toBe('HubCorp')
  })

  it('parses numberofemployees to size', () => {
    const result = transformCompany(makeRaw({ properties: { numberofemployees: '200' } }))
    expect(result.size).toBe(200)
  })

  it('ignores non-numeric numberofemployees', () => {
    const result = transformCompany(makeRaw({ properties: { numberofemployees: 'N/A' } }))
    expect(result.size).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 'hs-co-1' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('hubspot untransformCompany', () => {
  it('wraps size as string in properties', () => {
    const result = untransformCompany({ size: 100 })
    const props = result.properties as Record<string, unknown>
    expect(props.numberofemployees).toBe('100')
  })
})
