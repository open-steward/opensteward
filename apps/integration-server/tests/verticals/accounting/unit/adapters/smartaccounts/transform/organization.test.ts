import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type SmartaccountsOrganization } from '../../../../../../../src/verticals/accounting/adapters/smartaccounts/transform/organization'

function makeOrg(overrides: Partial<SmartaccountsOrganization> = {}): SmartaccountsOrganization {
  return {
    id: '1',
    name: 'SmartCo OÜ',
    reg_code: 'EE10012345',
    ...overrides,
  }
}

describe('transformOrganization (smartaccounts)', () => {
  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('SmartCo OÜ')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('SmartCo OÜ')
  })

  it('maps reg_code to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('EE10012345')
  })

  it('handles missing reg_code', () => {
    expect(transformOrganization(makeOrg({ reg_code: undefined })).taxNumber).toBeUndefined()
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
