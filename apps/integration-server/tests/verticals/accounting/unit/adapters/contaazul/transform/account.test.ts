import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ContaAzulAccount } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/account'

function makeAccount(overrides: Partial<ContaAzulAccount> = {}): ContaAzulAccount {
  return {
    id: 'acc-001',
    code: '1.1.01',
    name: 'Banco do Brasil',
    description: 'Conta corrente principal',
    active: true,
    balance: 75000,
    type: 'asset',
    parent_id: 'acc-parent',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Banco do Brasil')
    expect(result.description).toBe('Conta corrente principal')
    expect(result.customerDefinedCode).toBe('1.1.01')
    expect(result.balance).toBe(75000)
    expect(result.parentId).toBe('acc-parent')
  })

  it('maps active to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps inactive to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('uses id as customerDefinedCode when code is empty', () => {
    const result = transformAccount(makeAccount({ code: '' }))
    expect(result.customerDefinedCode).toBe('acc-001')
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
