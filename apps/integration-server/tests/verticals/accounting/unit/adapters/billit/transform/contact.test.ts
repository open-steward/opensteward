import { describe, it, expect } from 'vitest'
import {
  transformParty,
  type BillitParty,
  type BillitPartyAddress,
} from '../../../../../../../src/verticals/accounting/adapters/billit/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeParty(overrides: Partial<BillitParty> = {}): BillitParty {
  return {
    PartyID: 'party-1',
    Name: 'ACME Corp',
    CommercialName: 'ACME Industries',
    VATNumber: 'BE0123456789',
    PartyType: 'Customer',
    Email: 'billing@acme.com',
    Phone: '+32 2 123 45 67',
    ...overrides,
  }
}

function makeAddress(overrides: Partial<BillitPartyAddress> = {}): BillitPartyAddress {
  return {
    AddressType: 'InvoiceAddress',
    Street: 'Rue de la Loi',
    StreetNumber: '10',
    Box: 'A',
    Zipcode: '1000',
    City: 'Brussels',
    CountryCode: 'BE',
    ...overrides,
  }
}

describe('transformParty', () => {
  it('maps PartyID to id', () => {
    expect(transformParty(makeParty()).id).toBe('party-1')
  })

  it('falls back to Nr when no PartyID', () => {
    const raw = makeParty({ PartyID: undefined, Nr: 'nr-42' })
    expect(transformParty(raw).id).toBe('nr-42')
  })

  it('maps CommercialName to companyName', () => {
    expect(transformParty(makeParty()).companyName).toBe('ACME Industries')
  })

  it('falls back to Name when no CommercialName', () => {
    const raw = makeParty({ CommercialName: undefined })
    expect(transformParty(raw).companyName).toBe('ACME Corp')
  })

  it('maps VATNumber to taxNumber', () => {
    expect(transformParty(makeParty()).taxNumber).toBe('BE0123456789')
  })

  it('PartyType Customer sets isCustomer=true, isSupplier=false', () => {
    const result = transformParty(makeParty({ PartyType: 'Customer' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('PartyType Supplier sets isSupplier=true, isCustomer=false', () => {
    const result = transformParty(makeParty({ PartyType: 'Supplier' }))
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('unknown PartyType defaults to isCustomer=true', () => {
    const result = transformParty(makeParty({ PartyType: undefined }))
    expect(result.isCustomer).toBe(true)
  })

  it('maps Email to emails array', () => {
    const result = transformParty(makeParty())
    expect(result.emails).toBeDefined()
    expect(result.emails!.length).toBeGreaterThan(0)
    expect(result.emails![0].email).toBe('billing@acme.com')
  })

  it('maps Phone to telephones array', () => {
    const result = transformParty(makeParty())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].telephone).toBe('+32 2 123 45 67')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('picks InvoiceAddress for billingAddress', () => {
    const raw = makeParty({
      Addresses: [makeAddress({ AddressType: 'InvoiceAddress', City: 'Brussels' })],
    })
    const result = transformParty(raw)
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.city).toBe('Brussels')
  })

  it('picks DeliveryAddress for shippingAddress', () => {
    const raw = makeParty({
      Addresses: [
        makeAddress({ AddressType: 'InvoiceAddress', City: 'Brussels' }),
        makeAddress({ AddressType: 'DeliveryAddress', City: 'Ghent', StreetNumber: '5' }),
      ],
    })
    const result = transformParty(raw)
    expect(result.shippingAddress).toBeDefined()
    expect(result.shippingAddress!.city).toBe('Ghent')
  })

  it('builds address1 from Street + StreetNumber + Box', () => {
    const raw = makeParty({
      Addresses: [makeAddress({ Street: 'Rue Neuve', StreetNumber: '3', Box: 'B' })],
    })
    const result = transformParty(raw)
    expect(result.billingAddress!.address1).toContain('Rue Neuve')
    expect(result.billingAddress!.address1).toContain('3')
    expect(result.billingAddress!.address1).toContain('B')
  })

  it('uses address Phone as fallback when no top-level Phone', () => {
    const raw = makeParty({
      Phone: undefined,
      Addresses: [makeAddress({ AddressType: 'InvoiceAddress', Phone: '+32 9 000 00 00' })],
    })
    const result = transformParty(raw)
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].telephone).toBe('+32 9 000 00 00')
  })

  it('passes schema validation', () => {
    expect(() => ContactSchema.parse(transformParty(makeParty()))).not.toThrow()
  })

  it('passes raw object as metadata', () => {
    const raw = makeParty()
    expect(transformParty(raw).metadata).toBe(raw)
  })
})
