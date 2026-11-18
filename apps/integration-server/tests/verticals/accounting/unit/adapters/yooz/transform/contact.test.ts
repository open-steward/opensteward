import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type YoozSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/yooz/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<YoozSupplier> = {}): YoozSupplier {
  return {
    id: 'sup-10',
    name: 'Acme Supplies',
    legalName: 'Acme Supplies SARL',
    siret: '12345678901234',
    vatNumber: 'FR12345678901',
    email: 'contact@acme-supplies.fr',
    phone: '+33-1-2345-6789',
    address: '10 Rue de la Paix',
    address2: 'Bâtiment B',
    city: 'Paris',
    zipCode: '75001',
    countryCode: 'FR',
    currency: 'EUR',
    isActive: true,
    ...overrides,
  }
}

describe('transformSupplier (yooz)', () => {
  it('maps id to string id', () => {
    expect(transformSupplier(makeRaw()).id).toBe('sup-10')
  })

  it('prefers name over legalName for name field', () => {
    expect(transformSupplier(makeRaw()).name).toBe('Acme Supplies')
  })

  it('prefers legalName over name for companyName', () => {
    expect(transformSupplier(makeRaw()).companyName).toBe('Acme Supplies SARL')
  })

  it('maps siret to identification', () => {
    expect(transformSupplier(makeRaw()).identification).toBe('12345678901234')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformSupplier(makeRaw()).taxNumber).toBe('FR12345678901')
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformSupplier(makeRaw())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps isActive flag', () => {
    expect(transformSupplier(makeRaw({ isActive: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when not provided', () => {
    expect(transformSupplier(makeRaw({ isActive: undefined })).isActive).toBe(true)
  })

  it('maps email to emails[0] as WORK', () => {
    const result = transformSupplier(makeRaw())
    expect(result.emails?.[0]).toEqual({ email: 'contact@acme-supplies.fr', type: 'WORK' })
  })

  it('maps phone to telephones[0] as WORK', () => {
    const result = transformSupplier(makeRaw())
    expect(result.telephones?.[0]).toEqual({ telephone: '+33-1-2345-6789', type: 'WORK' })
  })

  it('maps address fields to billingAddress', () => {
    const result = transformSupplier(makeRaw())
    expect(result.billingAddress?.address1).toBe('10 Rue de la Paix')
    expect(result.billingAddress?.city).toBe('Paris')
    expect(result.billingAddress?.postalCode).toBe('75001')
    expect(result.billingAddress?.country).toBe('FR')
  })

  it('maps currency', () => {
    expect(transformSupplier(makeRaw()).currency).toBe('EUR')
  })

  it('produces a schema-valid Contact', () => {
    expect(() => ContactSchema.parse(transformSupplier(makeRaw()))).not.toThrow()
  })
})
