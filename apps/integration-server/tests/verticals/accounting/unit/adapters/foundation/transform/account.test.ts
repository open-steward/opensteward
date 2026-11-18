import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FoundationAccount } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/account'

function makeAccount(overrides: Partial<FoundationAccount> = {}): FoundationAccount {
  return {
    AccountNumber: '5000',
    AccountName: 'Cost of Revenue',
    AccountType: 'expense',
    Balance: 15000,
    IsActive: true,
    ...overrides,
  }
}

describe('transformAccount (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('5000')
    expect(result.name).toBe('Cost of Revenue')
    expect(result.customerDefinedCode).toBe('5000')
    expect(result.balance).toBe(15000)
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('maps asset account type', () => {
    expect(transformAccount(makeAccount({ AccountType: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability account type', () => {
    expect(transformAccount(makeAccount({ AccountType: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity account type', () => {
    expect(transformAccount(makeAccount({ AccountType: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income account type', () => {
    expect(transformAccount(makeAccount({ AccountType: 'income' })).type).toBe('INCOME')
  })

  it('maps expense account type', () => {
    expect(transformAccount(makeAccount({ AccountType: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps cost account type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ AccountType: 'cost' })).type).toBe('EXPENSE')
  })

  it('maps unknown account type to OTHER', () => {
    expect(transformAccount(makeAccount({ AccountType: 'unknown' })).type).toBe('OTHER')
  })

  it('maps inactive account to ARCHIVED', () => {
    const result = transformAccount(makeAccount({ IsActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
