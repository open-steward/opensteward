import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ChanjetOrganization } from '../../../../../../../src/verticals/accounting/adapters/chanjet/transform/organization'

function makeOrganization(overrides: Partial<ChanjetOrganization> = {}): ChanjetOrganization {
  return {
    companyId: 'org-1',
    companyName: 'Chanjet Test Corp',
    taxNo: '91110000123456789X',
    ...overrides,
  }
}

describe('transformOrganization (chanjet)', () => {
  it('maps id from companyId', () => { expect(transformOrganization(makeOrganization()).id).toBe('org-1') })
  it('maps name from companyName', () => { expect(transformOrganization(makeOrganization()).name).toBe('Chanjet Test Corp') })
  it('maps taxNumber from taxNo', () => { expect(transformOrganization(makeOrganization()).taxNumber).toBe('91110000123456789X') })
  it('metadata identity', () => { const raw = makeOrganization(); expect(transformOrganization(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
