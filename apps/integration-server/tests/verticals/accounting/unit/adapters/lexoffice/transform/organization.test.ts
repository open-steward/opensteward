import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type LexofficeOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/organization'

function makeOrganization(overrides: Partial<LexofficeOrganization> = {}): LexofficeOrganization {
  return {
    organizationId: 'org-uuid-001',
    companyName: 'Lexoffice Test GmbH',
    created: { userEmail: 'admin@example.com' },
    connectionId: 'conn-uuid-001',
    taxType: 'net',
    smallBusiness: false,
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps companyName to name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Lexoffice Test GmbH')
  })

  it('returns undefined name when companyName is empty', () => {
    expect(transformOrganization(makeOrganization({ companyName: '' })).name).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
