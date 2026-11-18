import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type IpaidthatAccount } from '../../../../../../../src/verticals/accounting/adapters/ipaidthat/transform/account'

function makeAccount(overrides: Partial<IpaidthatAccount> = {}): IpaidthatAccount {
  return {
    id: '1',
    numero: '401000',
    libelle: 'Fournisseurs',
    actif: true,
    solde: -5000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Fournisseurs')
    expect(result.customerDefinedCode).toBe('401000')
    expect(result.status).toBe('ACTIVE')
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
