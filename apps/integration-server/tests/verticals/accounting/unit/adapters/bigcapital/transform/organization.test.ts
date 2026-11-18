import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type BigcapitalOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/bigcapital/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<BigcapitalOrganization> = {}): BigcapitalOrganization {
  return {
    id: 1,
    organizationId: 'org-abc123',
    isReady: true,
    metadata: [
      {
        id: 1,
        tenantId: 1,
        name: 'Acme Corp',
        industry: 'Technology',
        location: 'San Francisco, CA',
        baseCurrency: 'USD',
        language: 'en',
        timezone: 'America/Los_Angeles',
        taxNumber: 'US-123456789',
      },
    ],
    ...overrides,
  }
}

describe('transformOrganization (bigcapital)', () => {
  it('maps core fields from metadata[0]', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('org-abc123')
    expect(result.name).toBe('Acme Corp')
    expect(result.legalName).toBe('Acme Corp')
    expect(result.currency).toBe('USD')
    expect(result.timezone).toBe('America/Los_Angeles')
    expect(result.taxNumber).toBe('US-123456789')
  })

  it('returns undefined name when metadata is empty array', () => {
    const result = transformOrganization(makeRaw({ metadata: [] }))
    expect(result.name).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('returns undefined name when metadata is missing', () => {
    const result = transformOrganization(makeRaw({ metadata: undefined }))
    expect(result.name).toBeUndefined()
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
