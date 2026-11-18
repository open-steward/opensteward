import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AisinoOrganization } from '../../../../../../../src/verticals/accounting/adapters/aisino/transform/organization'

function makeOrganization(overrides: Partial<AisinoOrganization> = {}): AisinoOrganization {
  return {
    orgCode: 'org-1',
    orgName: 'Aisino Test Corp',
    taxCode: '91110000123456789X',
    ...overrides,
  }
}

describe('transformOrganization (aisino)', () => {
  it('maps id from orgCode', () => { expect(transformOrganization(makeOrganization()).id).toBe('org-1') })
  it('maps name from orgName', () => { expect(transformOrganization(makeOrganization()).name).toBe('Aisino Test Corp') })
  it('maps taxNumber from taxCode', () => { expect(transformOrganization(makeOrganization()).taxNumber).toBe('91110000123456789X') })
  it('metadata identity', () => { const raw = makeOrganization(); expect(transformOrganization(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
