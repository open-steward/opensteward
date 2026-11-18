import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ContasimpleAccount } from '../../../../../../../src/verticals/accounting/adapters/contasimple/transform/account'

function makeAccount(overrides: Partial<ContasimpleAccount> = {}): ContasimpleAccount {
  return {
    id: 'acc-001',
    codigo: '4300',
    nombre: 'Clientes',
    activo: true,
    saldo: 25000,
    tipo: 'activo',
    ...overrides,
  }
}

describe('transformAccount (contasimple)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Clientes')
    expect(result.customerDefinedCode).toBe('4300')
    expect(result.status).toBe('ACTIVE')
    expect(result.balance).toBe(25000)
  })

  it('maps inactive to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ activo: false })).status).toBe('ARCHIVED')
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
