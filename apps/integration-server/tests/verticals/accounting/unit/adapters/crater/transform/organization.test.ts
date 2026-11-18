import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type CraterBusiness,
} from '../../../../../../../src/verticals/accounting/adapters/crater/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrg(overrides: Partial<CraterBusiness> = {}): CraterBusiness {
  return {
    id: 'biz-1',
    name: 'Crater Inc.',
    email: 'info@crater.example',
    phone: '+15550009999',
    website: 'https://crater.example',
    time_zone: 'America/New_York',
    billing_address: {
      street_1: '1 Crater Way',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    },
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization (crater)', () => {
  it('maps id and name', () => {
    const result = transformOrganization(makeOrg())
    expect(result.id).toBe('biz-1')
    expect(result.name).toBe('Crater Inc.')
  })

  it('sets legalName equal to name', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('Crater Inc.')
  })

  it('maps timezone from time_zone', () => {
    expect(transformOrganization(makeOrg()).timezone).toBe('America/New_York')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrg()).website).toBe('https://crater.example')
  })

  it('maps billing address fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('1 Crater Way')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.region).toBe('TX')
    expect(result.address?.postalCode).toBe('78701')
  })

  it('omits address when billing_address is absent', () => {
    expect(transformOrganization(makeOrg({ billing_address: undefined })).address).toBeUndefined()
  })

  it('omits address when all billing_address sub-fields are empty', () => {
    expect(transformOrganization(makeOrg({ billing_address: {} })).address).toBeUndefined()
  })

  it('parses createdAt and updatedAt as Dates', () => {
    const result = transformOrganization(makeOrg())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('attaches raw as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
