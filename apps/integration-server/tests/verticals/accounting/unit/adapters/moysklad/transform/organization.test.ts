import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MoyskladOrganization } from '../../../../../../../src/verticals/accounting/adapters/moysklad/transform/organization'

function makeOrganization(overrides: Partial<MoyskladOrganization> = {}): MoyskladOrganization {
  return {
    id: 'org-1',
    name: 'My Company LLC',
    inn: '9876543210',
    legalAddress: { city: 'Saint Petersburg' },
    ...overrides,
  }
}

describe('transformOrganization (moysklad)', () => {
  it('maps id field', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-1')
  })

  it('maps name field', () => {
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
