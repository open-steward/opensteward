import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type AbacusAddress,
} from '../../../../../../../src/verticals/accounting/adapters/abacus-ch/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeAbacusAddress(overrides: Partial<AbacusAddress> = {}): AbacusAddress {
  return {
    Id: '200',
    FirstName: 'Jane',
    LastName: 'Doe',
    Company: 'Acme AG',
    AddressType: 'Legal',
    IsActive: true,
    IsDebtor: true,
    IsCreditor: false,
    Email: 'jane@acme.example',
    Phone: '+41441234567',
    MobilePhone: '+41791234567',
    Street: 'Bahnhofstrasse 1',
    Street2: 'c/o Reception',
    City: 'Zurich',
    ZipCode: '8001',
    CountryCode: 'CH',
    CurrencyCode: 'CHF',
    VatNumber: 'CHE-123.456.789',
    CreatedAt: '2024-01-10T08:00:00.000Z',
    ModifiedAt: '2024-06-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformContact (abacus-ch)', () => {
  it('maps Id as string', () => {
    const result = transformContact(makeAbacusAddress({ Id: 200 }))
    expect(result.id).toBe('200')
  })

  it('prefers Company as display name', () => {
    const result = transformContact(makeAbacusAddress())
    expect(result.name).toBe('Acme AG')
  })

  it('falls back to FirstName + LastName when Company absent', () => {
    const result = transformContact(makeAbacusAddress({ Company: undefined }))
    expect(result.name).toBe('Jane Doe')
  })

  it('maps firstName and lastName', () => {
    const result = transformContact(makeAbacusAddress())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps companyName', () => {
    const result = transformContact(makeAbacusAddress())
    expect(result.companyName).toBe('Acme AG')
  })

  it('maps VatNumber to taxNumber', () => {
    const result = transformContact(makeAbacusAddress())
    expect(result.taxNumber).toBe('CHE-123.456.789')
  })

  it('sets isCustomer from IsDebtor', () => {
    expect(transformContact(makeAbacusAddress({ IsDebtor: true })).isCustomer).toBe(true)
    expect(transformContact(makeAbacusAddress({ IsDebtor: false })).isCustomer).toBe(false)
    // default (undefined) → false via ?? false
    expect(transformContact(makeAbacusAddress({ IsDebtor: undefined })).isCustomer).toBe(false)
  })

  it('sets isSupplier from IsCreditor', () => {
    expect(transformContact(makeAbacusAddress({ IsCreditor: true })).isSupplier).toBe(true)
    expect(transformContact(makeAbacusAddress({ IsCreditor: false })).isSupplier).toBe(false)
  })

  it('sets isActive via ?? true (undefined → true)', () => {
    expect(transformContact(makeAbacusAddress({ IsActive: undefined })).isActive).toBe(true)
    expect(transformContact(makeAbacusAddress({ IsActive: false })).isActive).toBe(false)
  })

  it('maps Email to WORK email', () => {
    const result = transformContact(makeAbacusAddress())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('jane@acme.example')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps Phone (WORK) and MobilePhone (MOBILE)', () => {
    const result = transformContact(makeAbacusAddress())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0].type).toBe('WORK')
    expect(result.telephones![0].telephone).toBe('+41441234567')
    expect(result.telephones![1].type).toBe('MOBILE')
    expect(result.telephones![1].telephone).toBe('+41791234567')
  })

  it('maps billingAddress from address fields', () => {
    const result = transformContact(makeAbacusAddress())
    expect(result.billingAddress?.address1).toBe('Bahnhofstrasse 1')
    expect(result.billingAddress?.address2).toBe('c/o Reception')
    expect(result.billingAddress?.city).toBe('Zurich')
    expect(result.billingAddress?.postalCode).toBe('8001')
    expect(result.billingAddress?.country).toBe('CH')
  })

  it('leaves billingAddress undefined when all address fields are absent', () => {
    const result = transformContact(
      makeAbacusAddress({
        Street: undefined,
        City: undefined,
        ZipCode: undefined,
        CountryCode: undefined,
      }),
    )
    expect(result.billingAddress).toBeUndefined()
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformContact(makeAbacusAddress())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  describe('untransformContact', () => {
    it('round-trips key fields', () => {
      const contact = transformContact(makeAbacusAddress())
      const back = untransformContact(contact)
      expect(back.FirstName).toBe('Jane')
      expect(back.LastName).toBe('Doe')
      expect(back.Company).toBe('Acme AG')
      expect(back.Email).toBe('jane@acme.example')
      expect(back.Phone).toBe('+41441234567')
      expect(back.MobilePhone).toBe('+41791234567')
      expect(back.CurrencyCode).toBe('CHF')
      expect(back.VatNumber).toBe('CHE-123.456.789')
      expect(back.IsDebtor).toBe(true)
      expect(back.IsCreditor).toBe(false)
    })

    it('recovers billing address fields', () => {
      const contact = transformContact(makeAbacusAddress())
      const back = untransformContact(contact)
      expect(back.Street).toBe('Bahnhofstrasse 1')
      expect(back.City).toBe('Zurich')
      expect(back.CountryCode).toBe('CH')
    })
  })
})
