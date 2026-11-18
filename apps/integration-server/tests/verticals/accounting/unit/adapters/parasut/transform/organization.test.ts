import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ParasutMe } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/organization'

function makeOrg(overrides: Partial<ParasutMe> = {}): ParasutMe {
  return {
    id: 'org_1',
    type: 'companies',
    attributes: {
      name: 'Acme Ticaret A.Ş.',
      email: 'info@acme.com.tr',
    },
    ...overrides,
  }
}

describe('transformOrganization (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformOrganization(makeOrg()).id).toBe('org_1')
  })

  it('maps name and legalName from attributes.name', () => {
    const o = transformOrganization(makeOrg())
    expect(o.name).toBe('Acme Ticaret A.Ş.')
    expect(o.legalName).toBe('Acme Ticaret A.Ş.')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: ParasutMe = { id: 'org_2', type: 'companies', attributes: {} }
    const o = transformOrganization(raw)
    expect(o.id).toBe('org_2')
    expect(o.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
