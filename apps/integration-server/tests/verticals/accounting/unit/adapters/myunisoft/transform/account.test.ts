import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MyunisoftAccount } from '../../../../../../../src/verticals/accounting/adapters/myunisoft/transform/account'

function makeAccount(overrides: Partial<MyunisoftAccount> = {}): MyunisoftAccount {
  return {
    id: '1',
    numero: '512000',
    libelle: 'Banque',
    actif: true,
    solde: 20000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Banque')
    expect(result.customerDefinedCode).toBe('512000')
    expect(result.balance).toBe(20000)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ actif: false })).status).toBe('ARCHIVED')
  })

  it('metadata identity', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
