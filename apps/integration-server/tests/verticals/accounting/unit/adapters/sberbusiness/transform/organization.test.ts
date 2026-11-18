import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type SberbusinessOrganization } from '../../../../../../../src/verticals/accounting/adapters/sberbusiness/transform/organization'

function makeOrganization(overrides: Partial<SberbusinessOrganization> = {}): SberbusinessOrganization {
  return {
    organizationId: 'org-1',
    organizationName: 'My Company LLC',
    inn: '9876543210',
    ...overrides,
  }
}

describe('transformOrganization (sberbusiness)', () => {
  it('maps id from organizationId', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-1')
  })

  it('maps name from organizationName', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('My Company LLC')
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
