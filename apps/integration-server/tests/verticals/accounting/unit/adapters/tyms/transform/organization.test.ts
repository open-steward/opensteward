import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type TymsBusiness,
} from '../../../../../../../src/verticals/accounting/adapters/tyms/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeBusiness(overrides: Partial<TymsBusiness> = {}): TymsBusiness {
  return {
    uuid: 'org-001',
    name: 'Acme Ltd',
    legal_name: 'Acme Limited',
    tax_number: 'TAX-12345',
    currency: 'USD',
    timezone: 'America/New_York',
    website: 'https://acme.example.com',
    address: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    country: 'US',
    postal_code: '62701',
    phone: '+15559876543',
    email: 'info@acme.example.com',
    created_at: '2023-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeBusiness())
    expect(result.id).toBe('org-001')
    expect(result.name).toBe('Acme Ltd')
    expect(result.legalName).toBe('Acme Limited')
    expect(result.taxNumber).toBe('TAX-12345')
    expect(result.currency).toBe('USD')
    expect(result.timezone).toBe('America/New_York')
    expect(result.website).toBe('https://acme.example.com')
  })

  it('falls back to id field when uuid is absent', () => {
    const result = transformOrganization(makeBusiness({ uuid: undefined, id: 'fallback-id' }))
    expect(result.id).toBe('fallback-id')
  })

  it('maps address block', () => {
    const result = transformOrganization(makeBusiness())
    expect(result.address).toBeDefined()
    expect(result.address!.address1).toBe('123 Main St')
    expect(result.address!.city).toBe('Springfield')
    expect(result.address!.country).toBe('US')
    expect(result.address!.postalCode).toBe('62701')
  })

  it('omits address block when no address data', () => {
    const result = transformOrganization(
      makeBusiness({ address: undefined, city: undefined, country: undefined }),
    )
    expect(result.address).toBeUndefined()
  })

  it('parses dates as Date objects', () => {
    const result = transformOrganization(makeBusiness())
    expect(result.createdAt).toEqual(new Date('2023-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes raw as metadata', () => {
    const raw = makeBusiness()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformOrganization(makeBusiness())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
