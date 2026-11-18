import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type CalxaEntity,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeEntity(overrides: Partial<CalxaEntity> = {}): CalxaEntity {
  return {
    id: 'entity-001',
    name: 'Acme Industries',
    legalName: 'Acme Industries, Inc.',
    taxNumber: 'US-123456789',
    currency: 'USD',
    timezone: 'America/New_York',
    website: 'https://www.acme.example',
    fiscalYearEnd: 12,
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id as-is', () => {
    expect(transformOrganization(makeEntity()).id).toBe('entity-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeEntity()).name).toBe('Acme Industries')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeEntity()).legalName).toBe('Acme Industries, Inc.')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeEntity()).taxNumber).toBe('US-123456789')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeEntity()).currency).toBe('USD')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeEntity()).timezone).toBe('America/New_York')
  })

  it('maps website', () => {
    expect(transformOrganization(makeEntity()).website).toBe('https://www.acme.example')
  })

  it('maps fiscalYearEnd to fiscalYearEndMonth', () => {
    expect(transformOrganization(makeEntity()).fiscalYearEndMonth).toBe(12)
  })

  it('returns undefined fiscalYearEndMonth when fiscalYearEnd is undefined', () => {
    expect(
      transformOrganization(makeEntity({ fiscalYearEnd: undefined })).fiscalYearEndMonth,
    ).toBeUndefined()
  })

  it('maps address fields', () => {
    const result = transformOrganization(
      makeEntity({
        address: {
          line1: '123 Main St',
          city: 'New York',
          region: 'NY',
          postalCode: '10001',
          country: 'US',
        },
      }),
    )
    expect(result.address).toBeDefined()
    expect(result.address!.address1).toBe('123 Main St')
    expect(result.address!.city).toBe('New York')
  })

  it('returns undefined address when address is undefined', () => {
    expect(transformOrganization(makeEntity({ address: undefined })).address).toBeUndefined()
  })

  it('maps createdAt to Date', () => {
    const result = transformOrganization(makeEntity({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformOrganization(makeEntity({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeEntity()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeEntity()))).not.toThrow()
  })
})
