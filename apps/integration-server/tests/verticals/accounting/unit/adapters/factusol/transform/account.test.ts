import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FactusolAccount } from '../../../../../../../src/verticals/accounting/adapters/factusol/transform/account'

function makeAccount(overrides: Partial<FactusolAccount> = {}): FactusolAccount {
  return {
    id: 'acc-001',
    codigo: '4300',
    nombre: 'Clientes',
    activo: true,
    saldo: 70000,
    tipo: 'activo',
    ...overrides,
  }
}

describe('transformAccount (factusol)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Clientes')
    expect(result.customerDefinedCode).toBe('4300')
    expect(result.status).toBe('ACTIVE')
    expect(result.balance).toBe(70000)
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
