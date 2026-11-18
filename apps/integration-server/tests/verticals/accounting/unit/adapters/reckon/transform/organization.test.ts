import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type ReckonBook,
} from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/organization'

function makeBook(overrides: Partial<ReckonBook> = {}): ReckonBook {
  return {
    id: 'book-1',
    name: 'Reckon Books',
    legalName: 'Reckon Books Pty Ltd',
    email: 'admin@reckon.com',
    phone: '+61-2-12345678',
    website: 'https://reckon.com',
    address: '1 Tax Street',
    city: 'Sydney',
    state: 'NSW',
    postCode: '2000',
    country: 'AU',
    currencyCode: 'AUD',
    abn: '12-345-678-901',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    const result = transformOrganization(makeBook())
    expect(result.id).toBe('book-1')
  })

  it('maps name and legalName', () => {
    const result = transformOrganization(makeBook())
    expect(result.name).toBe('Reckon Books')
    expect(result.legalName).toBe('Reckon Books Pty Ltd')
  })

  it('maps abn to taxNumber', () => {
    const result = transformOrganization(makeBook())
    expect(result.taxNumber).toBe('12-345-678-901')
  })

  it('maps currencyCode to currency', () => {
    const result = transformOrganization(makeBook())
    expect(result.currency).toBe('AUD')
  })

  it('maps website', () => {
    const result = transformOrganization(makeBook())
    expect(result.website).toBe('https://reckon.com')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeBook())
    expect(result.address?.address1).toBe('1 Tax Street')
    expect(result.address?.city).toBe('Sydney')
    expect(result.address?.region).toBe('NSW')
    expect(result.address?.postalCode).toBe('2000')
    expect(result.address?.country).toBe('AU')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeBook()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeBook())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
