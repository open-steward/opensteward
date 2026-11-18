import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type InsertnexoOrganization } from '../../../../../../../src/verticals/accounting/adapters/insertnexo/transform/organization'

function makeOrganization(overrides: Partial<InsertnexoOrganization> = {}): InsertnexoOrganization {
  return {
    Id: '1',
    Nazwa: 'insERT SA',
    NazwaPrawna: 'insERT Spółka Akcyjna',
    NIP: '8992616580',
    Waluta: 'PLN',
    Email: 'info@insert.com.pl',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps Id to string id', () => {
    expect(transformOrganization(makeOrganization({ Id: 7 })).id).toBe('7')
  })

  it('maps name from Nazwa', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('insERT SA')
  })

  it('maps legalName from NazwaPrawna', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('insERT Spółka Akcyjna')
  })

  it('maps taxNumber from NIP', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('8992616580')
  })

  it('maps currency from Waluta', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('PLN')
  })

  it('returns undefined name when Nazwa is missing', () => {
    expect(transformOrganization(makeOrganization({ Nazwa: undefined })).name).toBeUndefined()
  })

  it('returns undefined legalName when NazwaPrawna is missing', () => {
    expect(transformOrganization(makeOrganization({ NazwaPrawna: undefined })).legalName).toBeUndefined()
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
