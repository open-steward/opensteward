import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type KoraBusiness } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/organization'

function makeRaw(overrides: Partial<KoraBusiness> = {}): KoraBusiness {
  return { ...overrides }
}

describe('kora transformOrganization', () => {
  it('handles empty object gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })
  it('maps business_name to name', () => {
    expect(transformOrganization(makeRaw({ business_name: 'Kora Business' })).name).toBe('Kora Business')
  })
  it('returns undefined name when business_name is missing', () => {
    expect(transformOrganization(makeRaw()).name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
