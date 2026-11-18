import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type PayhawkOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/payhawk/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<PayhawkOrganization> = {}): PayhawkOrganization {
  return {
    id: 'org-1',
    name: 'ACME Ltd',
    legalName: 'ACME Limited',
    taxNumber: 'DE999999999',
    currency: 'EUR',
    countryCode: 'DE',
    addressLine1: '1 Market St',
    city: 'Berlin',
    postCode: '10115',
    website: 'https://acme.example',
    ...overrides,
  }
}

describe('payhawk transformOrganization', () => {
  it('maps name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('ACME Ltd')
  })

  it('falls back to legalName when name is absent', () => {
    expect(transformOrganization(makeRaw({ name: undefined })).name).toBe('ACME Limited')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('ACME Limited')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('DE999999999')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('EUR')
  })

  it('maps website', () => {
    expect(transformOrganization(makeRaw()).website).toBe('https://acme.example')
  })

  it('maps address.city', () => {
    expect(transformOrganization(makeRaw()).address?.city).toBe('Berlin')
  })

  it('maps postCode to address.postalCode', () => {
    expect(transformOrganization(makeRaw()).address?.postalCode).toBe('10115')
  })

  it('maps countryCode to address.country', () => {
    expect(transformOrganization(makeRaw()).address?.country).toBe('DE')
  })

  it('passes OrganizationSchema.parse', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})
