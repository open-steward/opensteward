import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type TiimeAccount } from '../../../../../../../src/verticals/accounting/adapters/tiime/transform/account'

function makeAccount(overrides: Partial<TiimeAccount> = {}): TiimeAccount {
  return {
    id: '1',
    numero: '706000',
    libelle: 'Prestations de services',
    actif: true,
    solde: 5000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Prestations de services')
    expect(result.customerDefinedCode).toBe('706000')
    expect(result.balance).toBe(5000)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive account to ARCHIVED', () => {
    const result = transformAccount(makeAccount({ actif: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
