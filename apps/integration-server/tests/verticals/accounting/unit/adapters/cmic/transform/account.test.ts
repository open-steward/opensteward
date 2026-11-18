import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type CmicAccount } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/account'

function makeAccount(overrides: Partial<CmicAccount> = {}): CmicAccount {
  return {
    AccountId: 'ACCT-001',
    AccountCode: '1200',
    AccountName: 'Accounts Receivable',
    AccountType: 'Asset',
    Balance: 75000,
    IsActive: true,
    ...overrides,
  }
}

describe('transformAccount (CMiC)', () => {
  it('maps id from AccountId', () => {
    expect(transformAccount(makeAccount()).id).toBe('ACCT-001')
  })

  it('maps name and code', () => {
    const result = transformAccount(makeAccount())
    expect(result.name).toBe('Accounts Receivable')
    expect(result.customerDefinedCode).toBe('1200')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(75000)
  })

  it('maps active status', () => {
    expect(transformAccount(makeAccount({ IsActive: true })).status).toBe('ACTIVE')
    expect(transformAccount(makeAccount({ IsActive: false })).status).toBe('ARCHIVED')
  })

  it('maps account type ASSET', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Asset' })).type).toBe('ASSET')
  })

  it('maps account type LIABILITY', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Liability' })).type).toBe('LIABILITY')
  })

  it('maps account type EQUITY', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps account type INCOME', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Revenue' })).type).toBe('INCOME')
  })

  it('maps account type EXPENSE', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Cost' })).type).toBe('EXPENSE')
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
