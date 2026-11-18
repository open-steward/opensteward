import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type DilovodOrganization } from '../../../../../../../src/verticals/accounting/adapters/dilovod/transform/organization'

function makeOrg(overrides: Partial<DilovodOrganization> = {}): DilovodOrganization {
  return {
    id: 'org-1',
    name: 'ТОВ Тест',
    edrpou: '87654321',
    email: 'office@test.ua',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeOrg()).id).toBe('org-1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('ТОВ Тест')
  })

  it('maps legalName same as name', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('ТОВ Тест')
  })

  it('maps edrpou to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('87654321')
  })

  it('handles missing edrpou', () => {
    expect(transformOrganization(makeOrg({ edrpou: undefined })).taxNumber).toBeUndefined()
  })

  it('handles missing name', () => {
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
