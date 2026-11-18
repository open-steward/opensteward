import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type KonturelbaOrganization } from '../../../../../../../src/verticals/accounting/adapters/konturelba/transform/organization'

function makeOrganization(overrides: Partial<KonturelbaOrganization> = {}): KonturelbaOrganization {
  return {
    id: 'org-1',
    name: 'My Company',
    inn: '9876543210',
    ...overrides,
  }
}

describe('transformOrganization (konturelba)', () => {
  it('maps id field', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-1')
  })

  it('maps name field', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('My Company')
  })

  it('maps taxNumber from inn', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('9876543210')
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
