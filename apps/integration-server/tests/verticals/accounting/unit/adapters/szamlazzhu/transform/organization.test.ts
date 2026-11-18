import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type SzamlazzhuOrganization } from '../../../../../../../src/verticals/accounting/adapters/szamlazzhu/transform/organization'

function makeOrg(overrides: Partial<SzamlazzhuOrganization> = {}): SzamlazzhuOrganization {
  return {
    id: '1',
    companyName: 'Számlázz.hu Kft',
    taxNumber: '22334455-2-13',
    ...overrides,
  }
}

describe('transformOrganization (szamlazzhu)', () => {
  it('maps companyName to name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Számlázz.hu Kft')
  })

  it('maps companyName to legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('Számlázz.hu Kft')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('22334455-2-13')
  })

  it('handles missing taxNumber', () => {
    expect(transformOrganization(makeOrg({ taxNumber: undefined })).taxNumber).toBeUndefined()
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
