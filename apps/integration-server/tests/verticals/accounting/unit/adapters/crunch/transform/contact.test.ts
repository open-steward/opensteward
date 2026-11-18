import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformSupplier,
  untransformCustomer,
  untransformSupplier,
  type CrunchCustomerDto,
  type CrunchSupplierDto,
} from '../../../../../../../src/verticals/accounting/adapters/crunch/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<CrunchCustomerDto> = {}): CrunchCustomerDto {
  return {
    id: 42,
    name: 'Acme Ltd',
    email: 'billing@acme.example',
    billingAddress: {
      line1: '10 Downing St',
      line2: 'Westminster',
      line3: 'London', // treated as city by Crunch
      postCode: 'SW1A 2AA',
      country: 'GB',
    },
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<CrunchSupplierDto> = {}): CrunchSupplierDto {
  return {
    id: 99,
    companyName: 'Office Depot UK',
    contactName: 'Jane Smith',
    archived: false,
    ...overrides,
  }
}

describe('transformCustomer (crunch)', () => {
  it('maps numeric id to string', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('42')
  })

  it('maps name', () => {
    expect(transformCustomer(makeCustomer()).name).toBe('Acme Ltd')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email as WORK email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.emails![0].email).toBe('billing@acme.example')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps billing address (line3 → city)', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.billingAddress?.address1).toBe('10 Downing St')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.postalCode).toBe('SW1A 2AA')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('attaches raw as metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  describe('untransformCustomer round-trip', () => {
    it('round-trips name and email', () => {
      const contact = transformCustomer(makeCustomer())
      const back = untransformCustomer(contact)
      expect(back['name']).toBe('Acme Ltd')
      expect(back['email']).toBe('billing@acme.example')
    })
  })
})

describe('transformSupplier (crunch)', () => {
  it('prefixes id with sup_', () => {
    expect(transformSupplier(makeSupplier()).id).toBe('sup_99')
  })

  it('maps companyName', () => {
    expect(transformSupplier(makeSupplier()).name).toBe('Office Depot UK')
  })

  it('falls back to contactName when companyName absent', () => {
    expect(transformSupplier(makeSupplier({ companyName: undefined })).name).toBe('Jane Smith')
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps archived=false to isActive=true', () => {
    expect(transformSupplier(makeSupplier({ archived: false })).isActive).toBe(true)
  })

  it('maps archived=true to isActive=false', () => {
    expect(transformSupplier(makeSupplier({ archived: true })).isActive).toBe(false)
  })

  it('attaches raw as metadata', () => {
    const raw = makeSupplier()
    expect(transformSupplier(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformSupplier(makeSupplier())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  describe('untransformSupplier round-trip', () => {
    it('round-trips companyName', () => {
      const contact = transformSupplier(makeSupplier())
      const back = untransformSupplier(contact)
      expect(back['companyName']).toBe('Office Depot UK')
    })
  })
})
