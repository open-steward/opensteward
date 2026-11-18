import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type ReckonOneBook,
} from '../../../../../../../src/verticals/accounting/adapters/reckon-one/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeBook(overrides: Partial<ReckonOneBook> = {}): ReckonOneBook {
  return {
    id: 'book_001',
    name: 'My Business',
    legalName: 'My Business Pty Ltd',
    currencyCode: 'AUD',
    timezone: 'Australia/Sydney',
    taxNumber: '12 345 678 901',
    fiscalYearEnd: '06-30',
    website: 'https://mybusiness.com.au',
    address: {
      street: '1 Collins Street',
      city: 'Melbourne',
      state: 'VIC',
      postCode: '3000',
      country: 'AU',
    },
    createdDateTime: '2020-07-01T00:00:00Z',
    modifiedDateTime: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeBook()).id).toBe('book_001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeBook()).name).toBe('My Business')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeBook()).legalName).toBe('My Business Pty Ltd')
  })

  it('maps currencyCode to currency', () => {
    expect(transformOrganization(makeBook()).currency).toBe('AUD')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeBook()).timezone).toBe('Australia/Sydney')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeBook()).taxNumber).toBe('12 345 678 901')
  })

  it('maps website', () => {
    expect(transformOrganization(makeBook()).website).toBe('https://mybusiness.com.au')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeBook())
    expect(result.address?.address1).toBe('1 Collins Street')
    expect(result.address?.city).toBe('Melbourne')
    expect(result.address?.region).toBe('VIC')
    expect(result.address?.postalCode).toBe('3000')
    expect(result.address?.country).toBe('AU')
  })

  it('address is undefined when address field is absent', () => {
    expect(transformOrganization(makeBook({ address: undefined })).address).toBeUndefined()
  })

  it('maps createdDateTime to createdAt', () => {
    expect(transformOrganization(makeBook()).createdAt).toEqual(new Date('2020-07-01T00:00:00Z'))
  })

  it('maps modifiedDateTime to updatedAt', () => {
    expect(transformOrganization(makeBook()).updatedAt).toEqual(new Date('2024-01-01T00:00:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeBook()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces output that passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeBook()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformOrganization({})
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
