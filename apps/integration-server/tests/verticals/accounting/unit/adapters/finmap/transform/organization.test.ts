import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FinmapOrganization } from '../../../../../../../src/verticals/accounting/adapters/finmap/transform/organization'

function makeOrg(overrides: Partial<FinmapOrganization> = {}): FinmapOrganization {
  return {
    id: 'org-1',
    name: 'ТОВ Фінмап Тест',
    inn: '3456789012',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeOrg()).id).toBe('org-1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('ТОВ Фінмап Тест')
  })

  it('maps legalName same as name', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('ТОВ Фінмап Тест')
  })

  it('maps inn to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('3456789012')
  })

  it('handles missing inn', () => {
    expect(transformOrganization(makeOrg({ inn: undefined })).taxNumber).toBeUndefined()
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
