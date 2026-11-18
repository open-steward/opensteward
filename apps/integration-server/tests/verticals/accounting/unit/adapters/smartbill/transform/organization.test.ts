import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type SmartbillOrganization } from '../../../../../../../src/verticals/accounting/adapters/smartbill/transform/organization'

function makeOrg(overrides: Partial<SmartbillOrganization> = {}): SmartbillOrganization {
  return {
    id: '1',
    name: 'SC SmartBill SRL',
    cif: 'RO20999999',
    ...overrides,
  }
}

describe('transformOrganization (smartbill)', () => {
  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('SC SmartBill SRL')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('SC SmartBill SRL')
  })

  it('maps cif to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('RO20999999')
  })

  it('handles missing cif', () => {
    expect(transformOrganization(makeOrg({ cif: undefined })).taxNumber).toBeUndefined()
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
