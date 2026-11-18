import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type SuperfakturaOrganization } from '../../../../../../../src/verticals/accounting/adapters/superfaktura/transform/organization'

function makeOrg(overrides: Partial<SuperfakturaOrganization> = {}): SuperfakturaOrganization {
  return { id: '1', name: 'Demo s.r.o.', business_name: 'Demo Slovakia s.r.o.', ico: '87654321', currency: 'EUR', email: 'demo@demo.sk', ...overrides }
}

describe('transformOrganization', () => {
  it('maps id', () => { expect(transformOrganization(makeOrg()).id).toBe('1') })
  it('maps name', () => { expect(transformOrganization(makeOrg()).name).toBe('Demo s.r.o.') })
  it('maps business_name to legalName', () => { expect(transformOrganization(makeOrg()).legalName).toBe('Demo Slovakia s.r.o.') })
  it('maps ico to taxNumber', () => { expect(transformOrganization(makeOrg()).taxNumber).toBe('87654321') })
  it('maps currency', () => { expect(transformOrganization(makeOrg()).currency).toBe('EUR') })
  it('metadata identity', () => { const raw = makeOrg(); expect(transformOrganization(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
