import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MeritaktivaOrganization } from '../../../../../../../src/verticals/accounting/adapters/meritaktiva/transform/organization'

function makeOrganization(overrides: Partial<MeritaktivaOrganization> = {}): MeritaktivaOrganization {
  return {
    Id: '1',
    Name: 'My Company OÜ',
    RegCode: 'EE10001234',
    ...overrides,
  }
}

describe('transformOrganization (meritaktiva)', () => {
  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('My Company OÜ')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('My Company OÜ')
  })

  it('maps RegCode to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('EE10001234')
  })

  it('handles missing RegCode', () => {
    expect(transformOrganization(makeOrganization({ RegCode: undefined })).taxNumber).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
