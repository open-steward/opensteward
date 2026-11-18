import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type CampfireEntity,
} from '../../../../../../../src/verticals/accounting/adapters/campfire/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrganization(overrides: Partial<CampfireEntity> = {}): CampfireEntity {
  return {
    id: 1,
    name: 'Acme Industries',
    currency: 'USD',
    tax_identification_number: 'US-123456789',
    fiscal_year_month: 12,
    address_1: '123 Main St',
    city: 'Springfield',
    country: 'US',
    created_at: '2024-01-01T00:00:00Z',
    last_modified_at: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id to string', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Industries')
  })

  it('maps name to legalName as well', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme Industries')
  })

  it('maps tax_identification_number to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('US-123456789')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps fiscal_year_month to fiscalYearEndMonth', () => {
    expect(transformOrganization(makeOrganization()).fiscalYearEndMonth).toBe(12)
  })

  it('maps address fields when address_1 is present', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('123 Main St')
    expect(result.address?.city).toBe('Springfield')
    expect(result.address?.country).toBe('US')
  })

  it('maps address_2 to address2', () => {
    const result = transformOrganization(makeOrganization({ address_2: 'Suite 500' }))
    expect(result.address?.address2).toBe('Suite 500')
  })

  it('maps state to region in address', () => {
    const result = transformOrganization(makeOrganization({ state: 'CA' }))
    expect(result.address?.region).toBe('CA')
  })

  it('maps zip_code to postalCode in address', () => {
    const result = transformOrganization(makeOrganization({ zip_code: '62701' }))
    expect(result.address?.postalCode).toBe('62701')
  })

  it('omits address when address_1, city, and country are all absent', () => {
    const result = transformOrganization(
      makeOrganization({ address_1: null, city: null, country: null }),
    )
    expect(result.address).toBeUndefined()
  })

  it('includes address when only city is present', () => {
    const result = transformOrganization(
      makeOrganization({ address_1: null, city: 'Springfield', country: null }),
    )
    expect(result.address?.city).toBe('Springfield')
  })

  it('maps created_at to createdAt Date', () => {
    expect(transformOrganization(makeOrganization()).createdAt).toEqual(
      new Date('2024-01-01T00:00:00Z'),
    )
  })

  it('maps last_modified_at to updatedAt Date', () => {
    expect(transformOrganization(makeOrganization()).updatedAt).toEqual(
      new Date('2024-06-01T00:00:00Z'),
    )
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeOrganization()))).not.toThrow()
  })
})
