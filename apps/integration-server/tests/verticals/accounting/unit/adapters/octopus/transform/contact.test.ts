import { describe, it, expect } from 'vitest'
import {
  transformRelation,
  type OctopusRelation,
} from '../../../../../../../src/verticals/accounting/adapters/octopus/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<OctopusRelation> = {}): OctopusRelation {
  return {
    relationId: 300,
    name: 'BVBA Acme',
    firstName: 'Jan',
    lastName: 'Janssens',
    companyName: 'BVBA Acme',
    vatNumber: 'BE0123456789',
    enterpriseNumber: '0123.456.789',
    isCustomer: true,
    isSupplier: false,
    active: true,
    currency: 'EUR',
    email: 'jan@acme.be',
    phone: '+32-2-123-4567',
    mobile: '+32-497-000-000',
    address: 'Rue de la Loi 1',
    city: 'Brussels',
    postalCode: '1000',
    countryCode: 'BE',
    ...overrides,
  }
}

describe('transformRelation (octopus)', () => {
  it('maps relationId to id (string)', () => {
    expect(transformRelation(makeRaw()).id).toBe('300')
  })

  it('maps companyName', () => {
    expect(transformRelation(makeRaw()).companyName).toBe('BVBA Acme')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformRelation(makeRaw()).taxNumber).toBe('BE0123456789')
  })

  it('maps enterpriseNumber to identification', () => {
    expect(transformRelation(makeRaw()).identification).toBe('0123.456.789')
  })

  it('maps isCustomer flag', () => {
    expect(transformRelation(makeRaw({ isCustomer: true })).isCustomer).toBe(true)
  })

  it('maps isSupplier flag', () => {
    expect(transformRelation(makeRaw({ isSupplier: true })).isSupplier).toBe(true)
  })

  it('maps active to isActive', () => {
    expect(transformRelation(makeRaw({ active: false })).isActive).toBe(false)
  })

  it('maps email to WORK email', () => {
    expect(transformRelation(makeRaw()).emails![0].email).toBe('jan@acme.be')
  })

  it('maps phone to WORK telephone', () => {
    const phones = transformRelation(makeRaw()).telephones!
    expect(phones.find((t) => t.type === 'WORK')?.telephone).toBe('+32-2-123-4567')
  })

  it('maps mobile to MOBILE telephone', () => {
    const phones = transformRelation(makeRaw()).telephones!
    expect(phones.find((t) => t.type === 'MOBILE')?.telephone).toBe('+32-497-000-000')
  })

  it('maps billing address city', () => {
    expect(transformRelation(makeRaw()).billingAddress?.city).toBe('Brussels')
  })

  it('maps countryCode to billingAddress country', () => {
    expect(transformRelation(makeRaw()).billingAddress?.country).toBe('BE')
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformRelation(makeRaw()))).not.toThrow()
  })
})
