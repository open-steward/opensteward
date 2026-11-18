import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type IdokladOrganization } from '../../../../../../../src/verticals/accounting/adapters/idoklad/transform/organization'

function makeOrganization(overrides: Partial<IdokladOrganization> = {}): IdokladOrganization {
  return {
    Id: '1',
    CompanyName: 'iDoklad s.r.o.',
    LegalName: 'iDoklad spol. s r.o.',
    TaxNumber: 'CZ02684539',
    CurrencyId: 'CZK',
    Email: 'podpora@idoklad.cz',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps Id to string id', () => {
    expect(transformOrganization(makeOrganization({ Id: 7 })).id).toBe('7')
  })

  it('maps name from CompanyName', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('iDoklad s.r.o.')
  })

  it('maps legalName from LegalName field', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('iDoklad spol. s r.o.')
  })

  it('maps taxNumber from TaxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('CZ02684539')
  })

  it('maps currency from CurrencyId', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('CZK')
  })

  it('returns undefined name when CompanyName is missing', () => {
    expect(transformOrganization(makeOrganization({ CompanyName: undefined })).name).toBeUndefined()
  })

  it('returns undefined legalName when LegalName is missing', () => {
    expect(transformOrganization(makeOrganization({ LegalName: undefined })).legalName).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization({ Id: 7 }))
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
