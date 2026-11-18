import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type PohodaOrganization } from '../../../../../../../src/verticals/accounting/adapters/pohoda/transform/organization'

function makeOrganization(overrides: Partial<PohodaOrganization> = {}): PohodaOrganization {
  return {
    id: '1',
    company: 'Stormware s.r.o.',
    legalName: 'Stormware spol. s r.o.',
    ico: '25313142',
    currency: 'CZK',
    email: 'info@stormware.cz',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id to string', () => {
    expect(transformOrganization(makeOrganization({ id: 7 })).id).toBe('7')
  })

  it('maps name from company', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Stormware s.r.o.')
  })

  it('maps legalName from legalName field', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Stormware spol. s r.o.')
  })

  it('maps taxNumber from ico', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('25313142')
  })

  it('maps currency from currency field', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('CZK')
  })

  it('returns undefined name when company is missing', () => {
    expect(transformOrganization(makeOrganization({ company: undefined })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when ico is missing', () => {
    expect(transformOrganization(makeOrganization({ ico: undefined })).taxNumber).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization({ id: 7 }))
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
