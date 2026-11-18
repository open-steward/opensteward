import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type SageOrganization } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/organization'

function makeRaw(overrides: Partial<SageOrganization> = {}): SageOrganization {
  return {
    id: 'org-001',
    name: 'My Business Ltd',
    base_currency: { id: 'GBP' },
    ...overrides,
  }
}

describe('transformOrganization (SageBusinessCloud)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('org-001')
    expect(result.name).toBe('My Business Ltd')
    expect(result.currency).toBe('GBP')
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
