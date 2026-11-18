import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type A2xOrganisation,
} from '../../../../../../../src/verticals/accounting/adapters/a2x/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeA2xOrganisation(overrides: Partial<A2xOrganisation> = {}): A2xOrganisation {
  return {
    id: 42,
    name: 'Acme Store',
    legal_name: 'Acme Store LLC',
    country: 'US',
    currency: 'USD',
    timezone: 'America/New_York',
    website: 'https://acme.example',
    created_at: '2024-01-15T09:30:00.000Z',
    updated_at: '2024-06-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization (a2x)', () => {
  it('maps id as string', () => {
    const result = transformOrganization(makeA2xOrganisation({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps name and legalName', () => {
    const result = transformOrganization(makeA2xOrganisation())
    expect(result.name).toBe('Acme Store')
    expect(result.legalName).toBe('Acme Store LLC')
  })

  it('maps currency and timezone', () => {
    const result = transformOrganization(makeA2xOrganisation())
    expect(result.currency).toBe('USD')
    expect(result.timezone).toBe('America/New_York')
  })

  it('maps website', () => {
    const result = transformOrganization(makeA2xOrganisation())
    expect(result.website).toBe('https://acme.example')
  })

  it('maps createdAt and updatedAt as Date objects', () => {
    const result = transformOrganization(makeA2xOrganisation())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('does not map country to canonical address (A2X does not expose address fields)', () => {
    const result = transformOrganization(makeA2xOrganisation({ country: 'DE' }))
    // country is in the raw payload but is not mapped to any canonical field
    expect(result.address).toBeUndefined()
  })

  it('omits legalName when absent', () => {
    const result = transformOrganization(makeA2xOrganisation({ legal_name: undefined }))
    expect(result.legalName).toBeUndefined()
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeA2xOrganisation())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
