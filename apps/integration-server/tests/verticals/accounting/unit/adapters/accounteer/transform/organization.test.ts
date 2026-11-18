import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AccounteerBusiness } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/organization'

function makeRaw(overrides: Partial<AccounteerBusiness> = {}): AccounteerBusiness {
  return { id: '1', ...overrides }
}

describe('accounteer transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })
  it('maps name', () => {
    expect(transformOrganization(makeRaw({ name: 'Acme Corp' })).name).toBe('Acme Corp')
  })
  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeRaw({ tax_number: 'GB123456' })).taxNumber).toBe('GB123456')
  })
  it('maps currency', () => {
    expect(transformOrganization(makeRaw({ currency: 'EUR' })).currency).toBe('EUR')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
