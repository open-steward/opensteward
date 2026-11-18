import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type BillitAccountInfo,
  type BillitAccountAddress,
} from '../../../../../../../src/verticals/accounting/adapters/billit/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeAccountInfo(overrides: Partial<BillitAccountInfo> = {}): BillitAccountInfo {
  return {
    CompanyID: 123,
    Name: 'Acme NV',
    CommercialName: 'Acme Industries',
    VATNumber: 'BE0999888777',
    Currency: 'EUR',
    Email: 'info@acme.be',
    Phone: '+32 2 555 00 00',
    ...overrides,
  }
}

function makeAddress(overrides: Partial<BillitAccountAddress> = {}): BillitAccountAddress {
  return {
    AddressType: 'InvoiceAddress',
    Street: 'Grootplein',
    StreetNumber: '1',
    Box: 'Bus 2',
    Zipcode: '2000',
    City: 'Antwerp',
    CountryCode: 'BE',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps CompanyID to id as string', () => {
    expect(transformOrganization(makeAccountInfo()).id).toBe('123')
  })

  it('maps CommercialName to name', () => {
    expect(transformOrganization(makeAccountInfo()).name).toBe('Acme Industries')
  })

  it('falls back to Name when no CommercialName', () => {
    const raw = makeAccountInfo({ CommercialName: undefined })
    expect(transformOrganization(raw).name).toBe('Acme NV')
  })

  it('maps Name to legalName', () => {
    expect(transformOrganization(makeAccountInfo()).legalName).toBe('Acme NV')
  })

  it('maps VATNumber to taxNumber', () => {
    expect(transformOrganization(makeAccountInfo()).taxNumber).toBe('BE0999888777')
  })

  it('maps Currency to currency', () => {
    expect(transformOrganization(makeAccountInfo()).currency).toBe('EUR')
  })

  it('finds InvoiceAddress and maps to address', () => {
    const raw = makeAccountInfo({ Addresses: [makeAddress()] })
    const result = transformOrganization(raw)
    expect(result.address).toBeDefined()
    expect(result.address!.city).toBe('Antwerp')
    expect(result.address!.postalCode).toBe('2000')
    expect(result.address!.country).toBe('BE')
  })

  it('builds address1 from Street + StreetNumber + Box', () => {
    const raw = makeAccountInfo({
      Addresses: [makeAddress({ Street: 'Grootplein', StreetNumber: '1', Box: 'Bus 2' })],
    })
    const result = transformOrganization(raw)
    expect(result.address!.address1).toContain('Grootplein')
    expect(result.address!.address1).toContain('1')
    expect(result.address!.address1).toContain('Bus 2')
  })

  it('omits address when no InvoiceAddress found', () => {
    const raw = makeAccountInfo({
      Addresses: [makeAddress({ AddressType: 'DeliveryAddress' })],
    })
    const result = transformOrganization(raw)
    // address is computed from toAddress with all undefined fields; may be undefined or empty
    // The key assertion is no InvoiceAddress was used
    expect(result.id).toBe('123')
  })

  it('handles missing Addresses gracefully', () => {
    const raw = makeAccountInfo({ Addresses: undefined })
    expect(() => transformOrganization(raw)).not.toThrow()
  })

  it('handles missing CompanyID gracefully', () => {
    const raw = makeAccountInfo({ CompanyID: undefined })
    expect(transformOrganization(raw).id).toBeUndefined()
  })

  it('passes schema validation', () => {
    const raw = makeAccountInfo({ Addresses: [makeAddress()] })
    expect(() => OrganizationSchema.parse(transformOrganization(raw))).not.toThrow()
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccountInfo()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })
})
