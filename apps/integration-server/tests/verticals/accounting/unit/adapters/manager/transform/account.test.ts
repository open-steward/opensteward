import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type ManagerAccount,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<ManagerAccount> = {}): ManagerAccount {
  return {
    key: 'acct-key-1',
    code: '1100',
    name: 'Cash at Bank',
    accountType: 'Assets',
    inactive: false,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps key to id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acct-key-1')
  })

  it('maps name and code', () => {
    const result = transformAccount(makeAccount())
    expect(result.name).toBe('Cash at Bank')
    expect(result.customerDefinedCode).toBe('1100')
  })

  it('maps accountType Assets to ASSET via substring match', () => {
    expect(transformAccount(makeAccount({ accountType: 'Assets' })).type).toBe('ASSET')
  })

  it('maps accountType Liabilities to LIABILITY', () => {
    expect(transformAccount(makeAccount({ accountType: 'Liabilities' })).type).toBe('LIABILITY')
  })

  it('maps accountType Equity to EQUITY', () => {
    expect(transformAccount(makeAccount({ accountType: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps accountType Income to INCOME', () => {
    expect(transformAccount(makeAccount({ accountType: 'Income' })).type).toBe('INCOME')
  })

  it('maps accountType Expenses to EXPENSE', () => {
    expect(transformAccount(makeAccount({ accountType: 'Expenses' })).type).toBe('EXPENSE')
  })

  it('maps inactive=false to ACTIVE', () => {
    expect(transformAccount(makeAccount({ inactive: false })).status).toBe('ACTIVE')
  })

  it('maps inactive=true to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ inactive: true })).status).toBe('ARCHIVED')
  })

  it('passes schema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
