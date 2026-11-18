import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type BlacklineAccount } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/account'

function makeAccount(overrides: Partial<BlacklineAccount> = {}): BlacklineAccount {
  return {
    accountId: 'acct-001',
    accountCode: '1000',
    accountName: 'Cash and Cash Equivalents',
    accountType: 'Asset',
    balance: 50000,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    modifiedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformAccount (BlackLine)', () => {
  it('maps id from accountId', () => {
    expect(transformAccount(makeAccount()).id).toBe('acct-001')
  })

  it('maps name and code', () => {
    const result = transformAccount(makeAccount())
    expect(result.name).toBe('Cash and Cash Equivalents')
    expect(result.customerDefinedCode).toBe('1000')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(50000)
  })

  it('maps active status', () => {
    expect(transformAccount(makeAccount({ isActive: true })).status).toBe('ACTIVE')
    expect(transformAccount(makeAccount({ isActive: false })).status).toBe('ARCHIVED')
  })

  it('maps account type ASSET', () => {
    expect(transformAccount(makeAccount({ accountType: 'Asset' })).type).toBe('ASSET')
  })

  it('maps account type LIABILITY', () => {
    expect(transformAccount(makeAccount({ accountType: 'Liability' })).type).toBe('LIABILITY')
  })

  it('maps account type EQUITY', () => {
    expect(transformAccount(makeAccount({ accountType: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps account type INCOME', () => {
    expect(transformAccount(makeAccount({ accountType: 'Income' })).type).toBe('INCOME')
  })

  it('maps account type EXPENSE', () => {
    expect(transformAccount(makeAccount({ accountType: 'Expense' })).type).toBe('EXPENSE')
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
