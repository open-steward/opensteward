import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AccountsIQAccount } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/account'

function makeAccount(overrides: Partial<AccountsIQAccount> = {}): AccountsIQAccount {
  return {
    accountId: '200',
    entityId: '10',
    accountCode: '1000',
    accountName: 'Bank Account',
    accountType: 'Asset',
    balance: 25000,
    isActive: true,
    ...overrides,
  }
}

describe('transformAccount (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('200')
    expect(result.name).toBe('Bank Account')
    expect(result.customerDefinedCode).toBe('1000')
    expect(result.balance).toBe(25000)
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Asset account type', () => {
    const result = transformAccount(makeAccount({ accountType: 'Asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps Liability account type', () => {
    const result = transformAccount(makeAccount({ accountType: 'Liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps Equity account type', () => {
    const result = transformAccount(makeAccount({ accountType: 'Equity' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps Income account type', () => {
    const result = transformAccount(makeAccount({ accountType: 'Income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps Expense account type', () => {
    const result = transformAccount(makeAccount({ accountType: 'Expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('falls back to OTHER for unknown account type', () => {
    const result = transformAccount(makeAccount({ accountType: 'Other' }))
    expect(result.type).toBe('OTHER')
  })

  it('maps isActive false to ARCHIVED status', () => {
    const result = transformAccount(makeAccount({ isActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
