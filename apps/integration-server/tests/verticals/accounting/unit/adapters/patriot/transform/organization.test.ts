import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type PatriotOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/patriot/transform/organization'

function makeOrganization(overrides: Partial<PatriotOrganization> = {}): PatriotOrganization {
  return {
    id: 'org-001',
    name: 'Smith LLC',
    legal_name: 'Smith Limited Liability Company',
    tax_id: '12-3456789',
    currency: 'USD',
    timezone: 'America/New_York',
    website: 'https://smith.com',
    address: {
      line1: '123 Main St',
      city: 'Columbus',
      state: 'OH',
      zip: '43215',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Smith LLC')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe(
      'Smith Limited Liability Company',
    )
  })

  it('maps tax_id to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('12-3456789')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeOrganization()).timezone).toBe('America/New_York')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://smith.com')
  })

  it('maps address fields', () => {
    const org = transformOrganization(makeOrganization())
    expect(org.address?.address1).toBe('123 Main St')
    expect(org.address?.city).toBe('Columbus')
    expect(org.address?.region).toBe('OH')
    expect(org.address?.postalCode).toBe('43215')
    expect(org.address?.country).toBe('US')
  })

  it('returns undefined name when empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined website when empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
