import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type TorgsoftOrganization } from '../../../../../../../src/verticals/accounting/adapters/torgsoft/transform/organization'

function makeOrg(overrides: Partial<TorgsoftOrganization> = {}): TorgsoftOrganization {
  return {
    id: 'org-1',
    name: 'ФОП Шевченко',
    tax_id: '3456789012',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeOrg()).id).toBe('org-1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('ФОП Шевченко')
  })

  it('maps legalName same as name', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('ФОП Шевченко')
  })

  it('maps tax_id to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('3456789012')
  })

  it('handles missing tax_id', () => {
    expect(transformOrganization(makeOrg({ tax_id: undefined })).taxNumber).toBeUndefined()
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
