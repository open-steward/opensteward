import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type CuenticaAccount } from '../../../../../../../src/verticals/accounting/adapters/cuentica/transform/account'

function makeAccount(overrides: Partial<CuenticaAccount> = {}): CuenticaAccount {
  return {
    id: 'acc-001',
    code: '4300',
    name: 'Customers',
    active: true,
    balance: 50000,
    type: 'asset',
    ...overrides,
  }
}

describe('transformAccount (cuentica)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Customers')
    expect(result.customerDefinedCode).toBe('4300')
    expect(result.status).toBe('ACTIVE')
    expect(result.balance).toBe(50000)
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
