import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FacturadirectaAccount } from '../../../../../../../src/verticals/accounting/adapters/facturadirecta/transform/account'

function makeAccount(overrides: Partial<FacturadirectaAccount> = {}): FacturadirectaAccount {
  return {
    id: 'acc-001',
    code: '4300',
    name: 'Clientes',
    active: true,
    balance: 55000,
    type: 'activo',
    ...overrides,
  }
}

describe('transformAccount (facturadirecta)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Clientes')
    expect(result.customerDefinedCode).toBe('4300')
    expect(result.status).toBe('ACTIVE')
    expect(result.balance).toBe(55000)
  })

  it('maps inactive to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
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
