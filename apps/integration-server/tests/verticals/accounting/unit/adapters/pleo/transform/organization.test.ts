import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type PleoCompanyBalance,
} from '../../../../../../../src/verticals/accounting/adapters/pleo/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<PleoCompanyBalance> = {}): PleoCompanyBalance {
  return {
    currency: 'DKK',
    current: 100000,
    available: 80000,
    ...overrides,
  }
}

describe('pleo transformOrganization', () => {
  it('maps currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('DKK')
  })

  it('returns undefined currency when absent', () => {
    expect(transformOrganization(makeRaw({ currency: undefined })).currency).toBeUndefined()
  })

  it('does not map current or available (not in Organization schema)', () => {
    const result = transformOrganization(makeRaw())
    // Only currency is populated from PleoCompanyBalance; other org fields should be absent
    expect(result.name).toBeUndefined()
    expect(result.taxNumber).toBeUndefined()
  })

  it('passes OrganizationSchema.parse', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})
