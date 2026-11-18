import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type GeeyeeOrganization } from '../../../../../../../src/verticals/accounting/adapters/geeyee/transform/organization'

function makeOrganization(overrides: Partial<GeeyeeOrganization> = {}): GeeyeeOrganization {
  return {
    id: 'org-1',
    name: 'Geeyee Corp Ltd',
    taxNo: '91110000123456789X',
    ...overrides,
  }
}

describe('transformOrganization (geeyee)', () => {
  it('maps id', () => { expect(transformOrganization(makeOrganization()).id).toBe('org-1') })
  it('maps name', () => { expect(transformOrganization(makeOrganization()).name).toBe('Geeyee Corp Ltd') })
  it('maps taxNumber from taxNo', () => { expect(transformOrganization(makeOrganization()).taxNumber).toBe('91110000123456789X') })
  it('metadata identity', () => { const raw = makeOrganization(); expect(transformOrganization(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
