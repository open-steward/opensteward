import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type StampliCompany,
} from '../../../../../../../src/verticals/accounting/adapters/stampli/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<StampliCompany> = {}): StampliCompany {
  return {
    id: 'company-001',
    name: 'Acme Corp',
    legalName: 'Acme Corporation Inc',
    taxId: 'US-987654321',
    currency: 'USD',
    timezone: 'America/New_York',
    address1: '456 Oak Ave',
    address2: 'Floor 3',
    city: 'Chicago',
    state: 'IL',
    postalCode: '60601',
    country: 'US',
    createdAt: '2024-01-15T09:30:00.000Z',
    updatedAt: '2024-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('stampli transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('company-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Acme Corp')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Acme Corporation Inc')
  })

  it('falls back to name for legalName when legalName absent', () => {
    expect(transformOrganization(makeRaw({ legalName: undefined })).legalName).toBe('Acme Corp')
  })

  it('maps taxId to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('US-987654321')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('USD')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeRaw()).timezone).toBe('America/New_York')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.address1).toBe('456 Oak Ave')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.country).toBe('US')
  })

  it('maps createdAt to Date', () => {
    expect(transformOrganization(makeRaw()).createdAt).toEqual(new Date('2024-01-15T09:30:00.000Z'))
  })

  it('maps updatedAt to Date', () => {
    expect(transformOrganization(makeRaw()).updatedAt).toEqual(new Date('2024-02-01T14:20:00.000Z'))
  })

  it('passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrganization({})).not.toThrow()
  })
})
