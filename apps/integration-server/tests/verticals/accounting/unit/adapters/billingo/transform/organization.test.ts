import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type BillingoOrganization } from '../../../../../../../src/verticals/accounting/adapters/billingo/transform/organization'

function makeOrg(overrides: Partial<BillingoOrganization> = {}): BillingoOrganization {
  return {
    id: '1',
    name: 'Billingo Kft',
    taxcode: '98765432-2-42',
    ...overrides,
  }
}

describe('transformOrganization (billingo)', () => {
  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Billingo Kft')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('Billingo Kft')
  })

  it('maps taxcode to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('98765432-2-42')
  })

  it('handles missing taxcode', () => {
    expect(transformOrganization(makeOrg({ taxcode: undefined })).taxNumber).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
