import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type DebitoorAccount } from '../../../../../../../src/verticals/accounting/adapters/debitoor/transform/account'

function makeAccount(overrides: Partial<DebitoorAccount> = {}): DebitoorAccount {
  return {
    id: 'acc-001',
    accountNumber: '4300',
    name: 'Trade Debtors',
    isActive: true,
    balance: 30000,
    type: 'asset',
    ...overrides,
  }
}

describe('transformAccount (debitoor)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Trade Debtors')
    expect(result.customerDefinedCode).toBe('4300')
    expect(result.status).toBe('ACTIVE')
    expect(result.balance).toBe(30000)
  })

  it('maps inactive to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ isActive: false })).status).toBe('ARCHIVED')
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
