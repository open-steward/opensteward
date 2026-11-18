import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  type SoldoCompany,
} from '../../../../../../../src/verticals/accounting/adapters/soldo/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<SoldoCompany> = {}): SoldoCompany {
  return {
    id: 'co_001',
    name: 'Acme Ltd',
    legalName: 'Acme Limited',
    currency: 'GBP',
    timezone: 'Europe/London',
    website: 'https://acme.example',
    vatNumber: 'GB123456789',
    registrationNumber: '12345678',
    address: {
      line1: '1 High Street',
      line2: 'Suite 100',
      city: 'London',
      region: 'Greater London',
      postalCode: 'EC1A 1BB',
      country: 'GB',
    },
    ...overrides,
  }
}

describe('transformCompany (soldo)', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('co_001')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Ltd')
  })

  it('maps legalName', () => {
    expect(transformCompany(makeRaw()).legalName).toBe('Acme Limited')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformCompany(makeRaw()).taxNumber).toBe('GB123456789')
  })

  it('falls back to registrationNumber when vatNumber absent', () => {
    expect(transformCompany(makeRaw({ vatNumber: undefined })).taxNumber).toBe('12345678')
  })

  it('maps currency', () => {
    expect(transformCompany(makeRaw()).currency).toBe('GBP')
  })

  it('maps timezone', () => {
    expect(transformCompany(makeRaw()).timezone).toBe('Europe/London')
  })

  it('maps address.line1 to address.address1', () => {
    expect(transformCompany(makeRaw()).address?.address1).toBe('1 High Street')
  })

  it('maps address.line2 to address.address2', () => {
    expect(transformCompany(makeRaw()).address?.address2).toBe('Suite 100')
  })

  it('maps address.city', () => {
    expect(transformCompany(makeRaw()).address?.city).toBe('London')
  })

  it('maps address.postalCode', () => {
    expect(transformCompany(makeRaw()).address?.postalCode).toBe('EC1A 1BB')
  })

  it('maps address.country', () => {
    expect(transformCompany(makeRaw()).address?.country).toBe('GB')
  })

  it('omits address when not provided', () => {
    expect(transformCompany(makeRaw({ address: undefined })).address).toBeUndefined()
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    expect(() => OrganizationSchema.parse(transformCompany(makeRaw()))).not.toThrow()
  })
})
