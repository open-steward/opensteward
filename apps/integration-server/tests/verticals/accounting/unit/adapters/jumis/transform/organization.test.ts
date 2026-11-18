import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type JumisOrganization } from '../../../../../../../src/verticals/accounting/adapters/jumis/transform/organization'

function makeOrg(overrides: Partial<JumisOrganization> = {}): JumisOrganization {
  return {
    id: '1',
    name: 'Jumis Corp SIA',
    reg_nr: 'LV40000012345',
    ...overrides,
  }
}

describe('transformOrganization (jumis)', () => {
  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Jumis Corp SIA')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('Jumis Corp SIA')
  })

  it('maps reg_nr to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('LV40000012345')
  })

  it('handles missing reg_nr', () => {
    expect(transformOrganization(makeOrg({ reg_nr: undefined })).taxNumber).toBeUndefined()
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
