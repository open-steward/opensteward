import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type QBOAccount,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/account'

function makeAccount(overrides: Partial<QBOAccount> = {}): QBOAccount {
  return {
    Id: '90',
    Name: 'Checking Account',
    FullyQualifiedName: 'Checking Account',
    Description: 'Primary bank account',
    AccountType: 'Bank',
    AccountSubType: 'Checking',
    Active: true,
    CurrentBalance: 25000,
    CurrencyRef: { value: 'USD' },
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps Id to id', () => {
    expect(transformAccount(makeAccount()).id).toBe('90')
  })

  it('maps Name to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Checking Account')
  })

  it('maps Description to description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Primary bank account')
  })

  it('maps Bank AccountType to ASSET', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Bank' })).type).toBe('ASSET')
  })

  it('maps Accounts Receivable to ASSET', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Accounts Receivable' })).type).toBe('ASSET')
  })

  it('maps Accounts Payable to LIABILITY', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Accounts Payable' })).type).toBe('LIABILITY')
  })

  it('maps Equity to EQUITY', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps Income to INCOME', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Income' })).type).toBe('INCOME')
  })

  it('maps Expense to EXPENSE', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown AccountType to OTHER', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Unknown' })).type).toBe('OTHER')
  })

  it('maps Active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ Active: true })).status).toBe('ACTIVE')
  })

  it('maps Active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ Active: false })).status).toBe('ARCHIVED')
  })

  it('maps CurrentBalance to balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(25000)
  })

  it('maps CurrencyRef.value to currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('USD')
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
