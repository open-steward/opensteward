import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type KingdeeOrganization } from '../../../../../../../src/verticals/accounting/adapters/kingdee/transform/organization'

function makeOrganization(overrides: Partial<KingdeeOrganization> = {}): KingdeeOrganization {
  return {
    orgId: 'org-1',
    orgName: 'My Company Ltd',
    taxId: '91110000123456789X',
    ...overrides,
  }
}

describe('transformOrganization (kingdee)', () => {
  it('maps id from orgId', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-1')
  })

  it('maps name from orgName', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('My Company Ltd')
  })

  it('maps taxNumber from taxId', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('91110000123456789X')
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
