import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AnfixAccount } from '../../../../../../../src/verticals/accounting/adapters/anfix/transform/account'

function makeAccount(overrides: Partial<AnfixAccount> = {}): AnfixAccount {
  return {
    id: 'acc-001',
    codigo: '4300',
    nombre: 'Clientes',
    activo: true,
    saldo: 15000,
    tipo: 'activo',
    ...overrides,
  }
}

describe('transformAccount (anfix)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Clientes')
    expect(result.customerDefinedCode).toBe('4300')
    expect(result.status).toBe('ACTIVE')
    expect(result.balance).toBe(15000)
  })

  it('maps inactive account to ARCHIVED', () => {
    const result = transformAccount(makeAccount({ activo: false }))
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
