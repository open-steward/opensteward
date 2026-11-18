import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type AvidXchangeCompany,
} from '../../../../../../../src/verticals/accounting/adapters/avidxchange/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<AvidXchangeCompany> = {}): AvidXchangeCompany {
  return {
    companyId: 'CO-001',
    companyName: 'Acme Corp',
    legalName: 'Acme Corporation LLC',
    taxId: 'US-987654321',
    address1: '500 Corporate Blvd',
    address2: 'Floor 10',
    city: 'Dallas',
    state: 'TX',
    postalCode: '75201',
    country: 'US',
    currency: 'USD',
    timezone: 'America/Chicago',
    createdDate: '2024-01-01T00:00:00.000Z',
    modifiedDate: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization (avidxchange)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('CO-001')
    expect(result.name).toBe('Acme Corp')
    expect(result.legalName).toBe('Acme Corporation LLC')
    expect(result.taxNumber).toBe('US-987654321')
    expect(result.currency).toBe('USD')
    expect(result.timezone).toBe('America/Chicago')
  })

  it('falls back legalName to companyName when legalName is missing', () => {
    const result = transformOrganization(makeRaw({ legalName: undefined }))
    expect(result.legalName).toBe('Acme Corp')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.address1).toBe('500 Corporate Blvd')
    expect(result.address?.city).toBe('Dallas')
    expect(result.address?.country).toBe('US')
  })

  it('parses dates as Date objects', () => {
    const result = transformOrganization(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
