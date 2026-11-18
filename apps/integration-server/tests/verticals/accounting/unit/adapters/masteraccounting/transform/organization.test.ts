import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MasteraccountingOrganization } from '../../../../../../../src/verticals/accounting/adapters/masteraccounting/transform/organization'

function makeOrg(overrides: Partial<MasteraccountingOrganization> = {}): MasteraccountingOrganization {
  return {
    id: 'org-1',
    name: 'ТОВ Мастер Облік',
    taxCode: '11223344',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeOrg()).id).toBe('org-1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('ТОВ Мастер Облік')
  })

  it('maps legalName same as name', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('ТОВ Мастер Облік')
  })

  it('maps taxCode to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('11223344')
  })

  it('handles missing taxCode', () => {
    expect(transformOrganization(makeOrg({ taxCode: undefined })).taxNumber).toBeUndefined()
  })

  it('handles empty name', () => {
    const result = transformOrganization(makeOrg({ name: '' }))
    expect(result.name).toBeUndefined()
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
