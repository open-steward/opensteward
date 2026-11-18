import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ComarchoptimaOrganization } from '../../../../../../../src/verticals/accounting/adapters/comarchoptima/transform/organization'

function makeOrganization(overrides: Partial<ComarchoptimaOrganization> = {}): ComarchoptimaOrganization {
  return {
    id: '1',
    nazwa_firmy: 'Comarch SA',
    nazwa_prawna: 'Comarch Spółka Akcyjna',
    nip: '6770065406',
    waluta: 'PLN',
    email: 'info@comarch.pl',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id to string', () => {
    expect(transformOrganization(makeOrganization({ id: 7 })).id).toBe('7')
  })

  it('maps name from nazwa_firmy', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Comarch SA')
  })

  it('maps legalName from nazwa_prawna', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Comarch Spółka Akcyjna')
  })

  it('maps taxNumber from nip', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('6770065406')
  })

  it('maps currency from waluta', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('PLN')
  })

  it('returns undefined name when nazwa_firmy is missing', () => {
    expect(transformOrganization(makeOrganization({ nazwa_firmy: undefined })).name).toBeUndefined()
  })

  it('returns undefined legalName when nazwa_prawna is missing', () => {
    expect(transformOrganization(makeOrganization({ nazwa_prawna: undefined })).legalName).toBeUndefined()
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
