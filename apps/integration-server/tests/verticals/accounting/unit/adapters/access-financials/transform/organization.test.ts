import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type AFOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/access-financials/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeAFOrganization(overrides: Partial<AFOrganization> = {}): AFOrganization {
  return {
    id: 'tenant-001',
    name: 'Acme Ltd',
    legalName: 'Acme Limited',
    taxNumber: 'GB123456789',
    currency: 'GBP',
    timezone: 'Europe/London',
    website: 'https://acme.example',
    address: {
      address: '10 Downing Street',
      town: 'London',
      county: 'Greater London',
      country: 'GB',
      postCode: 'SW1A 2AA',
    },
    ...overrides,
  }
}

describe('transformOrganization (access-financials)', () => {
  it('maps id as string', () => {
    expect(transformOrganization(makeAFOrganization({ id: 42 })).id).toBe('42')
  })

  it('maps name and legalName', () => {
    const result = transformOrganization(makeAFOrganization())
    expect(result.name).toBe('Acme Ltd')
    expect(result.legalName).toBe('Acme Limited')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeAFOrganization()).taxNumber).toBe('GB123456789')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeAFOrganization()).timezone).toBe('Europe/London')
  })

  it('maps website', () => {
    expect(transformOrganization(makeAFOrganization()).website).toBe('https://acme.example')
  })

  it('maps address from nested address object', () => {
    const result = transformOrganization(makeAFOrganization())
    expect(result.address?.address1).toBe('10 Downing Street')
    expect(result.address?.city).toBe('London')
    expect(result.address?.region).toBe('Greater London')
    expect(result.address?.country).toBe('GB')
    expect(result.address?.postalCode).toBe('SW1A 2AA')
  })

  it('omits address when address object is undefined', () => {
    const result = transformOrganization(makeAFOrganization({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeAFOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
