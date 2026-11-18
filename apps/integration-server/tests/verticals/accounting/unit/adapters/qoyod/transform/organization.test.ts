import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type QoyodOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<QoyodOrganization> = {}): QoyodOrganization {
  return {
    id: 1,
    name: 'Qoyod Business',
    legal_name: 'Qoyod Business LLC',
    vat_number: 'SA300000000000003',
    address: '5 Business St',
    city: 'Riyadh',
    country: 'SA',
    zip_code: '12345',
    phone: '+966512345678',
    email: 'info@qoyod.example',
    website: 'https://qoyod.example',
    currency: 'SAR',
    ...overrides,
  }
}

describe('qoyod transformOrganization', () => {
  it('maps name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Qoyod Business')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Qoyod Business LLC')
  })

  it('falls back to name when legal_name absent', () => {
    expect(transformOrganization(makeRaw({ legal_name: null })).legalName).toBe('Qoyod Business')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('SA300000000000003')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('SAR')
  })

  it('maps website', () => {
    expect(transformOrganization(makeRaw()).website).toBe('https://qoyod.example')
  })

  it('maps address to address.address1', () => {
    expect(transformOrganization(makeRaw()).address?.address1).toBe('5 Business St')
  })

  it('maps city', () => {
    expect(transformOrganization(makeRaw()).address?.city).toBe('Riyadh')
  })

  it('maps zip_code to postalCode', () => {
    expect(transformOrganization(makeRaw()).address?.postalCode).toBe('12345')
  })

  it('maps country', () => {
    expect(transformOrganization(makeRaw()).address?.country).toBe('SA')
  })

  it('passes OrganizationSchema.parse', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})
