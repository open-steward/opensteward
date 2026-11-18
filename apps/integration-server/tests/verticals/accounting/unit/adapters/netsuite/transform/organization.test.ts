import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type NetSuiteCompany } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/organization'

function makeOrg(overrides: Partial<NetSuiteCompany> = {}): NetSuiteCompany {
  return { id: 1, name: 'NS Corp', legalName: 'NS Corporation Inc', fein: '12-3456789', currency: 'USD', country: 'US', ...overrides }
}

describe('transformOrganization (netsuite)', () => {
  it('maps id, name, taxNumber', () => {
    const r = transformOrganization(makeOrg())
    expect(r.id).toBe('1')
    expect(r.name).toBe('NS Corp')
    expect(r.taxNumber).toBe('12-3456789')
  })
  it('maps currency', () => { expect(transformOrganization(makeOrg()).currency).toBe('USD') })
  it('maps country to address', () => { expect(transformOrganization(makeOrg()).address?.country).toBe('US') })
  it('passes raw as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
