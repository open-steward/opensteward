import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type PagaBusiness } from '../../../../../../../src/verticals/accounting/adapters/paga/transform/organization'

function makeRaw(overrides: Partial<PagaBusiness> = {}): PagaBusiness {
  return {
    businessName: 'Paga Inc',
    businessEmail: 'info@paga.com',
    ...overrides,
  }
}

describe('paga transformOrganization', () => {
  it('maps businessName to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Paga Inc')
  })

  it('returns undefined name when businessName absent', () => {
    expect(transformOrganization(makeRaw({ businessName: undefined })).name).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
