import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type YukiContact,
} from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<YukiContact> = {}): YukiContact {
  return {
    ContactCode: 'C-001',
    FullName: 'Acme Industries BV',
    FirstName: 'Jane',
    MiddleName: '',
    LastName: 'Doe',
    Gender: 'Female',
    CountryCode: 'NL',
    City: 'Amsterdam',
    Zipcode: '1012 AB',
    AddressLine_1: 'Keizersgracht 100',
    AddressLine_2: '',
    Website: 'https://acme.example',
    CoCNumber: '12345678',
    VATNumber: 'NL123456789B01',
    ContactType: 'Company',
    PhoneHome: '+31-20-123-4567',
    MobileHome: '+31-6-12345678',
    EmailAddress: 'jane@acme.example',
    ...overrides,
  }
}

describe('transformContact (yuki)', () => {
  it('maps ContactCode to id', () => {
    expect(transformContact(makeRaw()).id).toBe('C-001')
  })

  it('maps CoCNumber to identification', () => {
    expect(transformContact(makeRaw()).identification).toBe('12345678')
  })

  it('maps VATNumber to taxNumber', () => {
    expect(transformContact(makeRaw()).taxNumber).toBe('NL123456789B01')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformContact(makeRaw())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps FullName to companyName when ContactType is Company', () => {
    expect(transformContact(makeRaw()).companyName).toBe('Acme Industries BV')
  })

  it('omits companyName when ContactType is Person', () => {
    expect(transformContact(makeRaw({ ContactType: 'Person' })).companyName).toBeUndefined()
  })

  it('maps FirstName and LastName', () => {
    const result = transformContact(makeRaw())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps EmailAddress to emails[0] as WORK', () => {
    const result = transformContact(makeRaw())
    expect(result.emails?.[0]).toEqual({ email: 'jane@acme.example', type: 'WORK' })
  })

  it('maps PhoneHome to telephones WORK and MobileHome to MOBILE', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toEqual([
      { telephone: '+31-20-123-4567', type: 'WORK' },
      { telephone: '+31-6-12345678', type: 'MOBILE' },
    ])
  })

  it('maps AddressLine_1 and City and Zipcode to billingAddress', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('Keizersgracht 100')
    expect(result.billingAddress?.city).toBe('Amsterdam')
    expect(result.billingAddress?.postalCode).toBe('1012 AB')
    expect(result.billingAddress?.country).toBe('NL')
  })

  it('produces a schema-valid Contact', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  describe('untransformContact', () => {
    it('produces XML string containing ContactCode', () => {
      const xml = untransformContact({ id: 'C-001', name: 'Acme BV' }, 'ADM-999')
      expect(xml).toContain('<ContactCode>C-001</ContactCode>')
    })

    it('includes AdministrationID in XML', () => {
      const xml = untransformContact({ id: 'C-001' }, 'ADM-999')
      expect(xml).toContain('<AdministrationID>ADM-999</AdministrationID>')
    })

    it('sets ContactType to Company when companyName present', () => {
      const xml = untransformContact({ id: 'C-001', companyName: 'Acme BV' }, 'ADM-999')
      expect(xml).toContain('<ContactType>Company</ContactType>')
    })

    it('sets ContactType to Person when companyName absent', () => {
      const xml = untransformContact({ id: 'C-001', firstName: 'Jane', lastName: 'Doe' }, 'ADM-999')
      expect(xml).toContain('<ContactType>Person</ContactType>')
    })
  })
})
