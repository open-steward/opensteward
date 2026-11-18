import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type EpsilonNetAccount } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/account'

function makeAccount(overrides: Partial<EpsilonNetAccount> = {}): EpsilonNetAccount {
  return {
    id: '300',
    code: '1000',
    description: 'Cash Account',
    accountType: 'Asset',
    balance: 5000,
    ...overrides,
  }
}

describe('transformAccount (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('300')
    expect(result.name).toBe('Cash Account')
    expect(result.customerDefinedCode).toBe('1000')
    expect(result.balance).toBe(5000)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Asset accountType to ASSET', () => {
    const result = transformAccount(makeAccount({ accountType: 'Asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps Liability accountType to LIABILITY', () => {
    const result = transformAccount(makeAccount({ accountType: 'Liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps Equity accountType to EQUITY', () => {
    const result = transformAccount(makeAccount({ accountType: 'Equity' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps Income accountType to INCOME', () => {
    const result = transformAccount(makeAccount({ accountType: 'Income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps Expense accountType to EXPENSE', () => {
    const result = transformAccount(makeAccount({ accountType: 'Expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps unknown accountType to OTHER', () => {
    const result = transformAccount(makeAccount({ accountType: 'Unknown' }))
    expect(result.type).toBe('OTHER')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
