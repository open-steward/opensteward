import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type MelioOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/melio/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrg(overrides: Partial<MelioOrganization> = {}): MelioOrganization {
  return {
    id: 'org_001',
    companyName: 'Acme Inc',
    legalName: 'Acme Incorporated',
    taxId: 'US-987654321',
    currency: 'USD',
    timezone: 'America/New_York',
    address: {
      line1: '789 Market St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformOrganization (melio)', () => {
  it('maps id', () => {
    expect(transformOrganization(makeOrg()).id).toBe('org_001')
  })

  it('maps companyName to name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Acme Inc')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('Acme Incorporated')
  })

  it('maps taxId to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('US-987654321')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrg()).currency).toBe('USD')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeOrg()).timezone).toBe('America/New_York')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('789 Market St')
    expect(result.address?.city).toBe('New York')
    expect(result.address?.region).toBe('NY')
    expect(result.address?.postalCode).toBe('10001')
    expect(result.address?.country).toBe('US')
  })

  it('returns undefined address when address is absent', () => {
    expect(transformOrganization(makeOrg({ address: undefined })).address).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeOrg()))).not.toThrow()
  })
})
